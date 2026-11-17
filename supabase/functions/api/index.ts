// Ner Media fundraising API. One function; the browser posts { action, ... }.
// Donors never write to the database directly — every donation is created and completed here.
import {
  addMonths, clean, completeDonation, db, emailShell, escapeHtml, fail, findDonation, getCardholderName, getOrg,
  getSecrets, HttpError, intervalMonths, isUuid, money, perChargeCents, platformStripe, pledgeCancelAt, sendEmail,
  sendReceipt, setupReaderSubscription, stripeFor, stripeInterval, stripeMetadata,
} from "./core.ts";
import { handleWebhook } from "./webhook.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  try {
    if (url.pathname.endsWith("/stripe-webhook")) return await handleWebhook(req, url);
    const body = await req.json().catch(() => ({}));
    const handler = actions[String(body.action)];
    if (!handler) fail(400, "Unknown action");
    return json(await handler(body, req));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error("[api]", (e as Error).message);
    return json({ error: (e as Error).message || "Something went wrong" }, status);
  }
});

// ───────────── Who is calling ─────────────
async function userOf(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (token.split(".").length !== 3) return null;
  const { data } = await db.auth.getUser(token);
  return data?.user ?? null;
}
async function isAdmin(userId: string, orgId: string) {
  const [{ data: p }, { data: m }] = await Promise.all([
    db.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
    db.from("org_members").select("user_id").eq("user_id", userId).eq("org_id", orgId).maybeSingle(),
  ]);
  return !!(p || m);
}
async function requireAdmin(req: Request, orgId: string) {
  const user = await userOf(req);
  if (!user) fail(401, "Please sign in");
  if (!(await isAdmin(user.id, orgId))) fail(403, "Admin access required");
  return user;
}
async function requirePlatformAdmin(req: Request) {
  const user = await userOf(req);
  if (!user) fail(401, "Please sign in");
  const { data } = await db.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!data) fail(403, "Ner Media owner access required");
  return user;
}
// Admins, or a kiosk tablet holding the organization's kiosk key.
async function requireStaff(req: Request, orgId: string, kioskKey?: unknown) {
  if (kioskKey) {
    const s = await getSecrets(orgId);
    if (s.kiosk_key && String(kioskKey) === s.kiosk_key) return;
    fail(403, "This kiosk link is no longer valid");
  }
  await requireAdmin(req, orgId);
}

const PLATFORM_DOMAIN = (Deno.env.get("PLATFORM_DOMAIN") || "nermediagroup.com").toLowerCase();
const PLATFORM_HOME = `https://give.${PLATFORM_DOMAIN}`;
const orgHome = (org: any) => `https://${org.slug}.${PLATFORM_DOMAIN}`;
// Addresses that belong to the platform itself (signup page, testing copies).
function isPlatformHost(host: string) {
  const extra = (Deno.env.get("PLATFORM_HOSTS") || "").split(",").map((h) => h.trim()).filter(Boolean);
  return host === `give.${PLATFORM_DOMAIN}` || host.endsWith(".workers.dev") || host === "localhost" || extra.includes(host);
}
function hostAllowed(host: string, org: any | null) {
  if (isPlatformHost(host)) return true;
  if (!org) return false;
  return host === `${org.slug}.${PLATFORM_DOMAIN}` || (org.domains || []).includes(host);
}
// Only send people back to this organization's own site (or the platform's).
function safeReturnUrl(value: unknown, _req: Request, org: any | null): string {
  try {
    const u = new URL(String(value));
    if ((u.protocol === "https:" || u.hostname === "localhost") && hostAllowed(u.hostname, org)) return u.toString();
  } catch { /* fall through */ }
  return fail(400, "Invalid return URL");
}
function slugify(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
}
async function slugStatus(slug: string): Promise<{ ok: boolean; reason?: string }> {
  if (!/^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$/.test(slug)) return { ok: false, reason: "Use 3 to 40 letters, numbers or dashes" };
  const { data: reserved } = await db.rpc("is_reserved_slug", { p_slug: slug });
  if (reserved) return { ok: false, reason: "That address is reserved" };
  // An unclaimed signup holds its name for 2 days, then the name is free again.
  await db.from("organizations").delete().eq("slug", slug).eq("status", "pending").lt("created_at", new Date(Date.now() - 2 * 86400000).toISOString());
  const { data } = await db.from("organizations").select("id").eq("slug", slug).maybeSingle();
  return data ? { ok: false, reason: "That address is already taken" } : { ok: true };
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Sends a one-click sign-in email (branded, through Resend). Falls back to Supabase's own email if Resend isn't set up.
async function sendLoginLink(email: string, redirectTo: string, intro: { name?: string; heading: string; body: string }) {
  const allowed = await db.rpc("login_link_allowed", { p_email: email });
  if (allowed.data === false) fail(429, "Too many sign-in emails were sent to this address. Please try again in an hour.");
  if (!Deno.env.get("RESEND_API_KEY") || !Deno.env.get("RECEIPT_FROM_EMAIL")) return { fallback: true };
  // Make sure the account exists, then make a sign-in link for it
  await db.auth.admin.createUser({ email, email_confirm: false }).catch(() => null);
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });
  if (error || !data?.properties?.action_link) return { fallback: true };
  const link = data.properties.action_link;
  // Platform emails (signup, owner sign-in) carry the Ner Media logo; an organization's admin sign-in uses its own name.
  const fakeOrg = intro.name && intro.name !== "Ner Media"
    ? { name: intro.name, address: "", theme: {} }
    : { name: "Ner Media", address: "nermediagroup.com", theme: { brand: "#0E1B2C", accent: "#F2A93B" }, headerImage: `${PLATFORM_HOME}/brand/ner-media-email-header.png` };
  await sendEmail(fakeOrg, email, intro.heading, emailShell(fakeOrg, `
<p style="margin:0 0 16px;color:#1a2d5a;font-size:20px;font-weight:600;">${escapeHtml(intro.heading)}</p>
<p style="margin:0 0 24px;color:#5a5a5a;font-size:15px;line-height:1.65;">${escapeHtml(intro.body)}</p>
<div style="text-align:center;margin:28px 0;"><a href="${link}" style="display:inline-block;background:#c9a227;color:#1a2d5a;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Sign in</a></div>
<p style="margin:24px 0 0;color:#888;font-size:12px;line-height:1.6;">This link works once and expires in an hour. If you didn't ask for it, you can ignore this email.<br/>Fundraising sites by Ner Media · nermediagroup.com</p>`));
  return { sent: true };
}

async function getCampaign(id: unknown) {
  if (!isUuid(id)) fail(400, "Missing campaign");
  const { data } = await db.from("campaigns").select("*").eq("id", id).maybeSingle();
  return data ?? fail(404, "Campaign not found");
}
async function pendingDonation(id: unknown) {
  if (!isUuid(id)) fail(400, "Missing donation");
  const d = await findDonation(id as string);
  if (!d) fail(404, "Donation not found");
  return d;
}
// Raffle tickets are numbered 1..N and the number is the dollar amount. Returns the unsold numbers.
async function unsoldTickets(campaign: any): Promise<number[]> {
  const n = Number(campaign.ticket_count) || 0;
  const { data } = await db.from("donations").select("ticket_number").eq("campaign_id", campaign.id)
    .not("ticket_number", "is", null).neq("status", "cancelled");
  const taken = new Set((data || []).map((r: any) => r.ticket_number));
  const left: number[] = [];
  for (let i = 1; i <= n; i++) if (!taken.has(i)) left.push(i);
  return left;
}
const MIN_MONTHLY = 25, MAX_MONTHS = 12;
// How a ticket is paid off: equal monthly payments, never under $25, never more than 12 months.
// `monthly` is what the donor chose before spinning (empty = pay in full).
function paymentPlan(amount: number, monthly: number | null) {
  const cents = Math.round(amount * 100);
  let months = 1;
  if (monthly && monthly >= MIN_MONTHLY) months = Math.min(Math.ceil(amount / monthly), Math.floor(amount / MIN_MONTHLY), MAX_MONTHS);
  if (months < 2) return { months: 1, firstCents: cents, perCents: cents };
  const perCents = Math.floor(cents / months);
  return { months, perCents, firstCents: cents - perCents * (months - 1) }; // any leftover pennies go on the first payment
}
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
function token(bytes = 24) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function randomUnit() {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] / 2 ** 32;
}

// ───────────── Payments ─────────────
async function createCheckout(org: any, d: any, campaign: any, successUrl: string, cancelUrl: string) {
  const { stripe, opts } = await stripeFor(org);
  const metadata = stripeMetadata(d, campaign?.name || "");
  const description = d.dedication_type !== "none" && d.dedication_message
    ? `${d.dedication_type}: ${d.dedication_message}`.slice(0, 300) : `Support ${org.name}`;
  const params: any = {
    payment_method_types: ["card"],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    customer_email: d.email || undefined,
  };
  if (d.is_recurring) {
    const product = await stripe.products.create({
      name: d.kind === "membership" ? `${campaign?.name || "Membership"} — ${org.name}` : `Recurring donation to ${org.name}`,
    }, opts);
    params.mode = "subscription";
    params.line_items = [{
      price_data: { currency: "usd", product: product.id, unit_amount: perChargeCents(d), recurring: stripeInterval(d.recurring_interval) },
      quantity: 1,
    }];
    params.subscription_data = { metadata, description };
  } else {
    params.mode = "payment";
    params.line_items = [{
      price_data: { currency: "usd", product_data: { name: `Donation to ${org.name}`, description }, unit_amount: perChargeCents(d) },
      quantity: 1,
    }];
    // Spin raffle: hold the highest ticket now, capture only the ticket the spin lands on.
    // If the donor asked to pay monthly, the card is also saved for the later payments.
    params.payment_intent_data = {
      metadata,
      ...(d.awaiting_spin ? { capture_method: "manual" } : {}),
      ...(d.awaiting_spin && d.spin_monthly ? { setup_future_usage: "off_session" } : {}),
    };
    if (d.awaiting_spin && d.spin_monthly) params.customer_creation = "always";
  }
  const session = await stripe.checkout.sessions.create(params, opts);
  await db.from("donations").update({ stripe_checkout_session_id: session.id }).eq("id", d.id);
  return { url: session.url };
}

// Donors Fund keys: the organization's own, or Ner Media's platform key (charges go to the org by its tax ID).
function donorsFundKeys(s: any) {
  const own = s.donors_fund_api_key && s.donors_fund_validation_token;
  return {
    apiKey: own ? s.donors_fund_api_key : Deno.env.get("DONORS_FUND_API_KEY"),
    token: own ? s.donors_fund_validation_token : Deno.env.get("DONORS_FUND_VALIDATION_TOKEN"),
    account: s.donors_fund_account_number || Deno.env.get("DONORS_FUND_ACCOUNT_NUMBER"),
  };
}
async function payDonorsFund(org: any, d: any, campaign: any, donor: string, authorization: string) {
  const s0 = await getSecrets(org.id);
  const k = donorsFundKeys(s0);
  const s = { donors_fund_api_key: k.apiKey, donors_fund_validation_token: k.token, donors_fund_account_number: k.account };
  if (!org.donors_fund_enabled || !s.donors_fund_api_key || !s.donors_fund_validation_token || !s.donors_fund_account_number || !org.tax_id) {
    fail(400, "Donors Fund is not set up for this organization");
  }
  await db.from("donations").update({ donation_source: "ojc_donors_fund" }).eq("id", d.id);
  const body: any = {
    taxId: String(org.tax_id).replace(/-/g, ""),
    accountNumber: s.donors_fund_account_number,
    amount: (perChargeCents(d) / 100).toString(),
    donor,
    donorAuthorization: authorization,
    purposeType: "Other",
    purposeNote: `${org.receipt_prefix}-${String(campaign?.slug || "main").replace(/[^A-Za-z0-9]/g, "")}-${d.id.slice(0, 8)}`,
  };
  if (d.kind === "pledge" && Number(d.recurring_count) > 1) {
    body.recurring = {
      scheduleType: d.recurring_interval === "quarter" ? "quarterly" : d.recurring_interval === "year" ? "yearly" : "monthly",
      startDate: new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" }),
      numberOfPayments: Number(d.recurring_count),
    };
  }
  let result: any;
  try {
    const res = await fetch("https://api.thedonorsfund.org/thedonorsfund/integration/create", {
      method: "POST",
      headers: { "API-Key": s.donors_fund_api_key, "Validation-Token": s.donors_fund_validation_token, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    result = await res.json();
  } catch (e) {
    // We don't know whether the charge went through — leave it pending and flag it for a person to check.
    await db.from("donations").update({ notes: "Donors Fund did not answer in time. Check the Donors Fund portal before retrying or marking this paid." }).eq("id", d.id);
    console.error("[donors fund]", (e as Error).message);
    fail(504, "The Donors Fund did not respond. Please check with the office before trying again so you are not charged twice.");
  }
  if (result?.errorCode === 0 && result.data) {
    await completeDonation(d.id, { donation_source: "ojc_donors_fund", notes: `Donors Fund confirmation ${result.data.confirmationNumber || ""}`.trim() });
    return { success: true, confirmationNumber: result.data.confirmationNumber, transactionId: result.data.transactionId };
  }
  await db.from("donations").update({ status: "cancelled" }).eq("id", d.id).eq("status", "pending");
  return fail(400, result?.error || "Donors Fund payment failed");
}

// Matches a membership payment to the roster (kiosk pick, else email / phone / exact name).
async function resolveMember(campaign: any, b: any, name: string, email: string, phone: string) {
  const { data: roster } = await db.from("members").select("id,name,email,phone").eq("campaign_id", campaign.id);
  const list = roster || [];
  if (isUuid(b.member_id)) {
    const m = list.find((x: any) => x.id === b.member_id);
    if (m) return m.id;
  }
  const p = digits(phone).slice(-10);
  const found = list.find((m: any) =>
    (email && m.email && m.email.toLowerCase() === email.toLowerCase()) ||
    (p.length === 10 && digits(m.phone).slice(-10) === p) ||
    m.name.trim().toLowerCase() === name.toLowerCase());
  // Not on the roster: they are added (flagged) only once their payment actually goes through — see completeDonation.
  return found ? found.id : null;
}

const actions: Record<string, (b: any, req: Request) => Promise<unknown>> = {
  // ── Self-serve signup ──
  async check_slug(b) {
    const slug = slugify(clean(b.slug || b.name, 80));
    if (!slug) return { slug, available: false, reason: "Type your organization's name" };
    const st = await slugStatus(slug);
    return { slug, available: st.ok, reason: st.reason, url: `${slug}.${PLATFORM_DOMAIN}` };
  },

  // Creates a free site right away (on hold until the owner clicks the link in their email).
  async create_org(b) {
    const name = clean(b.name, 80).replace(/\s+/g, " ");
    const email = clean(b.email, 320).toLowerCase();
    const slug = slugify(clean(b.slug || name, 80));
    if (name.length < 3) fail(400, "Please enter your organization's name");
    if (!EMAIL_RE.test(email)) fail(400, "Please enter a valid email");
    const { count } = await db.from("organizations").select("id", { count: "exact", head: true }).eq("owner_email", email).eq("status", "pending");
    if ((count || 0) >= 3) fail(429, "You already have sites waiting for you. Check your email for the sign-in link.");
    const st = await slugStatus(slug);
    if (!st.ok) fail(400, st.reason || "That address is not available");

    const { data: org, error } = await db.from("organizations").insert({
      slug, name, legal_name: name, owner_email: email, status: "pending",
      receipt_prefix: (name.split(" ").map((w) => w[0]).join("").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4) || "RCPT"),
    }).select().single();
    if (error) fail(400, error.code === "23505" ? "That address is already taken" : error.message);
    await db.from("campaigns").insert({
      org_id: org.id, slug: "general", name: "General Fund", type: "regular", is_default: true,
      goal_amount: 0, headline: `Please join us in supporting ${name}.`,
    });
    await db.from("org_invites").insert({ org_id: org.id, email });
    const sent = await sendLoginLink(email, `${orgHome(org)}/admin/setup`, {
      name: "Ner Media",
      heading: `Your fundraising site for ${name} is ready`,
      body: `Click below to sign in and finish setting up ${slug}.${PLATFORM_DOMAIN}: add your logo, photos and description, and connect Stripe so donations go straight to your organization.`,
    });
    return { slug, url: orgHome(org), redirect: `${orgHome(org)}/admin/setup`, ...sent };
  },

  // Sign-in link for admins (and the platform owner).
  async send_login_link(b) {
    const email = clean(b.email, 320).toLowerCase();
    if (!EMAIL_RE.test(email)) fail(400, "Please enter a valid email");
    let org = null;
    if (b.org_slug) {
      const { data } = await db.from("organizations").select("*").eq("slug", clean(b.org_slug, 80)).maybeSingle();
      org = data;
    }
    const redirect = safeReturnUrl(b.redirect, new Request("http://x"), org);
    return await sendLoginLink(email, redirect, {
      name: org?.name || "Ner Media",
      heading: `Sign in to ${org?.name || "Ner Media"}`,
      body: "Click below to sign in to your fundraising site's admin.",
    });
  },

  // What is configured on the platform (no secrets, just yes/no).
  async health() {
    return {
      email: !!(Deno.env.get("RESEND_API_KEY") && Deno.env.get("RECEIPT_FROM_EMAIL")),
      stripe_platform: !!Deno.env.get("STRIPE_PLATFORM_SECRET_KEY"),
      stripe_webhook: !!Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET"),
      donors_fund_platform: !!(Deno.env.get("DONORS_FUND_API_KEY") && Deno.env.get("DONORS_FUND_VALIDATION_TOKEN")),
      domain: PLATFORM_DOMAIN,
    };
  },

  // ── Ner Media owner page ──
  async platform_orgs(_b, req) {
    await requirePlatformAdmin(req);
    const { data: orgs } = await db.from("organizations").select("id, slug, name, status, plan, raffle_enabled, owner_email, stripe_account_id, stripe_charges_enabled, stripe_own_keys, donors_fund_enabled, domains, created_at").order("created_at", { ascending: false });
    const { data: totals } = await db.from("donations").select("org_id, amount").eq("status", "completed");
    const sum: Record<string, number> = {};
    for (const t of totals || []) sum[t.org_id] = (sum[t.org_id] || 0) + Number(t.amount);
    return { orgs: (orgs || []).map((o: any) => ({ ...o, raised: sum[o.id] || 0, url: orgHome(o) })), domain: PLATFORM_DOMAIN };
  },
  async platform_set(b, req) {
    await requirePlatformAdmin(req);
    if (!isUuid(b.org_id)) fail(400, "Missing organization");
    const patch: any = {};
    if (typeof b.raffle_enabled === "boolean") patch.raffle_enabled = b.raffle_enabled;
    if (["free", "pro"].includes(b.plan)) patch.plan = b.plan;
    if (["active", "suspended"].includes(b.status)) patch.status = b.status;
    if (Array.isArray(b.domains)) patch.domains = b.domains.map((d: unknown) => clean(d, 120).toLowerCase()).filter(Boolean);
    const { error } = await db.from("organizations").update(patch).eq("id", b.org_id);
    if (error) throw error;
    return { success: true };
  },

  // ── Step 1 for every donation: create it as pending, with the amount decided by the server's rules ──
  async start_donation(b) {
    const campaign = await getCampaign(b.campaign_id);
    if (!campaign.is_active) fail(400, "This campaign is closed");
    const { data: owner } = await db.from("organizations").select("status, raffle_enabled").eq("id", campaign.org_id).single();
    if (owner?.status !== "active") fail(400, "This site is not open for donations yet");
    if (campaign.type === "spin_raffle" && !owner.raffle_enabled) fail(400, "This raffle is not available");
    const name = clean(b.donor_name, 120);
    const email = clean(b.email, 320);
    const phone = clean(b.phone, 40);
    if (!name) fail(400, "Please enter your name");
    if (email && !/^\S+@\S+\.\S+$/.test(email)) fail(400, "Please enter a valid email");
    const anonymous = !!b.is_anonymous;
    const dedicationType = ["custom", "in_honor", "in_memory"].includes(b.dedication_type) ? b.dedication_type : "none";

    const row: any = {
      org_id: campaign.org_id,
      campaign_id: campaign.id,
      donor_name: name,
      display_name: anonymous ? "Anonymous" : clean(b.display_name, 120) || name,
      email, phone,
      is_anonymous: anonymous,
      dedication_type: dedicationType,
      dedication_message: dedicationType === "none" ? "" : clean(b.dedication_message, 300),
      donation_type: "credit_card",
      donation_source: "credit_card",
      status: "pending",
    };

    if (campaign.type === "membership") {
      const { data: tier } = await db.from("membership_tiers").select("*").eq("id", isUuid(b.tier_id) ? b.tier_id : null)
        .eq("campaign_id", campaign.id).eq("is_active", true).maybeSingle();
      if (!tier) fail(400, "Please choose a membership level");
      const yearly = b.tier_period === "year";
      const amount = Number(yearly ? tier.yearly_amount : tier.monthly_amount);
      if (!(amount > 0)) fail(400, "That billing option is not available for this level");
      Object.assign(row, {
        kind: "membership", amount, is_recurring: true, recurring_interval: yearly ? "year" : "month",
        membership_tier_id: tier.id, member_id: await resolveMember(campaign, b, name, email, phone),
      });
    } else if (campaign.type === "spin_raffle") {
      if (!(Number(campaign.ticket_count) >= 2)) fail(400, "This raffle has no tickets set up yet");
      if (campaign.raffle_winner) fail(400, "This raffle has already been drawn");
      if (!email && !phone) fail(400, "Please enter a phone number or email so we can reach you if you win");
      const left = await unsoldTickets(campaign);
      if (!left.length) fail(400, "Every ticket has been sold. Thank you!");
      const top = left[left.length - 1];
      let monthly: number | null = null;
      if (b.monthly != null && b.monthly !== "") {
        monthly = Math.round(Number(b.monthly) * 100) / 100;
        const least = Math.max(MIN_MONTHLY, Math.ceil(top / MAX_MONTHS));
        if (!(monthly >= least)) fail(400, `Monthly payments must be at least $${least} so any ticket is paid off within ${MAX_MONTHS} months`);
      }
      // Stored (and authorized) as the highest unsold ticket until the spin replaces it with the real one.
      Object.assign(row, { kind: "one_time", amount: top, awaiting_spin: true, spin_monthly: monthly });
    } else {
      const amount = Math.round(Number(b.amount) * 100) / 100;
      if (!(amount >= 1) || amount > 1_000_000) fail(400, "Please enter a donation amount");
      const frequency = ["month", "quarter", "year"].includes(b.frequency) ? b.frequency : "one_time";
      if (frequency === "one_time") {
        Object.assign(row, { kind: "one_time", amount });
      } else {
        if (!campaign.allow_recurring) fail(400, "Recurring donations are not available for this campaign");
        const count = Math.floor(Number(b.count));
        if (!(count >= 2) || count > 120) fail(400, "Please enter how many payments (2 or more)");
        // The full pledge is recorded up front; each charge is amount / count.
        Object.assign(row, { kind: "pledge", amount: amount * count, is_recurring: true, recurring_interval: frequency, recurring_count: count });
      }
    }
    const { data, error } = await db.from("donations").insert(row).select("id, amount, kind, awaiting_spin").single();
    if (error) throw error;
    return { donation_id: data.id, amount: Number(data.amount), awaiting_spin: data.awaiting_spin };
  },

  // ── Step 2 online: Stripe checkout page, or The Donors Fund ──
  async pay(b, req) {
    const d = await pendingDonation(b.donation_id);
    if (d.status !== "pending" || d.ticket_number) fail(400, "This donation is not waiting for payment");
    const org = await getOrg(d.org_id);
    const { data: campaign } = d.campaign_id ? await db.from("campaigns").select("*").eq("id", d.campaign_id).maybeSingle() : { data: null };
    if (b.method === "daf") {
      if (d.awaiting_spin) fail(400, "The spin raffle accepts cards only");
      if (d.kind === "membership") fail(400, "Memberships are paid by card");
      const donor = clean(b.daf_donor, 40), auth = clean(b.daf_authorization, 20);
      if (!donor || !auth) fail(400, "Please enter your Donors Fund card number and CVV/PIN");
      return await payDonorsFund(org, d, campaign, donor, auth);
    }
    return await createCheckout(org, d, campaign, safeReturnUrl(b.success_url, req, org), safeReturnUrl(b.cancel_url, req, org));
  },

  // ── Spin raffle: once the card is authorized, the server hands out a random unsold ticket and charges for it ──
  async spin(b) {
    const d0 = await pendingDonation(b.donation_id);
    if (!d0.awaiting_spin) fail(400, "This donation is not a raffle spin");
    const campaign = await getCampaign(d0.campaign_id);
    const answer = (d: any, plan: any) => ({
      number: d.ticket_number, amount: Number(d.amount), months: plan.months,
      first: plan.firstCents / 100, monthly: plan.perCents / 100, tickets: campaign.ticket_count,
    });
    const planOf = (d: any) => {
      const cents = Math.round(Number(d.amount) * 100), months = d.kind === "pledge" ? Number(d.recurring_count) || 1 : 1;
      const perCents = Math.floor(cents / months);
      return { months, perCents, firstCents: cents - perCents * (months - 1) };
    };
    if (d0.status === "completed") return answer(d0, planOf(d0));
    if (d0.status !== "pending") fail(400, "This donation was cancelled");

    const org = await getOrg(d0.org_id);
    const { stripe, opts } = await stripeFor(org);
    let piId = d0.stripe_payment_intent_id;
    if (!piId && d0.stripe_checkout_session_id) {
      const session = await stripe.checkout.sessions.retrieve(d0.stripe_checkout_session_id, undefined, opts);
      piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    }
    if (!piId) fail(400, "Please authorize your card first");
    const pi: any = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] }, opts);
    if (pi.metadata?.donation_id !== d0.id) fail(400, "Payment does not match this donation");
    if (pi.status === "succeeded" && d0.ticket_number) {
      // The charge already went through on an earlier press; just finish up.
      await completeDonation(d0.id, { stripe_payment_intent_id: piId });
      return answer(d0, planOf(d0));
    }
    if (pi.status !== "requires_capture") fail(400, "Please authorize your card first");

    // One random unsold number, never above what the card was authorized for. The database guarantees no number is given twice.
    const { data: number, error } = await db.rpc("claim_ticket", { p_donation: d0.id, p_max: Math.floor(pi.amount_capturable / 100) });
    if (error) throw error;
    if (!number) fail(400, "Every ticket has been sold. Your card was not charged.");

    // A card can be charged again later only if Stripe saved it (phone wallets on the reader can't be).
    const customer = typeof pi.customer === "string" ? pi.customer : pi.customer?.id;
    const onReader = !!pi.payment_method_types?.includes("card_present");
    const wallet = !!pi.latest_charge?.payment_method_details?.card_present?.wallet?.type;
    const plan = paymentPlan(number, customer && !(onReader && wallet) ? Number(d0.spin_monthly) || null : null);
    const split = plan.months > 1;
    try {
      await db.from("donations").update({
        stripe_payment_intent_id: piId,
        ...(split ? { kind: "pledge", is_recurring: true, recurring_interval: "month", recurring_count: plan.months } : {}),
      }).eq("id", d0.id);
      await stripe.paymentIntents.capture(piId, { amount_to_capture: plan.firstCents }, { ...opts, idempotencyKey: `spin-capture-${d0.id}` });
    } catch (e) {
      // Charge failed: put the ticket back so someone else can get it.
      await db.from("donations").update({ ticket_number: null, kind: "one_time", is_recurring: false, recurring_interval: null, recurring_count: null })
        .eq("id", d0.id).eq("status", "pending");
      throw e;
    }
    let extra: Record<string, unknown> = {};
    if (split) {
      try {
        let savedCard = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id;
        if (onReader) {
          const after: any = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] }, opts);
          savedCard = after.latest_charge?.payment_method_details?.card_present?.generated_card;
        }
        if (!savedCard) throw new Error("this card could not be saved");
        const next = addMonths(new Date(), 1);
        const d = { ...d0, amount: number, kind: "pledge", is_recurring: true, recurring_interval: "month", recurring_count: plan.months };
        const product = await stripe.products.create({ name: `Raffle ticket #${number} — ${org.name}` }, { ...opts, idempotencyKey: `spin-product-${d0.id}` });
        const sub = await stripe.subscriptions.create({
          customer, default_payment_method: savedCard,
          items: [{ price_data: { currency: "usd", product: product.id, unit_amount: plan.perCents, recurring: { interval: "month" } } }],
          billing_cycle_anchor: Math.floor(next.getTime() / 1000), proration_behavior: "none",
          cancel_at: pledgeCancelAt(next, plan.months - 1, "month"),
          metadata: stripeMetadata(d, campaign.name),
        }, { ...opts, idempotencyKey: `spin-sub-${d0.id}` });
        extra = { stripe_subscription_id: sub.id };
      } catch (e) {
        extra = { notes: `First payment taken, but the monthly plan could not be started (${(e as Error).message}). Arrange the remaining payments with the donor.` };
      }
    }
    const cardholder = await getCardholderName(stripe, pi, opts);
    await completeDonation(d0.id, { ...extra, ...(cardholder ? { cardholder_name: cardholder } : {}) });
    return answer({ ...d0, ticket_number: number, amount: number }, plan);
  },

  // ── Card reader (admin screen or kiosk tablet) ──
  async reader_status(b, req) {
    if (!isUuid(b.org_id)) fail(400, "Missing organization");
    await requireStaff(req, b.org_id, b.kiosk_key);
    const org = await getOrg(b.org_id);
    const s = await getSecrets(org.id);
    if (!s.stripe_reader_id) return { online: false, status: "not_configured" };
    try {
      const { stripe, opts } = await stripeFor(org, s);
      const reader: any = await stripe.terminal.readers.retrieve(s.stripe_reader_id, undefined, opts);
      return { online: reader.status === "online", status: reader.status, label: reader.label || null };
    } catch (e) {
      return { online: false, status: "error", error: (e as Error).message };
    }
  },

  async reader_charge(b, req) {
    const d = await pendingDonation(b.donation_id);
    await requireStaff(req, d.org_id, b.kiosk_key);
    if (d.status !== "pending") fail(400, "Donation is not pending");
    const org = await getOrg(d.org_id);
    const s = await getSecrets(org.id);
    if (!s.stripe_reader_id) fail(400, "No card reader is set up for this organization");
    const { stripe, opts } = await stripeFor(org, s);
    const { data: campaign } = d.campaign_id ? await db.from("campaigns").select("name").eq("id", d.campaign_id).maybeSingle() : { data: null };
    // Attach a named customer so the donor shows in Stripe; recurring gifts also save the card for later charges.
    const customer = await stripe.customers.create({
      name: d.donor_name || undefined, email: d.email || undefined, phone: d.phone || undefined, metadata: { donation_id: d.id },
    }, opts);
    const pi = await stripe.paymentIntents.create({
      customer: customer.id,
      ...(d.is_recurring || d.spin_monthly ? { setup_future_usage: "off_session" } : {}),
      amount: perChargeCents(d),
      currency: "usd",
      payment_method_types: ["card_present"],
      capture_method: d.awaiting_spin ? "manual" : "automatic",
      description: `Donation to ${org.name}`,
      metadata: stripeMetadata(d, campaign?.name || ""),
    }, opts);
    await db.from("donations").update({ stripe_payment_intent_id: pi.id }).eq("id", d.id);
    const action = await stripe.terminal.readers.processPaymentIntent(
      s.stripe_reader_id,
      d.is_recurring || d.spin_monthly ? { payment_intent: pi.id, process_config: { allow_redisplay: "always" } } : { payment_intent: pi.id },
      opts,
    );
    return { success: true, paymentIntentId: pi.id, readerAction: action.action?.status || "in_progress" };
  },

  async reader_check(b, req) {
    const d = await pendingDonation(b.donation_id);
    await requireStaff(req, d.org_id, b.kiosk_key);
    const org = await getOrg(d.org_id);
    const { stripe, opts } = await stripeFor(org);
    const piId = clean(b.payment_intent_id, 100) || d.stripe_payment_intent_id;
    if (!piId) fail(400, "Missing payment");
    const pi = await stripe.paymentIntents.retrieve(piId, undefined, opts);
    if (pi.metadata?.donation_id !== d.id) fail(400, "Payment does not match donation");
    let recurring = null;
    if (pi.status === "requires_capture" && d.awaiting_spin) {
      return { status: "authorized", lastError: null, recurring };
    }
    if (pi.status === "succeeded") {
      if (!d.awaiting_spin && pi.amount_received !== perChargeCents(d)) fail(400, "Payment amount does not match donation");
      const cardholder = await getCardholderName(stripe, pi, opts);
      await completeDonation(d.id, { stripe_payment_intent_id: pi.id, ...(cardholder ? { cardholder_name: cardholder } : {}) });
      if (d.is_recurring && !d.awaiting_spin) {
        try { recurring = await setupReaderSubscription(stripe, opts, org, pi.id); }
        catch (e) { recurring = { recurring: true, needsSetupLink: true, error: (e as Error).message }; }
      }
    } else if ((pi.status === "canceled" || pi.status === "requires_payment_method") && pi.last_payment_error) {
      await db.from("donations").update({ status: "cancelled" }).eq("id", d.id).eq("status", "pending");
    }
    return { status: pi.status, lastError: pi.last_payment_error?.message || null, recurring };
  },

  async reader_cancel(b, req) {
    const d = await pendingDonation(b.donation_id);
    await requireStaff(req, d.org_id, b.kiosk_key);
    const org = await getOrg(d.org_id);
    const s = await getSecrets(org.id);
    const { stripe, opts } = await stripeFor(org, s);
    if (s.stripe_reader_id) await stripe.terminal.readers.cancelAction(s.stripe_reader_id, undefined, opts).catch(() => null);
    if (d.status === "pending") {
      if (d.stripe_payment_intent_id) await stripe.paymentIntents.cancel(d.stripe_payment_intent_id, undefined, opts).catch(() => null);
      await db.from("donations").update({ status: "cancelled" }).eq("id", d.id).eq("status", "pending");
    }
    return { success: true };
  },

  // ── Kiosk tablet ──
  async kiosk_open(b) {
    const { data: org } = await db.from("organizations").select("id").eq("slug", clean(b.org_slug, 80)).maybeSingle();
    if (!org) fail(404, "Organization not found");
    const s = await getSecrets(org.id);
    if (!b.kiosk_key || !s.kiosk_key || String(b.kiosk_key) !== s.kiosk_key) fail(403, "This kiosk link is no longer valid");
    return { ok: true, org_id: org.id };
  },
  async kiosk_members(b, req) {
    const campaign = await getCampaign(b.campaign_id);
    await requireStaff(req, campaign.org_id, b.kiosk_key);
    const { data } = await db.from("members").select("id, name").eq("campaign_id", campaign.id).order("name");
    return { members: data || [] };
  },
  async kiosk_link(b, req) {
    if (!isUuid(b.org_id)) fail(400, "Missing organization");
    await requireAdmin(req, b.org_id);
    const s = await getSecrets(b.org_id);
    let key = s.kiosk_key;
    if (!key || b.reset) {
      key = token(18);
      await db.rpc("set_org_secrets", { p_org: b.org_id, p: { kiosk_key: key } });
    }
    return { kiosk_key: key };
  },

  // ── Receipts ──
  async send_receipt(b, req) {
    const d = await pendingDonation(b.donation_id);
    await requireAdmin(req, d.org_id);
    if (d.status !== "completed") fail(400, "Only completed donations get a receipt");
    const result = await sendReceipt(d, await getOrg(d.org_id), { force: true, overrideEmail: clean(b.override_email, 320) });
    if ((result as any).skipped) fail(400, "No email address on this donation");
    return result;
  },

  // ── Recurring setup link: donor saves a card for the remaining payments of a pledge ──
  async create_setup_link(b, req) {
    const d = await pendingDonation(b.donation_id);
    await requireAdmin(req, d.org_id);
    const org = await getOrg(d.org_id);
    if (d.kind !== "pledge" || !(Number(d.recurring_count) >= 2)) fail(400, "This donation is not a multi-payment pledge");
    if (intervalMonths(d.recurring_interval) !== 1) fail(400, "Setup links are for monthly pledges");
    const base = safeReturnUrl(b.app_url, req, org).replace(/\/$/, "");
    const monthly = Number(d.amount) / Number(d.recurring_count);
    let { data: link } = await db.from("recurring_setup_links").select("*").eq("original_donation_id", d.id).eq("status", "pending").maybeSingle();
    if (!link) {
      const res = await db.from("recurring_setup_links").insert({
        org_id: org.id, token: token(), original_donation_id: d.id, donor_name: d.donor_name || "", donor_email: d.email || "",
        monthly_amount: monthly, total_months: d.recurring_count, months_already_charged: 1, first_charge_date: d.created_at,
      }).select().single();
      if (res.error) throw res.error;
      link = res.data;
    }
    const url = `${base}/setup-recurring?token=${link.token}`;
    let emailSent = false;
    if (b.send_email && d.email) {
      const remaining = Number(d.recurring_count) - 1;
      await sendEmail(org, d.email, `Set up your monthly billing — ${org.name}`, emailShell(org, `
<p style="margin:0 0 16px;color:#1a2d5a;font-size:20px;font-weight:600;">Hello ${escapeHtml(d.donor_name || "Friend")},</p>
<p style="margin:0 0 16px;color:#5a5a5a;font-size:15px;line-height:1.65;">Thank you again for your generous pledge of <strong>${money(Number(d.amount))}</strong> over ${d.recurring_count} months.</p>
<p style="margin:0 0 16px;color:#5a5a5a;font-size:15px;line-height:1.65;">Your first month of <strong>${money(monthly)}</strong> has already been received. To set up automatic billing for the remaining <strong>${remaining} month${remaining === 1 ? "" : "s"}</strong>, please click below to securely save your card.</p>
<div style="text-align:center;margin:32px 0;"><a href="${url}" style="display:inline-block;background:#c9a227;color:#1a2d5a;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Set Up Monthly Billing</a></div>
<p style="margin:24px 0 0;color:#888;font-size:12px;line-height:1.6;">This is a one-time setup. Billing ends automatically once the pledge is fulfilled. If the button doesn't work, copy this link: ${url}</p>`));
      emailSent = true;
    }
    return { success: true, url, emailSent };
  },

  async setup_recurring_session(b) {
    const { data: link } = await db.from("recurring_setup_links").select("*").eq("token", clean(b.token, 100)).maybeSingle();
    if (!link) fail(404, "Invalid or expired link");
    if (link.status !== "pending") fail(400, "This setup link has already been used");
    const org = await getOrg(link.org_id);
    const { stripe, opts, publishableKey, stripeAccount } = await stripeFor(org);
    const customer = await stripe.customers.create({
      email: link.donor_email || undefined, name: link.donor_name || undefined, metadata: { setup_link_token: link.token },
    }, opts);
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id, payment_method_types: ["card"], usage: "off_session",
      metadata: { setup_link_token: link.token, original_donation_id: link.original_donation_id },
    }, opts);
    await db.from("recurring_setup_links").update({ stripe_setup_intent_id: setupIntent.id }).eq("id", link.id);
    return {
      clientSecret: setupIntent.client_secret, donorName: link.donor_name, monthlyAmount: Number(link.monthly_amount),
      totalMonths: link.total_months, remainingMonths: link.total_months - (link.months_already_charged || 1),
      firstChargeDate: link.first_charge_date, publishableKey, stripeAccount, orgName: org.name,
    };
  },

  async setup_recurring_confirm(b) {
    const tok = clean(b.token, 100);
    // Claim the link first so a double click can never create two subscriptions.
    const { data: link } = await db.from("recurring_setup_links").update({ status: "processing" })
      .eq("token", tok).eq("status", "pending").select().maybeSingle();
    if (!link) fail(400, "This setup link has already been used");
    try {
      const org = await getOrg(link.org_id);
      const { stripe, opts } = await stripeFor(org);
      const si = await stripe.setupIntents.retrieve(clean(b.setup_intent_id, 100), undefined, opts);
      // The saved card must be the one created for THIS link.
      if (si.metadata?.setup_link_token !== link.token || si.id !== link.stripe_setup_intent_id) fail(400, "Card setup does not match this link");
      if (si.status !== "succeeded") fail(400, "Card setup did not complete");
      const customerId = si.customer as string, pm = si.payment_method as string;
      await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm } }, opts);
      const remaining = link.total_months - (link.months_already_charged || 1);
      if (remaining < 1) {
        await db.from("recurring_setup_links").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", link.id);
        return { success: true, message: "No remaining charges needed." };
      }
      // Next charge: one month after the first, moved forward if that date has already passed.
      let next = addMonths(new Date(link.first_charge_date), 1), i = 1;
      while (next.getTime() <= Date.now() + 60_000) next = addMonths(new Date(link.first_charge_date), ++i);
      const original = await findDonation(link.original_donation_id);
      const product = await stripe.products.create({ name: `Recurring donation to ${org.name}` }, { ...opts, idempotencyKey: `setup-product-${link.id}` });
      const sub = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price_data: { currency: "usd", product: product.id, unit_amount: Math.round(Number(link.monthly_amount) * 100), recurring: { interval: "month" } } }],
        default_payment_method: pm,
        billing_cycle_anchor: Math.floor(next.getTime() / 1000),
        proration_behavior: "none",
        cancel_at: pledgeCancelAt(next, remaining, "month"),
        metadata: { ...(original ? stripeMetadata(original, "") : {}), donation_id: link.original_donation_id, original_donation_id: link.original_donation_id, from_setup_link: "true" },
      }, { ...opts, idempotencyKey: `setup-sub-${link.id}` });
      await db.from("recurring_setup_links").update({ status: "completed", stripe_subscription_id: sub.id, completed_at: new Date().toISOString() }).eq("id", link.id);
      await db.from("donations").update({ stripe_subscription_id: sub.id }).eq("id", link.original_donation_id);
      return { success: true, subscriptionId: sub.id, nextChargeDate: next.toISOString(), remainingMonths: remaining };
    } catch (e) {
      await db.from("recurring_setup_links").update({ status: "pending" }).eq("id", link.id).eq("status", "processing");
      throw e;
    }
  },

  // ── Memberships ──
  async cancel_membership(b, req) {
    const d = await pendingDonation(b.donation_id);
    await requireAdmin(req, d.org_id);
    if (!d.stripe_subscription_id) fail(400, "No automatic billing on this payment");
    const { stripe, opts } = await stripeFor(await getOrg(d.org_id));
    await stripe.subscriptions.cancel(d.stripe_subscription_id, undefined, opts);
    await db.from("donations").update({ membership_status: "cancelled" }).eq("org_id", d.org_id).eq("stripe_subscription_id", d.stripe_subscription_id);
    return { success: true };
  },

  // ── Raffle drawing: every sold ticket is one entry ──
  async draw_winner(b, req) {
    const campaign = await getCampaign(b.campaign_id);
    await requireAdmin(req, campaign.org_id);
    if (campaign.type !== "spin_raffle") fail(400, "Not a raffle campaign");
    const { data: entries } = await db.from("donations").select("id, donor_name, display_name, is_anonymous, phone, email, ticket_number")
      .eq("campaign_id", campaign.id).eq("status", "completed").not("ticket_number", "is", null);
    if (!entries?.length) fail(400, "No entries yet");
    const w = entries[Math.floor(randomUnit() * entries.length)];
    const winner = { donation_id: w.id, ticket_number: w.ticket_number, display_name: w.is_anonymous ? "Anonymous" : w.display_name || w.donor_name, drawn_at: new Date().toISOString(), entries: entries.length };
    await db.from("campaigns").update({ raffle_winner: winner }).eq("id", campaign.id);
    return { winner, contact: { name: w.donor_name, phone: w.phone, email: w.email } };
  },

  // ── Organization payment setup ──
  async payment_status(b, req) {
    if (!isUuid(b.org_id)) fail(400, "Missing organization");
    await requireAdmin(req, b.org_id);
    let org = await getOrg(b.org_id);
    const s = await getSecrets(org.id);
    // Refresh Connect status from Stripe (the donor-facing flag is also kept current by the webhook).
    if (org.stripe_account_id && !org.stripe_own_keys && Deno.env.get("STRIPE_PLATFORM_SECRET_KEY")) {
      const acct = await platformStripe().accounts.retrieve(org.stripe_account_id);
      if (!!acct.charges_enabled !== org.stripe_charges_enabled) {
        await db.from("organizations").update({ stripe_charges_enabled: !!acct.charges_enabled }).eq("id", org.id);
        org = await getOrg(org.id);
      }
    }
    return {
      platform_ready: !!Deno.env.get("STRIPE_PLATFORM_SECRET_KEY"),
      email_ready: !!(Deno.env.get("RESEND_API_KEY") && Deno.env.get("RECEIPT_FROM_EMAIL")),
      connect: { account_id: org.stripe_account_id, charges_enabled: org.stripe_charges_enabled },
      own_keys: { secret: !!s.stripe_secret_key, webhook: !!s.stripe_webhook_secret, active: org.stripe_own_keys },
      reader_id: s.stripe_reader_id || "",
      donors_fund: { api_key: !!s.donors_fund_api_key, token: !!s.donors_fund_validation_token, account: s.donors_fund_account_number || "", platform_key: !!(Deno.env.get("DONORS_FUND_API_KEY") && Deno.env.get("DONORS_FUND_VALIDATION_TOKEN")) },
      raffle_enabled: org.raffle_enabled, plan: org.plan,
      connext: { api_key: !!s.connext_api_key, group: s.connext_group || 1 },
      webhook_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/api/stripe-webhook?org=${org.slug}`,
    };
  },

  // Starts (or resumes) Stripe's own onboarding for this organization's account.
  async connect_start(b, req) {
    if (!isUuid(b.org_id)) fail(400, "Missing organization");
    const user = await requireAdmin(req, b.org_id);
    const org = await getOrg(b.org_id);
    const stripe = platformStripe();
    let accountId = org.stripe_account_id;
    if (!accountId) {
      const acct = await stripe.accounts.create({
        type: "standard", country: "US", email: user.email, business_type: "non_profit",
        business_profile: { name: org.name, mcc: "8398" }, metadata: { org_id: org.id },
      });
      accountId = acct.id;
      await db.from("organizations").update({ stripe_account_id: accountId, stripe_own_keys: false }).eq("id", org.id);
    }
    const back = safeReturnUrl(b.return_url, req, org);
    const link = await stripe.accountLinks.create({ account: accountId, refresh_url: back, return_url: back, type: "account_onboarding" });
    return { url: link.url };
  },

  // Write-only: saved keys are never sent back to the browser.
  async save_secrets(b, req) {
    if (!isUuid(b.org_id)) fail(400, "Missing organization");
    await requireAdmin(req, b.org_id);
    const v = b.values || {};
    const allowed = ["stripe_secret_key", "stripe_webhook_secret", "stripe_reader_id", "donors_fund_api_key", "donors_fund_validation_token", "donors_fund_account_number", "connext_api_key", "connext_group"];
    const p: Record<string, string> = {};
    for (const k of allowed) if (k in v) p[k] = clean(v[k], 300);
    if (p.stripe_secret_key && !/^(sk|rk)_(live|test)_/.test(p.stripe_secret_key)) fail(400, "That does not look like a Stripe secret key");
    const { error } = await db.rpc("set_org_secrets", { p_org: b.org_id, p });
    if (error) throw error;
    const s = await getSecrets(b.org_id);
    const patch: any = {
      card_reader_enabled: !!s.stripe_reader_id,
      donors_fund_enabled: (() => { const k = donorsFundKeys(s); return !!(k.apiKey && k.token && k.account && (v.donors_fund_on !== false)); })(),
    };
    if (p.stripe_secret_key) patch.stripe_own_keys = true;
    if ("stripe_publishable_key" in v) patch.stripe_publishable_key = clean(v.stripe_publishable_key, 200) || null;
    if (v.use_connect === true) patch.stripe_own_keys = false;
    await db.from("organizations").update(patch).eq("id", b.org_id);
    return { success: true };
  },
};
