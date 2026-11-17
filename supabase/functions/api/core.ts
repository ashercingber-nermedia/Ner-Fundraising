// Shared helpers: database client, per-organization Stripe, completing donations, receipts, alerts.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.5.0";

export const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function fail(status: number, message: string): never { throw new HttpError(status, message); }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown) => typeof v === "string" && UUID.test(v);
export const clean = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

// Adds months without rolling over (Jan 31 + 1 month = Feb 28, not Mar 3).
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}
export const intervalMonths = (i?: string | null) => (i === "year" ? 12 : i === "quarter" ? 3 : 1);
export const stripeInterval = (i?: string | null) =>
  i === "year" ? { interval: "year" as const } : { interval: "month" as const, interval_count: i === "quarter" ? 3 : 1 };

// What a single charge should be: pledges store the full total and charge total / payments each time.
export function perChargeCents(d: any): number {
  const n = Number(d.recurring_count) || 0;
  const per = d.kind === "pledge" && n > 0 ? Number(d.amount) / n : Number(d.amount);
  return Math.round(per * 100);
}

export async function getOrg(id: string) {
  const { data } = await db.from("organizations").select("*").eq("id", id).maybeSingle();
  return data ?? fail(404, "Organization not found");
}
export async function getSecrets(orgId: string): Promise<any> {
  const { data, error } = await db.rpc("get_org_secrets", { p_org: orgId });
  if (error) throw error;
  return data || {};
}

export const platformStripe = () => {
  const key = Deno.env.get("STRIPE_PLATFORM_SECRET_KEY");
  return key ? new Stripe(key) : fail(400, "The platform Stripe account is not configured yet");
};

// Each organization is charged on ITS OWN Stripe account (so its own nonprofit rate applies):
// either a Connect account onboarded through the platform, or its own API keys.
export async function stripeFor(org: any, secrets?: any) {
  if (org.stripe_own_keys) {
    const s = secrets ?? await getSecrets(org.id);
    if (!s.stripe_secret_key) fail(400, "Card payments are not set up for this organization yet");
    return { stripe: new Stripe(s.stripe_secret_key), opts: undefined as any, publishableKey: org.stripe_publishable_key, stripeAccount: null };
  }
  if (org.stripe_account_id && org.stripe_charges_enabled) {
    return {
      stripe: platformStripe(),
      opts: { stripeAccount: org.stripe_account_id } as any,
      publishableKey: Deno.env.get("STRIPE_PLATFORM_PUBLISHABLE_KEY") || null,
      stripeAccount: org.stripe_account_id as string,
    };
  }
  return fail(400, "Card payments are not set up for this organization yet");
}

// Look a donation up by its id, or by the id it had in the old Base44 app (still referenced by older Stripe subscriptions).
export async function findDonation(ref: string | null | undefined, orgId?: string) {
  if (!ref) return null;
  let q = db.from("donations").select("*");
  q = isUuid(ref) ? q.eq("id", ref) : q.eq("legacy_id", ref);
  if (orgId) q = q.eq("org_id", orgId);
  const { data } = await q.maybeSingle();
  return data;
}

// Name printed on / encoded in the card, when the card provides one.
const PLACEHOLDERS = /^(cardholder\/.*|valued customer|customer|\/)$/i;
export async function getCardholderName(stripe: any, pi: any, opts: any): Promise<string> {
  try {
    const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id;
    if (!chargeId) return "";
    const charge = await stripe.charges.retrieve(chargeId, undefined, opts);
    const name = String(charge.payment_method_details?.card_present?.cardholder_name || charge.billing_details?.name || "")
      .trim().replace(/\s+/g, " ");
    if (!name || PLACEHOLDERS.test(name)) return "";
    if (name.includes("/")) {
      const [last, first] = name.split("/").map((s: string) => s.trim());
      return [first, last].filter(Boolean).join(" ");
    }
    return name;
  } catch { return ""; }
}

// Flips pending -> completed exactly once. Whoever wins sends the receipt and alert; everyone else gets null.
export async function completeDonation(id: string, extra: Record<string, unknown> = {}) {
  const { data } = await db.from("donations").update({ status: "completed", ...extra })
    .eq("id", id).eq("status", "pending").select().maybeSingle();
  if (!data) return null;
  // A paying member who was not on the roster is added to it now, flagged so the office notices.
  if (data.kind === "membership" && !data.member_id && data.campaign_id) {
    const { data: m } = await db.from("members").insert({
      org_id: data.org_id, campaign_id: data.campaign_id, name: data.donor_name || "Member",
      email: data.email || null, phone: data.phone || null, self_added: true,
    }).select("id").maybeSingle();
    if (m) { await db.from("donations").update({ member_id: m.id }).eq("id", data.id); data.member_id = m.id; }
  }
  await afterCompleted(data);
  return data;
}

export async function afterCompleted(donation: any) {
  const org = await getOrg(donation.org_id);
  try { await sendReceipt(donation, org); } catch (e) { console.error("[receipt]", (e as Error).message); }
  try { await sendSmsAlert(donation, org); } catch (e) { console.error("[sms]", (e as Error).message); }
}

// ───────────── Email ─────────────
export async function sendEmail(org: any, to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RECEIPT_FROM_EMAIL");
  if (!key || !from) throw new Error("Email sending is not configured (RESEND_API_KEY / RECEIPT_FROM_EMAIL)");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `${String(org.name).replace(/[<>"]/g, "")} <${from}>`, to: [to], subject, html }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Email provider returned ${res.status}: ${await res.text()}`);
}

export function emailShell(org: any, inner: string): string {
  const brand = org.theme?.brand || "#1a2d5a", gold = org.theme?.accent || "#c9a227";
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#ede8e1;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellspacing="0" cellpadding="0" style="background:#ede8e1;padding:30px 0;"><tr><td align="center">
<table width="600" cellspacing="0" cellpadding="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;">
<tr><td style="background:${brand};padding:36px 40px;text-align:center;">
<h1 style="margin:0;color:#fff;font-size:24px;font-weight:600;">${escapeHtml(org.name)}</h1>
<div style="height:3px;background:${gold};margin:14px auto 0;width:80px;"></div></td></tr>
<tr><td style="padding:40px;">${inner}</td></tr>
<tr><td style="background:${brand};padding:20px 40px;text-align:center;">
<p style="margin:0;color:${gold};font-size:12px;">${escapeHtml(org.name)}${org.address ? " • " + escapeHtml(org.address) : ""}</p></td></tr>
</table></td></tr></table></body></html>`;
}

function receiptNumber(d: any, org: any): string {
  if (d.receipt_number) return d.receipt_number;
  const date = new Date(d.created_at || Date.now());
  const ymd = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  return `${org.receipt_prefix || "RCPT"}-${ymd}-${String(d.legacy_id || d.id).replace(/-/g, "").slice(-6).toUpperCase()}`;
}

async function receiptHtml(d: any, org: any, number: string): Promise<string> {
  const row = (k: string, v: string) =>
    `<tr><td style="padding:10px 0;color:#5a5a5a;border-bottom:1px solid #eee;font-size:14px;">${k}</td><td style="padding:10px 0;color:#1a2d5a;font-weight:500;text-align:right;border-bottom:1px solid #eee;font-size:14px;">${v}</td></tr>`;
  const source = d.donation_source === "credit_card" ? "Credit Card" : d.donation_source === "ojc_donors_fund" ? "Donors Fund" : "Cash";
  const every = d.recurring_interval === "year" ? "yearly" : d.recurring_interval === "quarter" ? "quarterly" : "monthly";
  const type = d.kind === "membership" ? `Membership (${every})`
    : d.kind === "pledge" ? `Recurring (${d.recurring_count} ${every} payments)` : "One-Time";
  let campaign = "";
  if (d.campaign_id) {
    const { data } = await db.from("campaigns").select("name").eq("id", d.campaign_id).maybeSingle();
    campaign = data?.name || "";
  }
  const dedication = d.dedication_type && d.dedication_type !== "none" && d.dedication_message
    ? row("Dedication", (d.dedication_type === "in_honor" ? "In Honor Of: " : d.dedication_type === "in_memory" ? "In Memory Of: " : "") + escapeHtml(d.dedication_message))
    : "";
  const date = new Date(d.created_at || Date.now()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "America/New_York" });
  return emailShell(org, `
<p style="margin:0 0 16px;color:#1a2d5a;font-size:20px;font-weight:600;">Thank you, ${escapeHtml(d.donor_name || "Friend")}!</p>
<p style="margin:0 0 24px;color:#5a5a5a;font-size:15px;line-height:1.65;">Your generous support is deeply appreciated. Please keep this receipt for your records.</p>
<table width="100%" cellspacing="0" cellpadding="0">
${row("Receipt #", escapeHtml(number))}${row("Date", date)}${row("Amount", `<strong>${money(Number(d.amount))}</strong>`)}
${row("Payment Method", source)}${row("Type", type)}${campaign ? row("Campaign", escapeHtml(campaign)) : ""}${d.ticket_number ? row("Raffle Ticket", `#${d.ticket_number}`) : ""}${dedication}
</table>
<p style="margin:24px 0 0;color:#888;font-size:12px;line-height:1.6;">${escapeHtml(org.legal_name || org.name)}${org.tax_id ? " • Tax ID: " + escapeHtml(org.tax_id) : ""}. No goods or services were provided in exchange for this contribution unless noted otherwise.</p>`);
}

// Automatic sends happen once (claimed atomically, so two triggers can't both send). Admins can force a resend.
export async function sendReceipt(d: any, org: any, o: { force?: boolean; overrideEmail?: string } = {}) {
  const to = clean(o.overrideEmail || d.email, 320);
  if (!to) return { skipped: "No donor email" };
  const number = receiptNumber(d, org);
  if (!o.force) {
    const { data: claimed } = await db.from("donations").update({ receipt_sent: true, receipt_number: number })
      .eq("id", d.id).eq("receipt_sent", false).select("id").maybeSingle();
    if (!claimed) return { skipped: "Receipt already sent" };
  }
  try {
    await sendEmail(org, to, `Your Donation Receipt #${number} - ${org.name}`, await receiptHtml(d, org, number));
  } catch (e) {
    if (!o.force) await db.from("donations").update({ receipt_sent: false }).eq("id", d.id);
    throw e;
  }
  await db.from("donations").update({ receipt_sent: true, receipt_sent_at: new Date().toISOString(), receipt_number: number }).eq("id", d.id);
  return { success: true, receiptNumber: number, sentTo: to };
}

// ───────────── Text alert to the organization when an online card donation lands ─────────────
export async function sendSmsAlert(d: any, org: any) {
  if (d.donation_source !== "credit_card" || d.is_recurring_renewal) return;
  const secrets = await getSecrets(org.id);
  if (!secrets.connext_api_key) return;
  const { data: claimed } = await db.from("donations").update({ sms_sent: true })
    .eq("id", d.id).eq("sms_sent", false).select("id").maybeSingle();
  if (!claimed) return;
  try {
    const donor = String(d.donor_name || "").replace(/[^\p{L}\p{N} .,'&-]/gu, "").trim().slice(0, 40) || "Unknown donor";
    const res = await fetch("https://api.connext.ms/api/v1/blasts/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${secrets.connext_api_key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ types: ["sms"], groups: [secrets.connext_group || 1], message: `Website: ${money(Number(d.amount))} came in to ${org.name} from ${donor}` }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Connext returned ${res.status}: ${await res.text()}`);
  } catch (e) {
    await db.from("donations").update({ sms_sent: false }).eq("id", d.id);
    throw e;
  }
}

// ───────────── Stripe pieces shared by the API and the webhook ─────────────
export function stripeMetadata(d: any, campaignName: string) {
  return {
    donation_id: d.id,
    original_donation_id: d.id,
    org_id: d.org_id,
    donor_name: clean(d.donor_name, 500),
    donor_email: clean(d.email, 500),
    donor_phone: clean(d.phone, 500),
    campaign: clean(campaignName, 500),
    kind: d.kind,
    is_recurring: String(!!d.is_recurring),
    recurring_months: String(d.recurring_count || ""),
    recurring_interval: d.recurring_interval || "",
    dedication: clean(d.dedication_message, 500),
  };
}

// Pledges stop after the agreed number of payments: cancel one day after the last one is due.
export function pledgeCancelAt(firstChargeAfter: Date, remainingPayments: number, interval?: string | null): number {
  const last = addMonths(firstChargeAfter, (remainingPayments - 1) * intervalMonths(interval));
  return Math.floor(last.getTime() / 1000) + 86400;
}

// After a recurring pledge is charged on the card reader, turn the saved card into a subscription
// for the remaining payments. Safe to call more than once per payment.
export async function setupReaderSubscription(stripe: any, opts: any, org: any, paymentIntentId: string) {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] }, opts);
  const meta = pi.metadata || {};
  const count = parseInt(meta.recurring_months || "0", 10);
  const membership = meta.kind === "membership";
  if (pi.status !== "succeeded" || meta.is_recurring !== "true" || (!membership && !(count > 1))) return { recurring: false };
  if (meta.subscription_id) {
    return { recurring: true, subscriptionId: meta.subscription_id, nextChargeDate: meta.next_charge_date, remainingMonths: membership ? null : count - 1 };
  }
  // Phone wallets (Apple Pay / Google Pay) can't be saved — the donor needs a setup link instead
  const generatedCard = pi.latest_charge?.payment_method_details?.card_present?.generated_card;
  if (!pi.customer || !generatedCard) return { recurring: true, needsSetupLink: true };

  const interval = meta.recurring_interval || "month";
  const nextCharge = addMonths(new Date(pi.latest_charge.created * 1000), intervalMonths(interval));
  const product = await stripe.products.create(
    { name: `Recurring donation to ${org.name}` }, { ...opts, idempotencyKey: `reader-product-${pi.id}` });
  const subscription = await stripe.subscriptions.create({
    customer: pi.customer,
    items: [{ price_data: { currency: "usd", product: product.id, unit_amount: pi.amount_received, recurring: stripeInterval(interval) } }],
    default_payment_method: generatedCard,
    billing_cycle_anchor: Math.floor(nextCharge.getTime() / 1000),
    proration_behavior: "none",
    ...(membership ? {} : { cancel_at: pledgeCancelAt(nextCharge, count - 1, interval) }),
    metadata: { ...meta, from_reader: "true" },
  }, { ...opts, idempotencyKey: `reader-sub-${pi.id}` });
  await stripe.paymentIntents.update(pi.id, { metadata: { subscription_id: subscription.id, next_charge_date: nextCharge.toISOString() } }, opts);
  if (isUuid(meta.donation_id)) {
    await db.from("donations").update({ stripe_subscription_id: subscription.id, ...(membership ? { membership_status: "active" } : {}) }).eq("id", meta.donation_id);
  }
  return { recurring: true, subscriptionId: subscription.id, nextChargeDate: nextCharge.toISOString(), remainingMonths: membership ? null : count - 1 };
}
