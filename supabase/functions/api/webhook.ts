// Stripe webhook. Two ways in:
//   /api/stripe-webhook            -> platform Connect endpoint (all organizations onboarded through the platform)
//   /api/stripe-webhook?org=<slug> -> an organization that uses its own Stripe keys
import Stripe from "npm:stripe@17.5.0";
import {
  completeDonation, db, findDonation, getCardholderName, getSecrets, perChargeCents, platformStripe,
  pledgeCancelAt, sendReceipt, setupReaderSubscription, stripeFor,
} from "./core.ts";

const ok = (extra: Record<string, unknown> = {}) => Response.json({ received: true, ...extra });

export async function handleWebhook(req: Request, url: URL): Promise<Response> {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "No signature" }, { status: 400 });

  let event: any, org: any;
  const slug = url.searchParams.get("org");
  try {
    if (slug) {
      const { data } = await db.from("organizations").select("*").eq("slug", slug).maybeSingle();
      org = data;
      const secrets = org ? await getSecrets(org.id) : {};
      if (!secrets.stripe_secret_key || !secrets.stripe_webhook_secret) throw new Error("Organization webhook is not configured");
      event = await new Stripe(secrets.stripe_secret_key).webhooks.constructEventAsync(body, signature, secrets.stripe_webhook_secret);
    } else {
      event = await platformStripe().webhooks.constructEventAsync(body, signature, Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET") || "");
      if (event.account) {
        const { data } = await db.from("organizations").select("*").eq("stripe_account_id", event.account).maybeSingle();
        org = data;
      }
    }
  } catch (e) {
    console.error("[webhook] signature check failed:", (e as Error).message);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }
  if (!org) return ok({ ignored: "unknown account" });

  try {
    await handleEvent(event, org);
  } catch (e) {
    // A 500 makes Stripe retry later; every handler below is safe to run twice.
    console.error(`[webhook] ${event.type} failed:`, (e as Error).message);
    return Response.json({ error: "Handler failed" }, { status: 500 });
  }
  return ok();
}

async function handleEvent(event: any, org: any) {
  const obj = event.data.object;

  if (event.type === "account.updated" && !org.stripe_own_keys) {
    await db.from("organizations").update({ stripe_charges_enabled: !!obj.charges_enabled }).eq("id", org.id);
    return;
  }

  const { stripe, opts } = await stripeFor(org);

  if (event.type === "checkout.session.completed") {
    const d = await findDonation(obj.metadata?.donation_id, org.id);
    if (!d) return;
    const pi = typeof obj.payment_intent === "string" ? obj.payment_intent : obj.payment_intent?.id;
    const sub = typeof obj.subscription === "string" ? obj.subscription : obj.subscription?.id;

    if (d.awaiting_spin) {
      // Card is only authorized so far; the donation completes when the donor spins.
      await db.from("donations").update({ stripe_payment_intent_id: pi || null }).eq("id", d.id).eq("status", "pending");
      return;
    }
    if (obj.amount_total !== perChargeCents(d)) {
      console.error(`[webhook] amount mismatch for donation ${d.id}: got ${obj.amount_total}`);
      return;
    }
    await completeDonation(d.id, {
      stripe_checkout_session_id: obj.id,
      ...(pi ? { stripe_payment_intent_id: pi } : {}),
      ...(sub ? { stripe_subscription_id: sub } : {}),
      ...(d.kind === "membership" ? { membership_status: "active" } : {}),
    });
    // Pledges end after the agreed number of payments; memberships run until cancelled.
    if (sub && d.kind === "pledge" && Number(d.recurring_count) > 1) {
      const s = await stripe.subscriptions.retrieve(sub, undefined, opts);
      const first = new Date(s.current_period_start * 1000);
      await stripe.subscriptions.update(sub, {
        cancel_at: pledgeCancelAt(first, Number(d.recurring_count), d.recurring_interval),
      }, opts);
    }
    return;
  }

  if (event.type === "payment_intent.succeeded") {
    // Card-reader payments and spin captures. Online checkout is handled by checkout.session.completed above.
    const d = await findDonation(obj.metadata?.donation_id, org.id);
    const reader = obj.payment_method_types?.includes("card_present");
    if (!d || !(reader || d.awaiting_spin)) return;
    // Raffle spins: the captured amount was set by the server (ticket, or first monthly payment), so there is nothing to compare.
    if (d.awaiting_spin ? d.ticket_number == null : obj.amount_received !== perChargeCents(d)) return;
    const cardholder = await getCardholderName(stripe, obj, opts);
    await completeDonation(d.id, { stripe_payment_intent_id: obj.id, ...(cardholder ? { cardholder_name: cardholder } : {}) });
    // Backup in case the kiosk/admin screen closed before the reader payment finished
    if (reader && d.is_recurring && !d.awaiting_spin) await setupReaderSubscription(stripe, opts, org, obj.id);
    return;
  }

  if (event.type === "invoice.payment_succeeded") {
    // Newer Stripe API versions moved the subscription id under invoice.parent
    const subId = obj.subscription || obj.parent?.subscription_details?.subscription;
    if (!subId || !obj.billing_reason || obj.billing_reason === "subscription_create") return;
    const sub = await stripe.subscriptions.retrieve(subId, undefined, opts);
    const meta = sub.metadata || {};
    const original = await findDonation(meta.original_donation_id || meta.donation_id, org.id);
    const { data: renewal, error } = await db.from("donations").insert({
      org_id: org.id,
      campaign_id: original?.campaign_id ?? null,
      kind: original?.kind === "membership" ? "membership" : "pledge",
      donor_name: original?.donor_name || meta.donor_name || "",
      display_name: original?.display_name || meta.donor_name || "",
      email: original?.email || meta.donor_email || "",
      phone: original?.phone || meta.donor_phone || "",
      address: original?.address || "",
      amount: (obj.amount_paid || 0) / 100,
      donation_type: "credit_card",
      donation_source: "credit_card",
      is_anonymous: original?.is_anonymous || false,
      dedication_type: original?.dedication_type || "none",
      dedication_message: original?.dedication_message || "",
      is_recurring: true,
      recurring_interval: original?.recurring_interval || "month",
      recurring_count: original?.kind === "membership" ? null : original?.recurring_count || null,
      // Renewal charges are already part of the original pledge total, so campaign totals skip them
      // (membership renewals are new money and do count).
      is_recurring_renewal: true,
      original_donation_id: original?.id ?? null,
      membership_tier_id: original?.membership_tier_id ?? null,
      member_id: original?.member_id ?? null,
      status: "completed",
      show_on_projector: false,
      stripe_subscription_id: subId,
      stripe_invoice_id: obj.id,
    }).select().maybeSingle();
    if (error) {
      if (error.code === "23505") return; // this invoice was already recorded
      throw error;
    }
    if (renewal) {
      try { await sendReceipt(renewal, org); } catch (e) { console.error("[webhook] receipt:", (e as Error).message); }
    }
    return;
  }

  if (event.type === "customer.subscription.deleted") {
    await db.from("donations").update({ membership_status: "cancelled" })
      .eq("org_id", org.id).eq("stripe_subscription_id", obj.id).eq("kind", "membership");
  }
}
