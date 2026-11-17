import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, CreditCard, Gift, Globe, Loader2, Mail, Monitor, Palette, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { NerLogo } from "@/components/NerBadge";
import { NER_MEDIA_SITE, PLATFORM_DOMAIN, Spinner, useOrg } from "@/lib/org";
import { api, money, supabase } from "@/lib/supabase";

const NAVY = "#1a2d5a";

// ───────────── Signup: "Get a free fundraising website" ─────────────
export function StartPage() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [check, setCheck] = useState(null); // { slug, available, reason, url }
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => { document.title = "Free fundraising website — Ner Media"; }, []);

  // Live check of the web address as they type
  useEffect(() => {
    const value = slugEdited ? slug : name;
    if (value.trim().length < 3) { setCheck(null); return; }
    const t = setTimeout(() => {
      api("check_slug", { slug: value }).then((r) => { setCheck(r); if (!slugEdited) setSlug(r.slug); }).catch(() => setCheck(null));
    }, 350);
    return () => clearTimeout(t);
  }, [name, slug, slugEdited]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!check?.available) return setError(check?.reason || "Please choose a web address");
    setBusy(true);
    try {
      const r = await api("create_org", { name, slug: check.slug, email });
      if (r.fallback) {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: r.redirect } });
        if (error) throw error;
      }
      setDone(r);
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <div className="min-h-screen" style={{ background: "#ede8e1" }}>
      <header className="max-w-5xl mx-auto px-5 py-5 flex items-center justify-between">
        <a href={NER_MEDIA_SITE} className="flex items-center gap-2 no-underline" style={{ color: NAVY }}>
          <NerLogo size={30} /><span className="text-lg font-semibold">Ner Media</span>
        </a>
        <Link to="/login" className="text-sm" style={{ color: NAVY }}>Sign in</Link>
      </header>

      <main className="max-w-5xl mx-auto px-5 pb-16 grid md:grid-cols-2 gap-10 items-start">
        <section className="pt-6">
          <p className="uppercase tracking-widest text-xs font-semibold" style={{ color: "#b8860b" }}>Free for shuls, yeshivos and organizations</p>
          <h1 className="text-4xl md:text-5xl font-semibold leading-tight mt-3" style={{ color: NAVY }}>Your own fundraising website, free.</h1>
          <p className="mt-4 text-lg" style={{ color: `${NAVY}cc` }}>
            Type your organization's name and get a live donation page in a minute, with a goal bar, donor list and receipts.
            Donations go straight into your own Stripe account.
          </p>
          <ul className="mt-6 space-y-3" style={{ color: NAVY }}>
            {[
              [Globe, `Your own address: yourname.${PLATFORM_DOMAIN}`],
              [Palette, "Your logo, photos and description"],
              [CreditCard, "Card payments through your own Stripe account; Donors Fund too"],
              [Mail, "Automatic email receipts with your tax ID"],
              [Monitor, "Live projector screen with confetti for every donation"],
            ].map(([Icon, text]) => (
              <li key={text} className="flex gap-3 items-start"><Icon className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "#c9a227" }} />{text}</li>
            ))}
          </ul>
          <p className="mt-6 text-sm" style={{ color: `${NAVY}99` }}>
            Want raffles with a spinning wheel, a donation screen in your shul, or a card-reader kiosk?{" "}
            <a href={NER_MEDIA_SITE} style={{ color: NAVY }} className="underline">Ask Ner Media about upgrades</a>.
          </p>
        </section>

        <Card className="shadow-xl rounded-2xl">
          <CardContent className="p-6 md:p-8">
            {done ? (
              <div className="text-center space-y-4 py-6">
                <Mail className="w-12 h-12 mx-auto" style={{ color: "#c9a227" }} />
                <h2 className="text-2xl font-semibold" style={{ color: NAVY }}>Check your email</h2>
                <p style={{ color: `${NAVY}cc` }}>
                  We sent a sign-in link to <strong>{email}</strong>. Click it to open your new site at{" "}
                  <strong>{done.slug}.{PLATFORM_DOMAIN}</strong> and finish setting it up.
                </p>
                <p className="text-xs" style={{ color: `${NAVY}99` }}>Your address is held for 2 days until you sign in.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5">
                <h2 className="text-2xl font-semibold" style={{ color: NAVY }}>Create your free site</h2>
                <div className="space-y-2">
                  <Label style={{ color: NAVY }}>Organization name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kahal Ner Shlomo" className="h-12" required maxLength={80} />
                </div>
                <div className="space-y-2">
                  <Label style={{ color: NAVY }}>Your web address</Label>
                  <div className="flex items-center rounded-md border border-input bg-white h-12 px-3">
                    <input
                      value={slug}
                      onChange={(e) => { setSlugEdited(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }}
                      placeholder="your-name"
                      className="flex-1 min-w-0 outline-none bg-transparent"
                      aria-label="Web address"
                    />
                    <span className="text-gray-500 text-sm">.{PLATFORM_DOMAIN}</span>
                  </div>
                  {check && (
                    <p className={`text-sm flex items-center gap-1 ${check.available ? "text-green-700" : "text-red-600"}`}>
                      {check.available ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      {check.available ? `${check.url} is available` : check.reason}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label style={{ color: NAVY }}>Your email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="h-12" required />
                  <p className="text-xs text-gray-500">You'll get a link to sign in. No password needed.</p>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <Button type="submit" disabled={busy || !check?.available} className="w-full h-12 text-base" style={{ background: NAVY }}>
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create my free site"}
                </Button>
                <p className="text-xs text-center text-gray-500">Free forever. Ner Media never holds your money.</p>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

// ───────────── Ner Media owner page: every organization on the platform ─────────────
export function PlatformPage() {
  const { session, isPlatformAdmin, authChecked, signOut } = useOrg();
  const qc = useQueryClient();
  const enabled = !!session && isPlatformAdmin;
  const { data, isLoading } = useQuery({ queryKey: ["platform_orgs"], enabled, queryFn: () => api("platform_orgs") });
  const { data: health } = useQuery({ queryKey: ["health"], enabled, queryFn: () => api("health") });
  const [filter, setFilter] = useState("");

  if (session === undefined || !authChecked) return <Spinner />;
  if (!session || !isPlatformAdmin) return <Navigate to="/login" replace />;

  const set = async (org, patch) => {
    try { await api("platform_set", { org_id: org.id, ...patch }); toast.success("Saved"); qc.invalidateQueries({ queryKey: ["platform_orgs"] }); }
    catch (e) { toast.error(e.message); }
  };
  const orgs = (data?.orgs || []).filter((o) => !filter || `${o.name} ${o.slug} ${o.owner_email}`.toLowerCase().includes(filter.toLowerCase()));
  const Ok = ({ ok, children }) => <span className={`inline-flex items-center gap-1 text-sm ${ok ? "text-green-700" : "text-amber-700"}`}>{ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}{children}</span>;

  return (
    <div className="min-h-screen bg-[#ede8e1]">
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2" style={{ color: NAVY }}><NerLogo size={24} /><span className="font-semibold">Ner Media — Fundraising sites</span></div>
          <div className="flex gap-3 items-center">
            <Link to="/" className="text-sm" style={{ color: NAVY }}>Signup page</Link>
            <button onClick={signOut} className="text-sm text-gray-500">Sign out</button>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {health && (
          <Card><CardContent className="p-4 flex gap-6 flex-wrap">
            <Ok ok={health.email}>Emails (Resend)</Ok>
            <Ok ok={health.stripe_platform}>Stripe platform account</Ok>
            <Ok ok={health.stripe_webhook}>Stripe Connect webhook</Ok>
            <Ok ok={health.donors_fund_platform}>Donors Fund platform key (optional)</Ok>
          </CardContent></Card>
        )}
        <div className="flex gap-3 items-center">
          <h2 className="text-xl font-semibold" style={{ color: NAVY }}>{data?.orgs?.length ?? "…"} organizations</h2>
          <Input placeholder="Search" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs bg-white ml-auto" />
        </div>
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          {isLoading ? <Loader2 className="w-6 h-6 animate-spin m-8" /> : (
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500 border-b"><tr>{["Organization", "Status", "Payments", "Raised", "Raffles", "Plan", ""].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id} className="border-b last:border-0 align-top">
                    <td className="p-3">
                      <p className="font-medium" style={{ color: NAVY }}>{o.name}</p>
                      <a href={o.url} target="_blank" rel="noreferrer" className="text-xs text-blue-700">{o.slug}.{data.domain}</a>
                      {o.domains?.length > 0 && <p className="text-xs text-gray-500">{o.domains.join(", ")}</p>}
                      <p className="text-xs text-gray-500">{o.owner_email} · {new Date(o.created_at).toLocaleDateString("en-US")}</p>
                    </td>
                    <td className="p-3">{o.status === "pending" ? <span className="text-amber-700">Waiting for sign-in</span> : o.status === "suspended" ? <span className="text-red-600">Suspended</span> : <span className="text-green-700">Live</span>}</td>
                    <td className="p-3">
                      <Ok ok={o.stripe_charges_enabled || o.stripe_own_keys}>{o.stripe_own_keys ? "Own Stripe keys" : o.stripe_charges_enabled ? "Stripe connected" : o.stripe_account_id ? "Stripe unfinished" : "No Stripe yet"}</Ok>
                      {o.donors_fund_enabled && <p className="text-xs text-gray-500">+ Donors Fund</p>}
                    </td>
                    <td className="p-3">{money(o.raised)}</td>
                    <td className="p-3"><label className="flex items-center gap-2"><input type="checkbox" checked={o.raffle_enabled} onChange={(e) => set(o, { raffle_enabled: e.target.checked })} /><Gift className="w-4 h-4 text-gray-400" /></label></td>
                    <td className="p-3">
                      <select value={o.plan} onChange={(e) => set(o, { plan: e.target.value })} className="h-8 rounded border px-2"><option value="free">Free</option><option value="pro">Upgraded</option></select>
                    </td>
                    <td className="p-3 whitespace-nowrap space-x-1">
                      <a href={`/admin?org=${o.slug}`}><Button size="sm" variant="outline">Open admin</Button></a>
                      {o.status !== "pending" && (
                        <Button size="sm" variant="ghost" className={o.status === "suspended" ? "" : "text-red-600"}
                          onClick={() => window.confirm(o.status === "suspended" ? `Turn ${o.name} back on?` : `Take ${o.name}'s site offline?`) && set(o, { status: o.status === "suspended" ? "active" : "suspended" })}>
                          {o.status === "suspended" ? "Turn on" : "Suspend"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
