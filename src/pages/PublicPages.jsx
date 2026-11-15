import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle, Loader2, Mail, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import DonateFlow from "@/components/DonateFlow";
import { useOrg, useCampaigns, useFeed, Spinner } from "@/lib/org";
import { api, money, supabase } from "@/lib/supabase";

function Footer({ org }) {
  return (
    <div className="mt-8 text-center text-brand/50 text-xs">
      <p className="font-medium">{org.name}</p>
      {org.address && <p>{org.address}</p>}
      {org.tax_id && <p>Tax ID: {org.tax_id}</p>}
    </div>
  );
}

// ───────────── Donate (web) ─────────────
export function DonatePage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const { org } = useOrg();
  const { bySlug, isLoading } = useCampaigns();
  const campaign = bySlug(slug);
  if (isLoading) return <Spinner />;
  if (!campaign || !campaign.is_active) return <div className="min-h-screen bg-canvas flex items-center justify-center text-brand/60">This campaign is not available.</div>;
  const amount = parseFloat(params.get("amount"));
  return (
    <div className="min-h-screen bg-canvas">
      <div className="bg-white/60 border-b border-brand/10">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Link to={`/c/${campaign.slug}`} className="inline-flex items-center gap-2 text-brand hover:opacity-70">
            <ArrowLeft className="w-5 h-5" /><span className="font-medium">Back</span>
          </Link>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-light text-brand">
            {campaign.type === "membership" ? "Become a member of" : campaign.type === "spin_raffle" ? "Spin to support" : "Yes! I would like to support"}
          </h1>
          <h2 className="text-3xl md:text-4xl font-semibold text-brand mt-2">{org.name}!</h2>
        </div>
        <Card className="bg-white/90 shadow-xl rounded-2xl">
          <CardContent className="p-6 md:p-8">
            <DonateFlow org={org} campaign={campaign} mode="web" resumeSpinId={params.get("spin")} prefill={{ amount: amount > 0 ? amount : null, monthly: params.get("monthly") === "1" }} />
          </CardContent>
        </Card>
        <Footer org={org} />
      </div>
    </div>
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
  if (!allowed) return <div className="min-h-screen bg-canvas flex items-center justify-center p-8 text-center text-brand">This kiosk link is not valid. Ask an admin for a new kiosk link.</div>;
  const active = campaigns.filter((c) => c.is_active);
  const campaign = active.find((c) => c.slug === slug) || defaultCampaign;
  if (!campaign) return <div className="min-h-screen bg-canvas flex items-center justify-center text-brand/60">No active campaign.</div>;
  const goal = Number(campaign.goal_amount || 0);

  return (
    <div className="min-h-screen bg-canvas p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold text-brand">{org.name}</h1>
          <div className="flex items-center gap-2">
            {active.length > 1 && (
              <select value={campaign.slug} onChange={(e) => setSlug(e.target.value)} className="h-9 rounded-md border border-brand/30 bg-white px-2 text-sm text-brand">
                {active.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
              </select>
            )}
            <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${reader?.online ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
              {!reader?.online && <WifiOff className="w-3 h-3" />}Reader {reader?.online ? "ready" : reader?.status === "not_configured" ? "not set up" : "offline"}
            </span>
          </div>
        </div>
        {goal > 0 && (
          <div className="mb-4">
            <div className="flex justify-between text-sm text-brand mb-1"><span>{campaign.name}</span><span>{money(feed?.raised)} of {money(goal)}</span></div>
            <div className="h-3 bg-brand/10 rounded-full overflow-hidden"><div className="h-full bg-gold" style={{ width: `${Math.min((Number(feed?.raised || 0) / goal) * 100, 100)}%` }} /></div>
          </div>
        )}
        <Card className="bg-white shadow-xl rounded-2xl">
          <CardContent className="p-6 md:p-8">
            <DonateFlow key={campaign.id} org={org} campaign={campaign} mode="kiosk" kioskKey={key} />
          </CardContent>
        </Card>
      </div>
    </div>
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
    <div className="min-h-screen bg-canvas p-6">
      <div className="max-w-4xl mx-auto">
        <Link to={`/c/${campaign.slug}`}><Button variant="outline" size="sm" className="mb-4"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button></Link>
        <h1 className="text-3xl font-light text-brand text-center mb-6">{campaign.name}</h1>
        <div className="grid md:grid-cols-3 gap-3">
          {list.map((d) => (
            <div key={d.id} className="bg-white/80 rounded-lg p-4 shadow-sm border border-gold/30 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-brand font-medium text-lg truncate">{d.display_name}</p>
                {d.parnas_sponsor && <p className="text-gold text-sm">Sponsored by: {d.parnas_sponsor}</p>}
                {d.dedication_type !== "none" && d.dedication_message && (
                  <p className="text-brand/50 text-sm italic truncate">{d.dedication_type === "in_honor" ? "In Honor Of: " : d.dedication_type === "in_memory" ? "In Memory Of: " : ""}{d.dedication_message}</p>
                )}
              </div>
              <p className="text-xl text-gold font-light">{d.tier_name || money(d.amount)}</p>
            </div>
          ))}
        </div>
        {list.length === 0 && <p className="text-center text-brand/40 py-12">Nothing here yet.</p>}
      </div>
    </div>
  );
}

// ───────────── Thank you ─────────────
export function ThankYouPage() {
  const { org } = useOrg();
  const [params] = useSearchParams();
  const c = params.get("c");
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="bg-white rounded-full p-6 inline-block mb-6 shadow"><CheckCircle className="w-20 h-20 text-green-600" /></div>
        <h1 className="text-3xl font-bold text-brand mb-4">Thank You for Your Donation!</h1>
        <p className="text-brand/80 mb-8">Your generous support helps {org.name} continue its mission. If you entered an email, a receipt is on its way.</p>
        <div className="flex flex-col gap-3">
          <Link to={c ? `/c/${c}` : "/"}><Button className="w-full bg-brand hover:bg-brand/90">Return to Home</Button></Link>
          {c && <Link to={`/c/${c}/donate`}><Button variant="outline" className="w-full">Make Another Donation</Button></Link>}
        </div>
      </div>
    </div>
  );
}

// ───────────── Admin sign-in: a one-time link sent by email (no passwords to manage) ─────────────
export function LoginPage() {
  const { org, session, isAdmin, authChecked, signOut } = useOrg();
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  if (session && authChecked && isAdmin) return <Navigate to="/admin" replace />;
  const send = async (e) => {
    e.preventDefault();
    setState("sending"); setError("");
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/admin` } });
    if (error) { setError(error.message); setState("idle"); } else setState("sent");
  };
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <Card className="max-w-md w-full"><CardContent className="p-8 text-center space-y-4">
        <h1 className="text-xl font-semibold text-brand">{org.name} — Admin</h1>
        {session && authChecked && !isAdmin ? (
          <>
            <p className="text-sm text-gray-600">You are signed in as {session.user.email}, which is not an admin of this organization. Ask an existing admin to invite this email.</p>
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
