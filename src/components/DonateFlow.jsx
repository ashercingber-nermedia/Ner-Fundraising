import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { ArrowRight, CircleCheck, CreditCard, Loader2, Search, UserPlus } from "lucide-react";
import { api, money, everyLabel } from "@/lib/supabase";
import SpinWheel, { BigRedButton } from "@/components/SpinWheel";

const blank = { donor_name: "", phone: "", email: "", is_anonymous: false, dedication_type: "none", dedication_message: "" };
const PLAN_IDLE_MS = 90000; // kiosk: a raffle plan left untouched this long is charged in full

// The whole giving flow for one campaign, for all three campaign types.
//   mode="web":   pays on Stripe's checkout page (or Donors Fund)
//   mode="kiosk": pays on the organization's card reader (tablet at an event, or the admin screen)
// Raffle: authorize the card -> spin -> pick pay in full or monthly -> charged.
export default function DonateFlow({ org, campaign, mode = "web", kioskKey, resumeSpinId, prefill = {}, onDone }) {
  const kiosk = mode === "kiosk";
  const type = campaign.type;
  const tickets = Number(campaign.ticket_count) || 0;
  const tiers = (campaign.membership_tiers || []).filter((t) => t.is_active);
  const quick = campaign.quick_amounts || [];

  const [step, setStep] = useState(resumeSpinId ? "spin" : "form"); // form | reader | spin | plan | done
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [donationId, setDonationId] = useState(resumeSpinId || null);
  const [result, setResult] = useState(null);
  const [spinNumber, setSpinNumber] = useState(null);
  const [months, setMonths] = useState(1);
  const [splitOpen, setSplitOpen] = useState(false);

  const [f, setF] = useState(blank);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const [selected, setSelected] = useState(prefill.amount && quick.includes(prefill.amount) ? prefill.amount : null);
  const [custom, setCustom] = useState(prefill.amount && !quick.includes(prefill.amount) ? String(prefill.amount) : "");
  const [frequency, setFrequency] = useState(prefill.monthly ? "month" : "one_time");
  const [count, setCount] = useState(prefill.monthly ? "12" : "");
  const [method, setMethod] = useState("card");
  const [daf, setDaf] = useState({ donor: "", auth: "" });
  const preTier = tiers.find((t) => t.id === prefill.tierId);
  const [tierId, setTierId] = useState(preTier?.id || tiers[0]?.id || null);
  const [period, setPeriod] = useState((preTier || tiers[0])?.monthly_amount ? "month" : "year");
  const [members, setMembers] = useState(null);
  const [memberId, setMemberId] = useState(null);
  const [who, setWho] = useState(kiosk && type === "membership" ? "" : "new"); // kiosk membership: "" (choose) | find | new
  const [search, setSearch] = useState("");
  const poll = useRef(null);
  const spun = useRef(null);
  const idle = useRef(null);

  const tier = tiers.find((t) => t.id === tierId);
  const amount = custom ? parseFloat(custom) : selected;
  const recurring = frequency !== "one_time";

  useEffect(() => () => { clearInterval(poll.current); clearTimeout(idle.current); }, []);
  // Membership: load the roster so the member can find their name (kiosk only; the public site never sees it).
  useEffect(() => {
    if (!kiosk || type !== "membership") return;
    api("kiosk_members", { campaign_id: campaign.id, kiosk_key: kioskKey }).then((r) => setMembers(r.members)).catch(() => setMembers([]));
  }, [campaign.id]);
  // Coming back from Stripe after authorizing: if this spin already happened, go straight to the plan.
  useEffect(() => {
    if (!resumeSpinId) return;
    api("spin_status", { donation_id: resumeSpinId }).then((r) => {
      if (r.done) finish(r);
      else if (r.number != null) { spun.current = r; setSpinNumber(r.number); setStep("plan"); }
    }).catch(() => { /* not spun yet: show the wheel */ });
  }, []);
  // Kiosk: nobody touching the plan screen -> pay in full, so the tablet is ready for the next person.
  useEffect(() => {
    clearTimeout(idle.current);
    if (kiosk && step === "plan") idle.current = setTimeout(() => choosePlan(1), PLAN_IDLE_MS);
  }, [step, months, splitOpen]);

  const reset = () => {
    clearInterval(poll.current); clearTimeout(idle.current);
    setStep("form"); setBusy(false); setError(""); setDonationId(null); setResult(null); setSpinNumber(null); setMonths(1); setSplitOpen(false);
    setF(blank); setSelected(null); setCustom(""); setFrequency("one_time"); setCount(""); setMethod("card"); setDaf({ donor: "", auth: "" });
    setMemberId(null); setSearch(""); setWho(kiosk && type === "membership" ? "" : "new");
  };

  const finish = (r) => {
    clearTimeout(idle.current);
    setResult(r); setStep("done"); setBusy(false);
    confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 } });
    onDone?.(r);
    if (kiosk) setTimeout(reset, 10000);
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
    setBusy(true);
    try {
      const d = await api("start_donation", {
        campaign_id: campaign.id, ...f,
        amount, frequency, count: recurring ? parseInt(count) : null,
        tier_id: tierId, tier_period: period, member_id: memberId,
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
      setSpinNumber(r.number);
    } catch (err) { setError(err.message); setBusy(false); }
  };
  // After the wheel stops: already charged (only one way to pay) or show the plan tiles.
  const wheelDone = () => {
    const r = spun.current;
    setBusy(false);
    if (r?.done) finish(r); else setStep("plan");
  };
  const choosePlan = async (m = months) => {
    clearTimeout(idle.current);
    setBusy(true); setError("");
    try { finish(await api("choose_plan", { donation_id: donationId, months: m })); }
    catch (err) { setError(err.message); setBusy(false); }
  };

  // ───────────── Screens ─────────────
  if (step === "done") {
    return (
      <div className="center" style={{ padding: "24px 0" }}>
        <CircleCheck size={56} className="done-icon" />
        <div className="eyebrow" style={{ justifyContent: "center" }}>Thank you</div>
        <h2>Tizku L’Mitzvos</h2>
        {result?.number != null ? (
          <>
            <p style={{ fontSize: 18 }}>Ticket <strong>#{result.number}</strong>, a <strong>{money(result.amount)}</strong> donation. You’re in the raffle!</p>
            <p className="muted" style={{ marginTop: 6 }}>
              {result.months > 1
                ? `${money(result.first, 2)} was charged today, then ${money(result.monthly, 2)} a month for ${result.months - 1} more month${result.months === 2 ? "" : "s"}.`
                : `${money(result.amount)} was charged to your card.`}
            </p>
          </>
        ) : <p className="muted">Your gift was received.</p>}
        {result?.recurring?.needsSetupLink && <p className="note warn">Phone wallets can’t be saved for future payments. The office will send you a link to set up the remaining payments.</p>}
        {result?.recurring?.subscriptionId && <p className="muted" style={{ marginTop: 6 }}>Your card was saved for the remaining payments.</p>}
        {f.email && <p className="muted" style={{ marginTop: 6 }}>A receipt is on its way to your email.</p>}
        {kiosk && <button className="ner-btn wide" style={{ marginTop: 22 }} onClick={reset}>Next person</button>}
      </div>
    );
  }

  if (step === "reader") {
    return (
      <div className="center" style={{ padding: "28px 0" }}>
        <CreditCard size={64} className="done-icon" style={{ animation: "pulse 1.6s infinite" }} />
        <h2>{type === "spin_raffle" ? "Tap or insert your card to authorize" : "Tap or insert your card on the reader"}</h2>
        {type === "spin_raffle" && <p className="muted">Your card is held for up to {money(tickets)}. You only pay the ticket number you land on.</p>}
        <Loader2 size={26} className="animate-spin" style={{ margin: "22px auto" }} />
        <button className="ner-btn ghost" onClick={() => cancelReader()}>Cancel</button>
      </div>
    );
  }

  if (step === "spin") {
    return (
      <div className="spin-stage">
        <h2>{spinNumber == null ? "Card authorized. Press the button to spin!" : "Good luck!"}</h2>
        <SpinWheel tickets={tickets} result={spinNumber} onDone={wheelDone} size={kiosk ? 320 : 340} />
        {spinNumber == null && <BigRedButton onClick={spin} disabled={busy}>{busy ? "…" : "SPIN"}</BigRedButton>}
        {error && <p className="note error">{error}</p>}
      </div>
    );
  }

  if (step === "plan") {
    const r = spun.current || {};
    const options = r.options || [{ months: 1, first: r.amount, monthly: r.amount }];
    const splits = options.filter((o) => o.months > 1);
    const chosen = options.find((o) => o.months === months) || options[0];
    const label = months > 1 ? `${money(chosen.monthly, chosen.monthly % 1 ? 2 : 0)}/mo × ${months}` : `Pay ${money(r.amount)} in Full`;
    return (
      <div className="flow">
        <div className="ticket-card">
          <div><small>Your drawn ticket</small><strong>Ticket #{r.number}</strong></div>
          <div><small>Donation amount</small><strong>{money(r.amount)}</strong></div>
        </div>
        <span className="plan-label">Choose how to pay (min $25/mo · max 12 months)</span>
        <div className="plan-choice">
          <button type="button" className="plan-tile" aria-pressed={months === 1 && !splitOpen} onClick={() => { setMonths(1); setSplitOpen(false); }}>
            <small>Option A</small><strong>Pay in Full Today</strong><span>One payment of {money(r.amount)}</span>
          </button>
          <button type="button" className="plan-tile" disabled={!splits.length} aria-pressed={splitOpen} onClick={() => { setSplitOpen(true); setMonths(splits[splits.length - 1]?.months || 2); }}>
            <small>Option B</small><strong>Split Monthly</strong><span>{splits.length ? `Up to ${splits[splits.length - 1].months} monthly payments` : "Not available for this ticket"}</span>
          </button>
        </div>
        {splitOpen && splits.length > 0 && (
          <>
            <span className="plan-label">Select monthly schedule</span>
            <div className="month-grid">
              {splits.map((o) => (
                <button key={o.months} type="button" className="month-tile" aria-pressed={months === o.months} onClick={() => setMonths(o.months)}>
                  <strong>{money(o.monthly, o.monthly % 1 ? 2 : 0)}/mo</strong><small>{o.months} months</small>
                </button>
              ))}
            </div>
            {chosen.first !== chosen.monthly && <p className="plan-summary">First payment {money(chosen.first, 2)} today (includes the extra cents), then {money(chosen.monthly, 2)} a month.</p>}
          </>
        )}
        {error && <p className="note error">{error}</p>}
        <button type="button" className="ner-btn wide" style={{ marginTop: 18, minHeight: 56, fontSize: 16 }} disabled={busy} onClick={() => choosePlan()}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : `Confirm Ticket #${r.number} · ${label}`}
        </button>
        <p className="muted center" style={{ fontSize: 12, marginTop: 8 }}>If no choice is made, the ticket is charged in full.</p>
      </div>
    );
  }

  // Kiosk membership: start with two big choices
  if (kiosk && type === "membership" && !who) {
    return (
      <div className="kiosk-choice">
        <button type="button" className="ner-btn" onClick={() => setWho("find")}><Search size={30} /> Find your name <ArrowRight size={22} /></button>
        <button type="button" className="ner-btn ghost" onClick={() => setWho("new")}><UserPlus size={30} /> New member <ArrowRight size={22} /></button>
      </div>
    );
  }

  const filtered = (members || []).filter((m) => m.name.toLowerCase().includes(search.toLowerCase())).slice(0, 40);

  return (
    <form onSubmit={submit} className="flow">
      {kiosk && type === "membership" && (
        <button type="button" className="back-link" onClick={() => { setWho(""); setMemberId(null); set("donor_name", ""); }}>← Start over</button>
      )}

      {kiosk && who === "find" && !memberId && (
        <>
          <label className="field"><span><Search size={17} /> Find your name</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Start typing your name" autoComplete="off" autoFocus />
          </label>
          <div className="member-list" style={{ maxHeight: 300, overflowY: "auto" }}>
            {members === null && <p className="muted">Loading…</p>}
            {filtered.map((m) => (
              <button type="button" key={m.id} className="member-row" onClick={() => { setMemberId(m.id); set("donor_name", m.name); }}>
                <span>{m.name}</span><ArrowRight size={17} />
              </button>
            ))}
            {members && filtered.length === 0 && <p className="muted">No match. <button type="button" className="see-all" onClick={() => setWho("new")}>Enter a new name</button></p>}
          </div>
        </>
      )}

      {(who === "new" || memberId) && (
        <>
          <label className="field">{memberId ? "Member" : "Your name"}
            <div className="inline-field" style={{ flexWrap: "nowrap" }}>
              <input value={f.donor_name} onChange={(e) => set("donor_name", e.target.value)} placeholder="Enter your name" required readOnly={!!memberId} style={{ maxWidth: "none" }} />
              {memberId && <button type="button" className="ner-btn ghost" onClick={() => { setMemberId(null); set("donor_name", ""); }}>Change</button>}
            </div>
          </label>
          {type !== "membership" && (
            <label className="check-label" style={{ marginTop: 0 }}><input type="checkbox" checked={f.is_anonymous} onChange={(e) => set("is_anonymous", e.target.checked)} /> Make my donation anonymous</label>
          )}
          <div className="field-grid">
            <label className="field">Phone{type === "spin_raffle" ? " (to reach the winner)" : ""}<input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 123-4567" required={kiosk} /></label>
            <label className="field">Email{kiosk ? " (for your receipt)" : ""}<input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="your@email.com" /></label>
          </div>

          {type === "regular" && (
            <>
              <div className="divider" />
              <span className="flow-label">Donation amount {recurring ? `(each ${everyLabel(frequency)})` : ""}</span>
              <div className={`option-grid ${quick.length === 4 ? "four" : ""}`}>
                {quick.map((amt) => (
                  <button key={amt} type="button" className="option" aria-pressed={selected === amt && !custom} onClick={() => { setSelected(amt); setCustom(""); }}>{money(amt)}</button>
                ))}
              </div>
              <label className="field">Other amount ($)<input type="number" min="1" step="0.01" inputMode="decimal" value={custom} onChange={(e) => { setCustom(e.target.value); setSelected(null); }} placeholder="Enter amount" /></label>

              {campaign.allow_recurring && (
                <>
                  <span className="flow-label">Frequency</span>
                  <div className="option-grid four">
                    {[["one_time", "One time"], ["month", "Monthly"], ["quarter", "Quarterly"], ["year", "Yearly"]].map(([v, label]) => (
                      <button key={v} type="button" className="option" aria-pressed={frequency === v} onClick={() => setFrequency(v)}>{label}</button>
                    ))}
                  </div>
                  {recurring && (
                    <label className="field">How many payments?
                      <div className="inline-field">
                        <input type="number" min="2" max="120" value={count} onChange={(e) => setCount(e.target.value)} placeholder="e.g. 12" />
                        {amount > 0 && parseInt(count) >= 2 && <span className="hint">{money(amount, 2)} × {parseInt(count)} = <strong>{money(amount * parseInt(count), 2)}</strong> total</span>}
                      </div>
                    </label>
                  )}
                </>
              )}

              <span className="flow-label">Dedication (optional)</span>
              <div className="option-grid">
                {[["none", "None"], ["in_honor", "In honor of"], ["in_memory", "In memory of"]].map(([v, label]) => (
                  <button key={v} type="button" className="option" aria-pressed={f.dedication_type === v} onClick={() => set("dedication_type", v)}>{label}</button>
                ))}
              </div>
              {f.dedication_type !== "none" && <label className="field">Name<input value={f.dedication_message} onChange={(e) => set("dedication_message", e.target.value)} maxLength={300} /></label>}
            </>
          )}

          {type === "membership" && (
            <>
              <div className="divider" />
              <span className="flow-label">Membership level</span>
              {tiers.length === 0 && <p className="muted">Membership levels have not been set up yet.</p>}
              {tiers.some((t) => t.monthly_amount) && tiers.some((t) => t.yearly_amount) && (
                <div className="option-grid two" style={{ maxWidth: 320 }}>
                  {[["month", "Monthly"], ["year", "Yearly"]].map(([v, label]) => (
                    <button key={v} type="button" className="option" aria-pressed={period === v} onClick={() => setPeriod(v)}>{label}</button>
                  ))}
                </div>
              )}
              <div className="tier-list">
                {tiers.map((t) => {
                  const price = period === "year" ? t.yearly_amount : t.monthly_amount;
                  return (
                    <button key={t.id} type="button" disabled={!price} className="tier-card" aria-pressed={tierId === t.id} onClick={() => setTierId(t.id)} style={price ? undefined : { opacity: 0.4 }}>
                      <strong>{t.name}</strong><span>{price ? `${money(price)} / ${period}` : "Not available"}</span>{t.description && <p>{t.description}</p>}
                    </button>
                  );
                })}
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Renews automatically every {period} until you cancel.</p>
            </>
          )}

          {type === "spin_raffle" && (
            <div className="note" style={{ display: "block" }}>
              <strong style={{ display: "block", marginBottom: 4 }}>How it works</strong>
              There are <strong>{tickets}</strong> tickets, numbered 1 to {tickets}, and each number is sold once.
              Your card is held for up to <strong>{money(tickets)}</strong>, then you press the big red button.
              The number you land on is your donation (ticket #72 is $72). Then choose to pay in full or split it monthly (at least $25 a month, up to 12 months).
              {campaign.raffle_prize && <> Every ticket is one entry to win <strong>{campaign.raffle_prize}</strong>.</>}
            </div>
          )}

          {type === "regular" && org.donors_fund_enabled && (
            <>
              <span className="flow-label">Payment method</span>
              <div className="option-grid two">
                <button type="button" className="option" aria-pressed={method === "card"} onClick={() => setMethod("card")}>{kiosk ? "Card on reader" : "Debit / credit card"}</button>
                <button type="button" className="option" aria-pressed={method === "daf"} onClick={() => setMethod("daf")}>Donors Fund</button>
              </div>
              {method === "daf" && (
                <div className="field-grid">
                  <label className="field">Donors Fund card number<input value={daf.donor} onChange={(e) => setDaf({ ...daf, donor: e.target.value })} inputMode="numeric" maxLength={40} required /></label>
                  <label className="field">CVV / PIN<input type="password" value={daf.auth} onChange={(e) => setDaf({ ...daf, auth: e.target.value })} maxLength={20} required /></label>
                </div>
              )}
            </>
          )}

          {error && <p className="note error">{error}</p>}
          <button type="submit" disabled={busy} className={`ner-btn wide ${type === "spin_raffle" ? "" : "gold"}`} style={{ marginTop: 16, minHeight: 56, fontSize: 16 }}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : type === "spin_raffle" ? `Authorize card (up to ${money(tickets)})` : type === "membership" ? `Join${tier ? ` · ${tier.name}` : ""}` : kiosk && method === "card" ? "Continue to card reader" : `Donate${amount > 0 ? ` ${money(amount, amount % 1 ? 2 : 0)}` : ""}`}
            {!busy && <ArrowRight size={18} />}
          </button>
          {!kiosk && method === "card" && <p className="muted center" style={{ fontSize: 12, marginTop: 8 }}>You’ll enter your card on Stripe’s secure checkout page.</p>}
        </>
      )}
    </form>
  );
}
