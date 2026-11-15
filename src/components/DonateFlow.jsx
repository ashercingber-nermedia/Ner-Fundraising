import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { CheckCircle2, CreditCard, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { api, money, everyLabel } from "@/lib/supabase";
import SpinWheel, { BigRedButton } from "@/components/SpinWheel";

const pick = "py-3 rounded-xl font-semibold border-2 transition-all text-sm";
const on = "bg-brand text-white border-brand";
const off = "bg-white text-brand border-brand/20 hover:border-brand/50";

// The whole giving flow for one campaign, for all three campaign types.
//   mode="web":   pays on Stripe's checkout page (or Donors Fund)
//   mode="kiosk": pays on the organization's card reader (tablet at an event, or the admin screen)
export default function DonateFlow({ org, campaign, mode = "web", kioskKey, resumeSpinId, prefill = {}, onDone }) {
  const kiosk = mode === "kiosk";
  const type = campaign.type;
  const tickets = Number(campaign.ticket_count) || 0;
  const minMonthly = Math.max(25, Math.ceil(tickets / 12)); // enough to pay off the top ticket within 12 months
  const tiers = (campaign.membership_tiers || []).filter((t) => t.is_active);

  const [step, setStep] = useState(resumeSpinId ? "spin" : "form"); // form | reader | spin | done
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [donationId, setDonationId] = useState(resumeSpinId || null);
  const [result, setResult] = useState(null); // { amount, segment, recurring }
  const [spinIndex, setSpinIndex] = useState(null);

  const [f, setF] = useState({ donor_name: "", phone: "", email: "", is_anonymous: false, dedication_type: "none", dedication_message: "" });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const [selected, setSelected] = useState(prefill.amount && campaign.quick_amounts?.includes(prefill.amount) ? prefill.amount : null);
  const [custom, setCustom] = useState(prefill.amount && !campaign.quick_amounts?.includes(prefill.amount) ? String(prefill.amount) : "");
  const [frequency, setFrequency] = useState(prefill.monthly ? "month" : "one_time");
  const [count, setCount] = useState(prefill.monthly ? "12" : "");
  const [method, setMethod] = useState("card");
  const [daf, setDaf] = useState({ donor: "", auth: "" });
  const [tierId, setTierId] = useState(tiers[0]?.id || null);
  const [period, setPeriod] = useState(tiers[0]?.monthly_amount ? "month" : "year");
  const [spinPlan, setSpinPlan] = useState("full"); // full | monthly
  const [spinMonthly, setSpinMonthly] = useState("");
  const [members, setMembers] = useState(null);
  const [memberId, setMemberId] = useState(null);
  const [search, setSearch] = useState("");
  const poll = useRef(null);
  const spun = useRef(null);

  const tier = tiers.find((t) => t.id === tierId);
  const amount = custom ? parseFloat(custom) : selected;
  const recurring = frequency !== "one_time";

  useEffect(() => () => clearInterval(poll.current), []);
  // Kiosk membership: load the roster so the member can find their name.
  useEffect(() => {
    if (!kiosk || type !== "membership") return;
    api("kiosk_members", { campaign_id: campaign.id, kiosk_key: kioskKey }).then((r) => setMembers(r.members)).catch(() => setMembers([]));
  }, [campaign.id]);

  const reset = () => {
    clearInterval(poll.current);
    setStep("form"); setBusy(false); setError(""); setDonationId(null); setResult(null); setSpinIndex(null);
    setF({ donor_name: "", phone: "", email: "", is_anonymous: false, dedication_type: "none", dedication_message: "" });
    setSelected(null); setCustom(""); setFrequency("one_time"); setCount(""); setMethod("card"); setDaf({ donor: "", auth: "" });
    setMemberId(null); setSearch("");
  };

  const finish = (r) => {
    setResult(r); setStep("done");
    confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 } });
    onDone?.(r);
    if (kiosk) setTimeout(reset, 9000);
  };

  const watchReader = (id) => {
    const started = Date.now();
    clearInterval(poll.current);
    poll.current = setInterval(async () => {
      try {
        const r = await api("reader_check", { donation_id: id, kiosk_key: kioskKey });
        if (r.status === "authorized") { clearInterval(poll.current); setStep("spin"); }
        else if (r.status === "succeeded") { clearInterval(poll.current); finish({ recurring: r.recurring }); }
        else if (r.status === "canceled" || r.lastError) { clearInterval(poll.current); setError(r.lastError || "Payment was cancelled"); setStep("form"); }
        else if (Date.now() - started > 180000) { cancelReader(id, "Timed out waiting for the card"); }
      } catch (e) { clearInterval(poll.current); setError(e.message); setStep("form"); }
    }, 2000);
  };
  const cancelReader = async (id = donationId, message = "") => {
    clearInterval(poll.current);
    try { await api("reader_cancel", { donation_id: id, kiosk_key: kioskKey }); } catch { /* reader may already be idle */ }
    setError(message); setStep("form");
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (type === "regular") {
      if (!amount || amount <= 0) return setError("Please select or enter a donation amount.");
      if (recurring && !(parseInt(count) >= 2)) return setError("Please enter how many payments (2 or more).");
    }
    if (type === "membership" && !tier) return setError("Please choose a membership level.");
    if (type === "spin_raffle" && spinPlan === "monthly" && !(parseFloat(spinMonthly) >= minMonthly)) return setError(`Monthly payments must be at least $${minMonthly}.`);
    setBusy(true);
    try {
      const d = await api("start_donation", {
        campaign_id: campaign.id, ...f,
        amount, frequency, count: recurring ? parseInt(count) : null,
        tier_id: tierId, tier_period: period, member_id: memberId,
        monthly: type === "spin_raffle" && spinPlan === "monthly" ? parseFloat(spinMonthly) : null,
      });
      setDonationId(d.donation_id);
      if (method === "daf") {
        await api("pay", { donation_id: d.donation_id, method: "daf", daf_donor: daf.donor, daf_authorization: daf.auth });
        if (kiosk) finish({}); else window.location.href = `/thank-you?c=${campaign.slug}`;
      } else if (kiosk) {
        await api("reader_charge", { donation_id: d.donation_id, kiosk_key: kioskKey });
        setStep("reader");
        watchReader(d.donation_id);
      } else {
        const base = `${window.location.origin}/c/${campaign.slug}`;
        const r = await api("pay", {
          donation_id: d.donation_id, method: "card",
          success_url: d.awaiting_spin ? `${base}/donate?spin=${d.donation_id}` : `${window.location.origin}/thank-you?c=${campaign.slug}`,
          cancel_url: `${base}/donate`,
        });
        window.location.href = r.url;
        return; // keep the button disabled while the browser leaves
      }
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  const spin = async () => {
    setBusy(true); setError("");
    try {
      const r = await api("spin", { donation_id: donationId });
      spun.current = r;
      setSpinIndex(r.number);
    } catch (err) { setError(err.message); setBusy(false); }
  };

  // ───────────── Screens ─────────────
  if (step === "done") {
    return (
      <div className="text-center py-10">
        <CheckCircle2 className="w-20 h-20 text-green-600 mx-auto mb-4" />
        <h2 className="text-3xl font-bold text-brand mb-2">Thank you!</h2>
        {result?.number != null && (
          <div className="text-brand">
            <p className="text-xl">You got ticket <strong>#{result.number}</strong>, a <strong>{money(result.amount)}</strong> donation. You're in the raffle!</p>
            <p className="mt-2 text-brand/80">
              {result.months > 1
                ? `${money(result.first, 2)} was charged today, then ${money(result.monthly, 2)} a month for ${result.months - 1} more month${result.months === 2 ? "" : "s"}.`
                : `${money(result.amount)} was charged to your card.`}
            </p>
          </div>
        )}
        {result?.recurring?.needsSetupLink && <p className="text-sm text-amber-700 mt-3">Phone wallets can't be saved for future payments. The office will send you a link to set up the remaining payments.</p>}
        {result?.recurring?.subscriptionId && <p className="text-sm text-brand/70 mt-3">Your card was saved for the remaining payments.</p>}
        <p className="text-brand/60 mt-3">{f.email ? "A receipt is on its way to your email." : ""}</p>
        {kiosk && <Button className="mt-6 bg-brand" onClick={reset}>Next person</Button>}
      </div>
    );
  }

  if (step === "reader") {
    return (
      <div className="text-center py-10">
        <CreditCard className="w-20 h-20 text-brand mx-auto mb-4 animate-pulse" />
        <h2 className="text-2xl font-bold text-brand mb-2">{type === "spin_raffle" ? "Tap or insert your card to authorize" : "Tap or insert your card on the reader"}</h2>
        {type === "spin_raffle" && <p className="text-brand/70">Your card is held for up to {money(tickets)}. You only pay the ticket number you land on.</p>}
        <Loader2 className="w-6 h-6 animate-spin mx-auto my-6 text-brand/60" />
        <Button variant="outline" onClick={() => cancelReader()}>Cancel</Button>
      </div>
    );
  }

  if (step === "spin") {
    return (
      <div className="text-center py-2 space-y-5">
        <h2 className="text-2xl font-bold text-brand">{spinIndex == null ? "Card authorized. Press the button to spin!" : "Good luck!"}</h2>
        <SpinWheel tickets={tickets} result={spinIndex} onDone={() => finish(spun.current)} size={kiosk ? 300 : 360} />
        {spinIndex == null && <BigRedButton onClick={spin} disabled={busy}>{busy ? "…" : "SPIN"}</BigRedButton>}
        {error && <p className="text-red-600 font-medium">{error}</p>}
      </div>
    );
  }

  const filtered = (members || []).filter((m) => m.name.toLowerCase().includes(search.toLowerCase())).slice(0, 40);

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Kiosk membership: find your name */}
      {kiosk && type === "membership" && members && members.length > 0 && !memberId && f.donor_name === "" && (
        <div className="space-y-2">
          <Label className="text-brand font-medium">Find your name</Label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-4 text-brand/40" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Start typing your name" className="h-12 pl-9 rounded-xl" />
          </div>
          <div className="max-h-56 overflow-y-auto border rounded-xl divide-y bg-white">
            {filtered.map((m) => (
              <button type="button" key={m.id} onClick={() => { setMemberId(m.id); set("donor_name", m.name); }} className="w-full text-left px-4 py-3 hover:bg-brand/5 text-brand font-medium">
                {m.name}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-4 py-3 text-brand/50 text-sm">No match. Enter your name below.</p>}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-brand font-medium">{memberId ? "Member" : "Your Name"}</Label>
        <div className="flex gap-2">
          <Input value={f.donor_name} onChange={(e) => { set("donor_name", e.target.value); if (memberId) setMemberId(null); }} placeholder="Enter your name" className="h-12 rounded-xl" required readOnly={!!memberId} />
          {memberId && <Button type="button" variant="outline" className="h-12" onClick={() => { setMemberId(null); set("donor_name", ""); }}>Change</Button>}
        </div>
        {type !== "membership" && (
          <div className="flex items-center gap-2 mt-2">
            <Checkbox id="anonymous" checked={f.is_anonymous} onCheckedChange={(v) => set("is_anonymous", !!v)} />
            <Label htmlFor="anonymous" className="text-sm text-brand/80 cursor-pointer">Make my donation anonymous</Label>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-brand font-medium">Phone Number</Label>
          <Input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 123-4567" className="h-12 rounded-xl" required={kiosk} />
        </div>
        <div className="space-y-2">
          <Label className="text-brand font-medium">Email {kiosk ? "(for your receipt)" : ""}</Label>
          <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="your@email.com" className="h-12 rounded-xl" />
        </div>
      </div>

      {type === "regular" && (
        <>
          <div className="border-t border-brand/10 pt-6">
            <Label className="text-brand font-medium mb-3 block">Donation Amount {recurring ? `(each ${everyLabel(frequency)})` : ""}</Label>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {(campaign.quick_amounts || []).map((amt) => (
                <button key={amt} type="button" onClick={() => { setSelected(amt); setCustom(""); }} className={`${pick} ${selected === amt && !custom ? on : off}`}>
                  ${amt.toLocaleString()}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-gray-500 whitespace-nowrap">Other amount:</Label>
              <Input type="number" min="1" step="0.01" value={custom} onChange={(e) => { setCustom(e.target.value); setSelected(null); }} placeholder="Enter amount" className="h-10 rounded-lg max-w-[160px]" />
            </div>
          </div>

          {campaign.allow_recurring && (
            <div className="space-y-3">
              <Label className="text-brand font-medium">Frequency</Label>
              <div className="grid grid-cols-4 gap-2">
                {[["one_time", "One Time"], ["month", "Monthly"], ["quarter", "Quarterly"], ["year", "Yearly"]].map(([v, label]) => (
                  <button key={v} type="button" onClick={() => setFrequency(v)} className={`${pick} ${frequency === v ? on : off}`}>{label}</button>
                ))}
              </div>
              {recurring && (
                <div className="flex items-center gap-3 flex-wrap">
                  <Label className="text-sm text-gray-600">How many payments?</Label>
                  <Input type="number" min="2" max="120" value={count} onChange={(e) => setCount(e.target.value)} placeholder="e.g. 12" className="h-10 rounded-lg max-w-[100px]" />
                  {amount > 0 && parseInt(count) >= 2 && (
                    <span className="text-sm text-brand/70">{money(amount, 2)} every {everyLabel(frequency)} × {parseInt(count)} = <strong>{money(amount * parseInt(count), 2)}</strong> total</span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-brand font-medium">Dedication (optional)</Label>
            <div className="grid grid-cols-3 gap-2">
              {[["none", "None"], ["in_honor", "In Honor Of"], ["in_memory", "In Memory Of"]].map(([v, label]) => (
                <button key={v} type="button" onClick={() => set("dedication_type", v)} className={`${pick} ${f.dedication_type === v ? on : off}`}>{label}</button>
              ))}
            </div>
            {f.dedication_type !== "none" && (
              <Input value={f.dedication_message} onChange={(e) => set("dedication_message", e.target.value)} placeholder="Name" maxLength={300} className="h-12 rounded-xl" />
            )}
          </div>
        </>
      )}

      {type === "membership" && (
        <div className="border-t border-brand/10 pt-6 space-y-3">
          <Label className="text-brand font-medium block">Membership Level</Label>
          {tiers.length === 0 && <p className="text-sm text-brand/60">Membership levels have not been set up yet.</p>}
          {tiers.some((t) => t.monthly_amount) && tiers.some((t) => t.yearly_amount) && (
            <div className="grid grid-cols-2 gap-2 max-w-xs">
              {[["month", "Monthly"], ["year", "Yearly"]].map(([v, label]) => (
                <button key={v} type="button" onClick={() => setPeriod(v)} className={`${pick} ${period === v ? on : off}`}>{label}</button>
              ))}
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-3">
            {tiers.map((t) => {
              const price = period === "year" ? t.yearly_amount : t.monthly_amount;
              return (
                <button key={t.id} type="button" disabled={!price} onClick={() => setTierId(t.id)} className={`text-left p-4 rounded-xl border-2 transition-all disabled:opacity-40 ${tierId === t.id ? on : off}`}>
                  <p className="font-bold text-lg">{t.name}</p>
                  <p className="font-semibold">{price ? `${money(price)} / ${period}` : "Not available"}</p>
                  {t.description && <p className="text-sm opacity-80 mt-1">{t.description}</p>}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-brand/60">Renews automatically every {period} until you cancel.</p>
        </div>
      )}

      {type === "spin_raffle" && (
        <div className="border-t border-brand/10 pt-6 space-y-4">
          <div className="rounded-xl bg-brand/5 p-4 text-brand/90 text-sm space-y-1">
            <p className="font-semibold text-brand text-base">How it works</p>
            <p>There are <strong>{tickets}</strong> tickets, numbered 1 to {tickets}. Each number is sold only once.</p>
            <p>You authorize your card for up to <strong>{money(tickets)}</strong>, then press the red button. You get a random ticket, and the number on it is your donation: ticket #72 is $72.</p>
            {campaign.raffle_prize && <p>Every ticket is one entry to win: <strong>{campaign.raffle_prize}</strong>.</p>}
          </div>
          <div className="space-y-2">
            <Label className="text-brand font-medium">How would you like to pay?</Label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSpinPlan("full")} className={`${pick} ${spinPlan === "full" ? on : off}`}>All at once</button>
              <button type="button" onClick={() => { setSpinPlan("monthly"); if (!spinMonthly) setSpinMonthly(String(minMonthly)); }} className={`${pick} ${spinPlan === "monthly" ? on : off}`}>Monthly payments</button>
            </div>
            {spinPlan === "monthly" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-brand">$</span>
                  <Input type="number" min={minMonthly} step="1" value={spinMonthly} onChange={(e) => setSpinMonthly(e.target.value)} className="h-11 rounded-lg max-w-[120px]" />
                  <span className="text-sm text-brand/70">a month (at least ${minMonthly})</span>
                </div>
                <p className="text-xs text-brand/60">
                  Your ticket is split into equal monthly payments of about this much, never under $25 and never longer than 12 months.
                  A ticket under $50 is charged all at once.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment method */}
      {type === "regular" && org.donors_fund_enabled && (
        <div className="border-t border-brand/10 pt-6 space-y-3">
          <Label className="text-brand font-medium block">Payment Method</Label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMethod("card")} className={`${pick} ${method === "card" ? on : off}`}>{kiosk ? "Card on reader" : "Debit & Credit Card"}</button>
            <button type="button" onClick={() => setMethod("daf")} className={`${pick} ${method === "daf" ? on : off}`}>Donors Fund</button>
          </div>
          {method === "daf" && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label className="text-sm mb-2 block">Donors Fund Card Number</Label>
                <Input value={daf.donor} onChange={(e) => setDaf({ ...daf, donor: e.target.value })} inputMode="numeric" maxLength={40} required />
              </div>
              <div>
                <Label className="text-sm mb-2 block">CVV / PIN</Label>
                <Input type="password" value={daf.auth} onChange={(e) => setDaf({ ...daf, auth: e.target.value })} maxLength={20} required />
              </div>
            </div>
          )}
        </div>
      )}

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <Button type="submit" disabled={busy} className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-gold to-gold/80 text-brand hover:opacity-90 rounded-xl shadow-lg">
        {busy ? "Processing..." : type === "spin_raffle" ? "Authorize my card" : type === "membership" ? "Join" : kiosk && method === "card" ? "Continue to card reader" : "Confirm & Donate"}
      </Button>
      {!kiosk && method === "card" && <p className="text-xs text-center text-brand/50">You'll enter your card on Stripe's secure checkout page.</p>}
    </form>
  );
}
