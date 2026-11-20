import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CircleCheck, Loader2, Mail, ShieldCheck, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import DonateFlow from "@/components/DonateFlow";
import NerBadge from "@/components/NerBadge";
import SiteLayout, { Progress, Subhead, typeTag } from "@/components/SiteLayout";
import { paymentsReady } from "@/pages/admin/Setup";
import { useOrg, useCampaigns, useFeed, Spinner } from "@/lib/org";
import { api, money, supabase } from "@/lib/supabase";

// ───────────── Donate (web) ─────────────
export function DonatePage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const { org } = useOrg();
  const { bySlug, isLoading } = useCampaigns();
  const campaign = bySlug(slug);
  const { data: feed } = useFeed(campaign?.id, 30000);
  if (isLoading) return <Spinner />;
  if (!campaign || !campaign.is_active) return <SiteLayout><div className="wrap center-page"><div className="panel"><h2>This campaign is not available</h2><Link to="/" className="ner-btn">Back to home</Link></div></div></SiteLayout>;
  const amount = parseFloat(params.get("amount"));
  const open = paymentsReady(org) || (org.donors_fund_enabled && campaign.type === "regular");
  const raised = Number(feed?.raised || 0), goal = Number(campaign.goal_amount || 0);
  const title = campaign.type === "membership" ? "Become a member" : campaign.type === "spin_raffle" ? "Spin to give" : "Complete your gift";
  return (
    <SiteLayout nav={false}>
      <div className="wrap screen">
        <Link to={`/c/${campaign.slug}`} className="back-link"><ArrowLeft size={16} /> Back to {campaign.name}</Link>
        <Subhead label={org.name} title={title} />
        <div className="screen-grid checkout-grid">
          <section className="panel">
            {!open ? (
              <div className="center" style={{ padding: "30px 0" }}>
                <h2>Online donations open soon</h2>
                <p className="muted">{org.name} is finishing setting up its donation page. Please check back shortly.</p>
              </div>
            ) : <DonateFlow org={org} campaign={campaign} mode="web" resumeSpinId={params.get("spin")} prefill={{ amount: amount > 0 ? amount : null, monthly: params.get("monthly") === "1", tierId: params.get("tier") }} />}
          </section>
          <aside className="panel checkout-summary">
            <div className="eyebrow">{typeTag[campaign.type]}</div>
            <h2>{campaign.name}</h2>
            <div className="impact-number" style={{ fontSize: 44 }}>{money(raised)}</div>
            <p className="muted">{goal > 0 ? `raised of ${money(goal)} goal` : "raised so far"}</p>
            {goal > 0 && <Progress raised={raised} goal={goal} />}
            <div className="note"><ShieldCheck size={17} style={{ flex: "none" }} /> Card payments are processed securely by Stripe. Your receipt is emailed to you.</div>
            {org.tax_id && <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>{org.legal_name || org.name} · Tax ID {org.tax_id}</p>}
          </aside>
        </div>
      </div>
    </SiteLayout>
  );
}

// ───────────── Kiosk tablet: /kiosk?key=...  (admins can also open /kiosk while signed in) ─────────────
export function KioskPage() {
  const [params] = useSearchParams();
  const { org, isAdmin, authChecked } = useOrg();
  const { campaigns, defaultCampaign, isLoading } = useCampaigns();
  const key = params.get("key") || localStorage.getItem("kiosk_key") || undefined;
  const [allowed, setAllowed] = useState(null);
  const [reader, setReader] = useState(null);
  const [slug, setSlug] = useState(params.get("c") || null);
  const { data: feed } = useFeed((campaigns.find((c) => c.slug === slug) || defaultCampaign)?.id, 10000);

  useEffect(() => {
    if (!org || !authChecked) return;
    if (key) {
      api("kiosk_open", { org_slug: org.slug, kiosk_key: key })
        .then(() => { localStorage.setItem("kiosk_key", key); setAllowed(true); })
        .catch(() => setAllowed(isAdmin));
    } else setAllowed(isAdmin);
  }, [org, authChecked, isAdmin]);

  useEffect(() => {
    if (!allowed || !org) return;
    const check = () => api("reader_status", { org_id: org.id, kiosk_key: key }).then(setReader).catch(() => setReader({ online: false }));
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, [allowed]);

  if (isLoading || allowed === null) return <Spinner />;
  if (!allowed) return <CenterMessage title="This kiosk link is not valid">Ask an admin for a new kiosk link.</CenterMessage>;
  const active = campaigns.filter((c) => c.is_active);
  const campaign = active.find((c) => c.slug === slug) || defaultCampaign;
  if (!campaign) return <CenterMessage title="No active campaign" />;
  const goal = Number(campaign.goal_amount || 0);
  const raised = Number(feed?.raised || 0);
  const welcome = campaign.type === "membership" ? "Membership" : campaign.type === "spin_raffle" ? "Spin raffle" : "Give";

  return (
    <SiteLayout nav={false} className="kiosk">
      <div className="wrap screen">
        <div className="kiosk-top">
          {active.length > 1 ? (
            <label className="field" style={{ margin: 0 }}><select value={campaign.slug} onChange={(e) => setSlug(e.target.value)}>{active.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></label>
          ) : <span />}
          <span className={`pill ${reader?.online ? "ok" : "bad"}`}>{!reader?.online && <WifiOff size={13} />}Card reader {reader?.online ? "ready" : reader?.status === "not_configured" ? "not set up" : "offline"}</span>
        </div>
        <Subhead label={`Welcome to ${org.name}`} title={campaign.name}>{welcome === "Give" ? "Give in person. Tap your card on the reader." : welcome === "Membership" ? "Find your name or join, then tap your card." : "Authorize your card, then press the big red button."}</Subhead>
        {goal > 0 && (
          <div className="kiosk-panel" style={{ marginBottom: 16 }}>
            <div className="goal-line"><strong>{money(raised)}</strong><small>of {money(goal)}</small></div>
            <Progress raised={raised} goal={goal} />
          </div>
        )}
        <section className="panel kiosk-panel">
          <DonateFlow key={campaign.id} org={org} campaign={campaign} mode="kiosk" kioskKey={key} />
        </section>
      </div>
    </SiteLayout>
  );
}

// ───────────── Full donor list ─────────────
export function AllDonationsPage() {
  const { slug } = useParams();
  const { bySlug, defaultCampaign, isLoading } = useCampaigns();
  const campaign = slug ? bySlug(slug) : defaultCampaign;
  const { data: feed } = useFeed(campaign?.id, 15000);
  if (isLoading) return <Spinner />;
  if (!campaign) return <Navigate to="/" replace />;
  const list = [...(feed?.donations || [])].sort((a, b) => b.amount - a.amount);
  return (
    <SiteLayout>
      <div className="wrap screen">
        <Link to={`/c/${campaign.slug}`} className="back-link"><ArrowLeft size={16} /> Back</Link>
        <Subhead label="Our community" title={campaign.name} />
        <section className="panel">
          <div className="member-list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", columnGap: 24 }}>
            {list.map((d) => (
              <div key={d.id} className="member-row donor-row">
                <span>{d.display_name}
                  {d.parnas_sponsor && <small>Sponsored by: {d.parnas_sponsor}</small>}
                  {d.dedication_type !== "none" && d.dedication_message && <span className="ded">{d.dedication_type === "in_honor" ? "In honor of " : d.dedication_type === "in_memory" ? "In memory of " : ""}{d.dedication_message}</span>}
                </span>
                <strong>{d.tier_name || (d.ticket_number ? `#${d.ticket_number}` : money(d.amount))}</strong>
              </div>
            ))}
          </div>
          {list.length === 0 && <p className="muted center">Nothing here yet.</p>}
        </section>
      </div>
    </SiteLayout>
  );
}

// ───────────── Thank you ─────────────
export function ThankYouPage() {
  const { org } = useOrg();
  const [params] = useSearchParams();
  const c = params.get("c");
  return (
    <SiteLayout>
      <div className="wrap center-page">
        <div className="panel">
          <CircleCheck size={56} className="done-icon" />
          <div className="eyebrow">Thank you</div>
          <h2 style={{ fontSize: 46 }}>Tizku L’Mitzvos</h2>
          <p className="muted" style={{ margin: "10px 0 22px" }}>Your generous support helps {org.name} continue its work. If you entered an email, a receipt is on its way.</p>
          <div style={{ display: "grid", gap: 10 }}>
            <Link to={c ? `/c/${c}` : "/"} className="ner-btn">Back to the campaign</Link>
            {c && <Link to={`/c/${c}/donate`} className="ner-btn ghost">Make another gift</Link>}
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}

export function CenterMessage({ title, children }) {
  return (
    <div className="ner">
      <div className="wrap center-page">
        <div className="panel"><h2>{title}</h2>{children && <p className="muted">{children}</p>}</div>
      </div>
      <NerBadge fixed />
    </div>
  );
}

// ───────────── Admin sign-in: a one-time link sent by email (no passwords to manage) ─────────────
export function LoginPage() {
  const { org, session, isAdmin, isPlatformAdmin, authChecked, signOut } = useOrg();
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const home = org ? "/admin" : "/platform";
  if (session && authChecked && (org ? isAdmin : isPlatformAdmin)) return <Navigate to={home} replace />;
  const send = async (e) => {
    e.preventDefault();
    setState("sending"); setError("");
    const redirect = `${window.location.origin}${home}`;
    try {
      const r = await api("send_login_link", { email: email.trim(), org_slug: org?.slug, redirect });
      if (r.fallback) {
        const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirect } });
        if (error) throw error;
      }
      setState("sent");
    } catch (err) { setError(err.message); setState("idle"); }
  };
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <Card className="max-w-md w-full"><CardContent className="p-8 text-center space-y-4">
        <h1 className="text-xl font-semibold text-brand">{org ? `${org.name} — Admin` : "Ner Media — Owner sign-in"}</h1>
        {session && authChecked && !isAdmin ? (
          <>
            <p className="text-sm text-gray-600">You are signed in as {session.user.email}, which is not an admin here. Ask an existing admin to invite this email.</p>
            <Button variant="outline" onClick={signOut}>Sign out</Button>
          </>
        ) : state === "sent" ? (
          <><Mail className="w-10 h-10 text-gold mx-auto" /><p className="text-brand">Check your email for a sign-in link.</p></>
        ) : (
          <form onSubmit={send} className="space-y-3">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" className="h-12" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={state === "sending"} className="w-full h-12 bg-brand hover:bg-brand/90">
              {state === "sending" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Email me a sign-in link"}
            </Button>
          </form>
        )}
      </CardContent></Card>
    </div>
  );
}

// ───────────── Old Base44 addresses keep working (printed QR codes, emailed links) ─────────────
export function LegacyRedirect() {
  const { pathname, search } = useLocation();
  const { campaigns, isLoading } = useCampaigns();
  if (isLoading) return <Spinner />;
  const page = pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
  const fixed = { home: "/admin", managedonations: "/admin/donations", createposter: "/admin/poster", alldonations: "/all", setuprecurring: "/setup-recurring", donationsuccess: "/thank-you" };
  if (fixed[page]) return <Navigate to={fixed[page] + search} replace />;
  const c = campaigns.find((x) => (x.legacy_pages || []).some((p) => p.toLowerCase() === page));
  if (c) return <Navigate to={`/c/${c.slug}${page.startsWith("donate") ? "/donate" : ""}${search}`} replace />;
  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-4 text-brand">
      <p className="text-xl">Page not found</p>
      <Link to="/"><Button className="bg-brand">Go home</Button></Link>
    </div>
  );
}
