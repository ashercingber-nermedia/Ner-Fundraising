import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import confetti from "canvas-confetti";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, ArrowRight, HandHeart, Link2, Maximize, Minimize, Receipt, ShieldCheck, Trophy } from "lucide-react";
import SiteLayout, { OrgMark, Progress, shortAddress, stockImage, typeTag } from "@/components/SiteLayout";
import NerBadge from "@/components/NerBadge";
import { useCampaigns, useFeed, useOrg, Spinner } from "@/lib/org";
import { money } from "@/lib/supabase";

const parnasLabel = { amudei_hakolel: "Amudei Hakolel", parnes_hayom: "Parnes Hayom", parnes_hashavua: "Parnes Hashavua" };
const dedication = (d) =>
  d.dedication_type && d.dedication_type !== "none" && d.dedication_message
    ? `${d.dedication_type === "in_honor" ? "In honor of " : d.dedication_type === "in_memory" ? "In memory of " : ""}${d.dedication_message}`
    : "";
const shown = (c, d) => (c.type === "membership" && d.tier_name ? d.tier_name : c.type === "spin_raffle" && d.ticket_number ? `Ticket #${d.ticket_number}` : money(d.amount));
const actionLabel = (c) => (c.type === "membership" ? "Become a member" : c.type === "spin_raffle" ? "Spin to give" : "Donate now");

function NotAvailable() {
  return <SiteLayout><div className="wrap center-page"><div className="panel"><h2>This campaign is not available</h2><Link to="/" className="ner-btn">Back to home</Link></div></div></SiteLayout>;
}

// ───────────── Organization home: hero, trust strip, campaign cards ─────────────
export function OrgHome() {
  const { org } = useOrg();
  const { campaigns, defaultCampaign, isLoading } = useCampaigns();
  if (isLoading) return <Spinner />;
  const active = campaigns.filter((c) => c.is_active).sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
  const hero = org.theme?.hero_image || "/stock/sanctuary.jpg";
  const city = shortAddress(org.address);
  const words = org.name.trim().split(/\s+/);
  const long = org.name.length > 22;
  return (
    <SiteLayout>
      <section className="org-hero">
        <img className="hero-image" src={hero} alt="" />
        <div className="hero-shade" />
        <div className="wrap hero-inner">
          <div className="hero-copy">
            {city && <div className="eyebrow">{city}</div>}
            <h1 className={long ? "long" : ""}>{words.slice(0, -1).join(" ")}{words.length > 1 && <br />}{words[words.length - 1]}<span>.</span></h1>
            <p>{org.about_text || `Support ${org.name}. Every gift makes a difference.`}</p>
            <div className="hero-actions">
              {defaultCampaign && <Link to={`/c/${defaultCampaign.slug}/donate`} className="ner-btn gold">{actionLabel(defaultCampaign)} <ArrowRight size={17} /></Link>}
              {active.length > 1 && <a href="#campaigns" className="ner-btn ghost">All campaigns</a>}
            </div>
          </div>
        </div>
      </section>
      <div className="trust-strip">
        <div className="wrap trust-inner">
          <div><ShieldCheck size={21} /> Secure card payments</div>
          <div><Receipt size={21} /> Receipts by email</div>
          <div className="trust-hebrew"><span dir="rtl" lang="he">תזכו למצוות</span> <span>Tizku L’Mitzvos</span></div>
        </div>
      </div>
      <section className="wrap campaigns" id="campaigns">
        <div className="section-top">
          <div><div className="eyebrow">Ways to give</div><h2>{active.length === 1 ? "Our Campaign" : "Active Campaigns"}</h2></div>
          <p>Choose a cause close to your heart.</p>
        </div>
        {active.length === 0 ? <p className="muted">No campaigns are open right now.</p> : (
          <div className={`campaign-grid count-${Math.min(active.length, 3)}`}>
            {active.map((c, i) => <CampaignCard key={c.id} c={c} i={i} />)}
          </div>
        )}
      </section>
    </SiteLayout>
  );
}

function CampaignCard({ c, i }) {
  const { data: feed } = useFeed(c.id, 30000);
  const raised = Number(feed?.raised || 0);
  const goal = Number(c.goal_amount || 0);
  const count = c.type === "membership" ? `${feed?.members_paid || 0} members paid` : c.type === "spin_raffle" ? `${feed?.tickets_sold?.length || 0} of ${c.ticket_count || 0} tickets` : `${feed?.donors || 0} donations`;
  return (
    <Link to={`/c/${c.slug}`} className="campaign-card">
      <div className="card-image"><img src={stockImage(c, i)} alt="" /><span>{typeTag[c.type]?.toUpperCase()}</span></div>
      <div className="card-body">
        <h3>{c.name}</h3>
        <p>{c.headline || c.description || ""}</p>
        <div className="goal-line"><strong>{money(raised)}</strong>{goal > 0 && <small>of {money(goal)}</small>}</div>
        {goal > 0 && <Progress raised={raised} goal={goal} />}
        <div className="card-end"><span>{count}</span><span>View campaign <ArrowRight size={15} /></span></div>
      </div>
    </Link>
  );
}

// ───────────── Campaign page ─────────────
export default function CampaignPage() {
  const { slug } = useParams();
  const { campaigns, bySlug, defaultCampaign, isLoading } = useCampaigns();
  const campaign = slug ? bySlug(slug) : defaultCampaign;
  const { data: feed } = useFeed(campaign?.id, 8000);
  const [amount, setAmount] = useState(null);
  const [custom, setCustom] = useState("");
  const [copied, setCopied] = useState("");
  if (isLoading) return <Spinner />;
  if (!campaign || !campaign.is_active) return <NotAvailable />;

  const c = campaign;
  const raised = Number(feed?.raised || 0);
  const goal = Number(c.goal_amount || 0);
  const donations = feed?.donations || [];
  const donateUrl = `/c/${c.slug}/donate`;
  const pageUrl = `${window.location.origin}/c/${c.slug}`;
  const many = campaigns.filter((x) => x.is_active).length > 1;
  const isSpin = c.type === "spin_raffle", isMember = c.type === "membership";
  const sold = feed?.tickets_sold || [];
  const total = Number(c.ticket_count) || feed?.tickets_total || 0;
  const pick = custom ? Number(custom) : amount;
  const quick = (c.suggested_tiers?.length ? c.suggested_tiers : (c.quick_amounts || []).map((a) => ({ amount: a })));
  const tiers = (c.membership_tiers || []).filter((t) => t.is_active);
  const counts = isMember
    ? `${feed?.members_paid || 0}${feed?.members_total ? ` of ${feed.members_total}` : ""} members paid`
    : isSpin ? `${sold.length} of ${total} tickets taken` : `${feed?.donors || 0} donations`;

  return (
    <SiteLayout>
      <div className="wrap screen">
        {many && <a href="/#campaigns" className="back-link"><ArrowLeft size={16} /> All campaigns</a>}
        {isSpin && c.raffle_winner && (
          <div className="winner"><Trophy size={34} /><div><div className="eyebrow">Raffle winner</div><strong>{c.raffle_winner.display_name}</strong></div></div>
        )}
        <div className="screen-grid campaign-detail">
          <section className="panel impact-panel">
            <div className="eyebrow">{typeTag[c.type]}</div>
            <h1>{c.name}</h1>
            {(c.headline || c.description) && <p>{c.headline || c.description}</p>}
            {c.headline && c.description && <p style={{ marginTop: -10 }}>{c.description}</p>}
            <div className="impact-number">{money(raised)}</div>
            <div className="impact-goal">{goal > 0 ? <>raised of <strong>{money(goal)}</strong> goal</> : "raised so far"}</div>
            {goal > 0 && <Progress raised={raised} goal={goal} />}
            <div className="goal-line">{goal > 0 && <span>{Math.round((raised / goal) * 100)}% funded</span>}<span>{counts}</span></div>
            {c.tag_labels?.length > 0 && <div className="raffle-facts" style={{ gridTemplateColumns: `repeat(${Math.min(c.tag_labels.length, 4)},minmax(0,1fr))` }}>{c.tag_labels.map((t) => <div key={t} style={{ background: "#ffffff14", borderColor: "#ffffff33", color: "#fff" }}><small style={{ color: "#f3e8d2", fontSize: 12, fontWeight: 700 }}>{t}</small></div>)}</div>}
          </section>

          <section className="panel donate-panel">
            <div className="eyebrow"><HandHeart size={15} /> {isMember ? "Membership" : isSpin ? "Spin raffle" : "Give to this campaign"}</div>
            {isMember ? (
              <>
                <h2>Choose your level</h2>
                <p className="muted">Renews automatically until you cancel.</p>
                <div className="tier-list">
                  {tiers.map((t) => (
                    <Link key={t.id} to={`${donateUrl}?tier=${t.id}`} className="tier-card">
                      <strong>{t.name}</strong>
                      <span>{t.monthly_amount ? `${money(t.monthly_amount)} / month` : `${money(t.yearly_amount)} / year`}</span>
                      {t.description && <p>{t.description}</p>}
                    </Link>
                  ))}
                  {tiers.length === 0 && <p className="muted">Membership levels are coming soon.</p>}
                </div>
                <Link to={donateUrl} className="ner-btn gold wide">Find my name or join <ArrowRight size={16} /></Link>
              </>
            ) : isSpin ? (
              <>
                <h2>{c.raffle_prize ? `Win: ${c.raffle_prize}` : "One number, one gift"}</h2>
                <p className="muted">Spin for a ticket from 1 to {total}. The number you land on is your donation, and each number is sold once. Pay in full or split it monthly.</p>
                <div className="raffle-facts">
                  <div><strong>{total - sold.length}</strong><small>tickets left</small></div>
                  <div><strong>$1–{total}</strong><small>ticket range</small></div>
                  <div><strong>$25+</strong><small>monthly option</small></div>
                </div>
                {c.raffle_winner ? <p className="note">This raffle has been drawn. Thank you to everyone who took part!</p>
                  : sold.length >= total && total > 0 ? <p className="note">Every ticket has been sold. Thank you!</p>
                  : <Link to={donateUrl} className="ner-btn spin-button wide">SPIN TO GIVE</Link>}
              </>
            ) : (
              <>
                <h2>Make a difference</h2>
                <p className="muted">Choose an amount.</p>
                <div className="option-grid">
                  {quick.slice(0, 5).map((t) => (
                    <button key={`${t.amount}${t.monthly ? "m" : ""}`} type="button" className="option" aria-pressed={!custom && amount === t.amount} onClick={() => { setAmount(t.amount); setCustom(""); }}>
                      {money(t.amount)}{t.monthly ? "/mo" : ""}{t.label && <small>{t.label}</small>}
                    </button>
                  ))}
                  <button type="button" className="option" aria-pressed={!!custom || (amount === "custom")} onClick={() => { setAmount("custom"); }}>Other</button>
                </div>
                {amount === "custom" && <label className="field">Amount ($)<input autoFocus type="number" inputMode="decimal" min="1" step="0.01" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="0.00" /></label>}
                {pick > 0 ? (
                  <Link className="ner-btn gold wide" to={`${donateUrl}?amount=${pick}${quick.find((t) => t.amount === pick && t.monthly) && !custom ? "&monthly=1" : ""}`}>Donate {money(pick, pick % 1 ? 2 : 0)} <ArrowRight size={16} /></Link>
                ) : <Link className="ner-btn gold wide" to={donateUrl}>Donate <ArrowRight size={16} /></Link>}
              </>
            )}
          </section>

          <section className="panel">
            <div className="eyebrow">Our community</div>
            <h2>{isMember ? "Members" : isSpin ? "Recent spins" : "Recent donors"}</h2>
            <div className="member-list">
              {donations.slice(0, 6).map((d) => (
                <div className="member-row donor-row" key={d.id}>
                  <span>{d.display_name}{parnasLabel[d.parnas_type] && <small>{parnasLabel[d.parnas_type]}</small>}{dedication(d) && <span className="ded">{dedication(d)}</span>}</span>
                  <strong>{shown(c, d)}</strong>
                </div>
              ))}
              {donations.length === 0 && <p className="muted">Be the first to give.</p>}
            </div>
            {donations.length > 6 && <Link to={`/c/${c.slug}/all`} className="see-all">See all {donations.length}</Link>}
          </section>

          <section className="panel share-panel">
            <div className="eyebrow">Spread the word</div>
            <h2>Share this campaign</h2>
            <p className="muted">Scan to open this page on a phone.</p>
            <div className="share-qr" style={{ padding: 8, background: "#fff", width: 150, height: 150 }}><QRCodeSVG value={pageUrl} size={132} fgColor="#101620" /></div>
            <button className="ner-btn ghost" type="button" onClick={async () => { try { await navigator.clipboard.writeText(pageUrl); setCopied("Link copied"); } catch { setCopied("Copy the address from your browser to share."); } }}>
              <Link2 size={16} /> Copy campaign link
            </button>
            <div className="muted" role="status">{copied}</div>
          </section>
        </div>

        {isSpin && total > 0 && (
          <section className="panel ticket-panel">
            <div className="ticket-title">
              <div><div className="eyebrow">Ticket board</div><h2>{total} numbered tickets</h2></div>
              <div className="ticket-key"><span><i /> Available</span><span><i /> Taken</span></div>
            </div>
            <div className="ticket-grid">
              {Array.from({ length: total }, (_, i) => i + 1).map((n) => <span key={n} className={sold.includes(n) ? "taken" : ""}>{n}</span>)}
            </div>
          </section>
        )}
      </div>
    </SiteLayout>
  );
}

// ───────────── Projector / TV screen: /screen or /c/:slug/screen ─────────────
export function ProjectorPage() {
  const { slug } = useParams();
  const { org } = useOrg();
  const { bySlug, defaultCampaign, isLoading } = useCampaigns();
  const c = slug ? bySlug(slug) : defaultCampaign;
  const { data: feed } = useFeed(c?.id, 5000);
  const seen = useRef(null);
  const box = useRef(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!feed) return;
    const ids = new Set(feed.donations.map((d) => d.id));
    if (seen.current && feed.donations.some((d) => !seen.current.has(d.id))) confetti({ particleCount: 180, spread: 100, origin: { y: 0.55 } });
    seen.current = ids;
  }, [feed]);
  useEffect(() => {
    const change = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);

  if (isLoading) return <Spinner />;
  if (!c) return <NotAvailable />;
  const raised = Number(feed?.raised || 0);
  const goal = Number(c.goal_amount || 0);
  const donations = feed?.donations || [];
  const isSpin = c.type === "spin_raffle", isMember = c.type === "membership";
  const sold = feed?.tickets_sold || [];
  const total = Number(c.ticket_count) || feed?.tickets_total || 0;
  const giveUrl = `${window.location.origin}/c/${c.slug}/donate`;
  const toggle = () => (document.fullscreenElement ? document.exitFullscreen() : box.current?.requestFullscreen?.().catch(() => null));

  return (
    <div className="ner projector-full" ref={box}>
      <section className="projector-stage">
        <button className="projector-toggle" onClick={toggle} aria-label="Full screen">{full ? <Minimize size={20} /> : <Maximize size={20} />}</button>
        <header>
          <span>{org.logo_url ? <span style={{ background: "#ffffff14", padding: ".5cqw 1cqw", borderRadius: ".6cqw", display: "inline-flex" }}><img src={org.logo_url} alt="" /></span> : null} {org.name}</span>
          <span className="live-pill"><i /> LIVE</span>
        </header>
        <div className="projector-body">
          <div className={`projector-main ${isSpin && !c.raffle_winner && total > 0 && total <= 500 ? "with-board" : ""}`}>
            <div className="eyebrow">{c.name}</div>
            {isSpin && c.raffle_winner ? (
              <><p>Raffle winner</p><div className="projector-winner">{c.raffle_winner.display_name}</div></>
            ) : (
              <>
                <h1>{money(raised)}</h1>
                <p>{goal > 0 ? `raised toward ${money(goal)}` : "raised so far"}</p>
                {goal > 0 && <Progress raised={raised} goal={goal} />}
                <strong>
                  {goal > 0 ? `${Math.round((raised / goal) * 100)}% funded · ` : ""}
                  {isMember ? `${feed?.members_paid || 0}${feed?.members_total ? ` of ${feed.members_total}` : ""} members paid` : isSpin ? `${sold.length} of ${total} tickets taken` : `${feed?.donors || 0} donations`}
                </strong>
                {isSpin && total > 0 && total <= 500 && (
                  <div className="projector-board">{Array.from({ length: total }, (_, i) => i + 1).map((n) => <span key={n} className={sold.includes(n) ? "taken" : ""}>{n}</span>)}</div>
                )}
              </>
            )}
          </div>
          <div className="projector-feed">
            <h2>{isMember ? "Members" : isSpin ? "Recent spins" : "Recent giving"}</h2>
            <div className="projector-feed-list" aria-live="polite">
              {donations.slice(0, 7).map((d) => (
                <div className="projector-entry" key={d.id}>
                  <span>{d.display_name}<small>{parnasLabel[d.parnas_type] || (isMember ? "Membership paid" : isSpin ? "Raffle ticket" : "Donation")}</small>{dedication(d) && <span className="ded">{dedication(d)}</span>}</span>
                  <b>{shown(c, d)}</b>
                </div>
              ))}
              {donations.length === 0 && <p style={{ fontSize: "1.8cqw", opacity: 0.6 }}>Waiting for the first gift…</p>}
            </div>
          </div>
        </div>
        <footer>
          <span className="projector-qr"><span>Scan to give</span><div><QRCodeSVG value={giveUrl} size={120} /></div></span>
          <span dir="rtl" lang="he" style={{ fontSize: "2cqw" }}>תזכו למצוות</span>
          <NerBadge dark />
        </footer>
      </section>
    </div>
  );
}

export { OrgMark };
