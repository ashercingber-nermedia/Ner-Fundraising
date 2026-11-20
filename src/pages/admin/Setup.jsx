import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Circle, Copy, ExternalLink, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { orgUrl, useCampaigns, useOrg, isPlatformHost } from "@/lib/org";
import { api, supabase, uploadAsset } from "@/lib/supabase";

export const paymentsReady = (org) => !!(org.stripe_charges_enabled || org.stripe_own_keys);

function Step({ n, title, done, children, optional }) {
  return (
    <Card>
      <CardContent className="p-5 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          {done ? <CheckCircle2 className="w-6 h-6 text-green-600" /> : <Circle className="w-6 h-6 text-brand/30" />}
          <h3 className="text-lg font-semibold text-brand">{n}. {title}</h3>
          {optional && <span className="text-xs px-2 py-0.5 rounded-full bg-brand/10 text-brand/70">Optional</span>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

// First-run checklist for a new organization: look, story, details, Stripe, Donors Fund, share.
export default function Setup() {
  const { org, reloadOrg } = useOrg();
  const { defaultCampaign, refetch } = useCampaigns();
  const qc = useQueryClient();
  const { data: pay, refetch: refetchPay } = useQuery({ queryKey: ["payment_status", org.id], queryFn: () => api("payment_status", { org_id: org.id }) });
  const [o, setO] = useState({ logo_url: org.logo_url || "", theme: org.theme || {}, about_text: org.about_text || "", legal_name: org.legal_name || "", address: org.address || "", tax_id: org.tax_id || "" });
  const [c, setC] = useState(null);
  const [dfAccount, setDfAccount] = useState("");
  const [dfKeys, setDfKeys] = useState({ donors_fund_api_key: "", donors_fund_validation_token: "" });
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (defaultCampaign && !c) setC({ id: defaultCampaign.id, headline: defaultCampaign.headline || "", images: defaultCampaign.images || [], goal_amount: defaultCampaign.goal_amount || 0 });
  }, [defaultCampaign]);
  useEffect(() => { if (pay) setDfAccount(pay.donors_fund.account || ""); }, [pay]);
  // Coming back from Stripe: refresh the connection status
  useEffect(() => { refetchPay().then(() => reloadOrg()); }, []);

  const site = isPlatformHost() ? orgUrl(org) : window.location.origin;
  const saveOrg = async (fields, label) => {
    setBusy(label);
    const patch = Object.fromEntries(fields.map((k) => [k, o[k]]));
    const { error } = await supabase.from("organizations").update(patch).eq("id", org.id);
    setBusy("");
    if (error) return toast.error(error.message);
    toast.success("Saved"); reloadOrg();
  };
  const saveCampaign = async () => {
    setBusy("story");
    const [r1, r2] = await Promise.all([
      supabase.from("organizations").update({ about_text: o.about_text }).eq("id", org.id),
      supabase.from("campaigns").update({ headline: c.headline, images: c.images, goal_amount: Number(c.goal_amount) || 0 }).eq("id", c.id),
    ]);
    setBusy("");
    if (r1.error || r2.error) return toast.error((r1.error || r2.error).message);
    toast.success("Saved"); reloadOrg(); refetch(); qc.invalidateQueries({ queryKey: ["campaigns"] });
  };
  const upload = async (file, onUrl) => {
    try { onUrl(await uploadAsset(org.id, file)); } catch (e) { toast.error(e.message); }
  };
  const connect = async () => {
    setBusy("stripe");
    try { const r = await api("connect_start", { org_id: org.id, return_url: window.location.href.split("#")[0] }); window.location.href = r.url; }
    catch (e) { toast.error(e.message); setBusy(""); }
  };
  const saveDonorsFund = async () => {
    setBusy("df");
    try {
      const values = { donors_fund_account_number: dfAccount, ...(dfKeys.donors_fund_api_key ? dfKeys : {}) };
      await api("save_secrets", { org_id: org.id, values });
      toast.success("Saved"); refetchPay(); reloadOrg();
    } catch (e) { toast.error(e.message); }
    setBusy("");
  };

  const steps = {
    look: !!org.logo_url,
    story: !!(org.about_text && (defaultCampaign?.images?.length || 0) > 0),
    details: !!(org.legal_name && org.address && org.tax_id),
    stripe: paymentsReady(org),
  };
  const doneCount = Object.values(steps).filter(Boolean).length;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-brand">Set up {org.name}</h2>
        <p className="text-brand/70">{doneCount} of 4 steps done. Your site is live at{" "}
          <a href={site} target="_blank" rel="noreferrer" className="underline">{site.replace(/^https?:\/\//, "")}</a>
          {steps.stripe ? "." : ". It starts taking donations once Stripe is connected."}</p>
        <div className="h-2 bg-brand/10 rounded-full mt-3 overflow-hidden"><div className="h-full bg-gold transition-all" style={{ width: `${doneCount * 25}%` }} /></div>
      </div>

      <Step n={1} title="Logo and colors" done={steps.look}>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-28 h-20 rounded-lg bg-brand flex items-center justify-center overflow-hidden">
            {o.logo_url ? <img src={o.logo_url} alt="" className="max-h-16 max-w-24 object-contain" /> : <span className="text-white/60 text-xs">No logo</span>}
          </div>
          <input type="file" accept="image/*" className="text-sm" onChange={(e) => e.target.files[0] && upload(e.target.files[0], (url) => setO((x) => ({ ...x, logo_url: url })))} />
        </div>
        <div className="flex gap-5 mt-4 flex-wrap">
          {[["brand", "Main color", "#0F172A"], ["accent", "Accent", "#C5A059"], ["canvas", "Background", "#F8F5F0"]].map(([k, l, d]) => (
            <label key={k} className="text-sm flex items-center gap-2 text-brand"><input type="color" value={o.theme[k] || d} onChange={(e) => setO({ ...o, theme: { ...o.theme, [k]: e.target.value } })} />{l}</label>
          ))}
        </div>
        <div className="flex items-center gap-4 flex-wrap mt-4">
          <div className="w-28 h-20 rounded-lg overflow-hidden bg-brand/10">
            <img src={o.theme.hero_image || "/stock/sanctuary.jpg"} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="text-sm text-brand">
            <p className="font-medium">Cover photo for your home page</p>
            <input type="file" accept="image/*" className="text-sm mt-1" onChange={(e) => e.target.files[0] && upload(e.target.files[0], (url) => setO((x) => ({ ...x, theme: { ...x.theme, hero_image: url } })))} />
            {o.theme.hero_image && <button type="button" className="text-xs underline text-brand/60 ml-2" onClick={() => setO((x) => ({ ...x, theme: { ...x.theme, hero_image: "" } }))}>Use the default photo</button>}
          </div>
        </div>
        <Button className="mt-4 bg-brand hover:bg-brand/90" disabled={busy === "look"} onClick={() => saveOrg(["logo_url", "theme"], "look")}>Save</Button>
      </Step>

      <Step n={2} title="Description and photos" done={steps.story}>
        {c ? (
          <div className="space-y-3">
            <div><Label>About your organization</Label>
              <textarea className="w-full rounded-md border border-input p-2 text-sm mt-1" rows={4} value={o.about_text} onChange={(e) => setO({ ...o, about_text: e.target.value })} placeholder="Who you are and what donations support" /></div>
            <div><Label>Headline on your donation page</Label><Input value={c.headline} onChange={(e) => setC({ ...c, headline: e.target.value })} /></div>
            <div className="w-48"><Label>Goal in $ (0 = no goal bar)</Label><Input type="number" min="0" value={c.goal_amount} onChange={(e) => setC({ ...c, goal_amount: e.target.value })} /></div>
            <div>
              <Label>Photos (up to 3)</Label>
              <div className="flex gap-2 items-center flex-wrap mt-1">
                {c.images.map((src) => (
                  <div key={src} className="relative"><img src={src} alt="" className="h-16 w-24 object-cover rounded" />
                    <button type="button" onClick={() => setC({ ...c, images: c.images.filter((i) => i !== src) })} className="absolute -top-2 -right-2 bg-white rounded-full shadow"><XCircle className="w-5 h-5 text-red-500" /></button></div>
                ))}
                {c.images.length < 3 && <input type="file" accept="image/*" className="text-sm" onChange={(e) => e.target.files[0] && upload(e.target.files[0], (url) => setC((x) => ({ ...x, images: [...x.images, url] })))} />}
              </div>
            </div>
            <Button className="bg-brand hover:bg-brand/90" disabled={busy === "story"} onClick={saveCampaign}>Save</Button>
          </div>
        ) : <Loader2 className="w-5 h-5 animate-spin text-brand" />}
      </Step>

      <Step n={3} title="Details for receipts" done={steps.details}>
        <p className="text-sm text-brand/70 mb-3">Printed on every donor's tax receipt. The tax ID is also needed for Donors Fund.</p>
        <div className="grid md:grid-cols-2 gap-3">
          <div><Label>Legal name</Label><Input value={o.legal_name} onChange={(e) => setO({ ...o, legal_name: e.target.value })} /></div>
          <div><Label>Tax ID (EIN)</Label><Input value={o.tax_id} onChange={(e) => setO({ ...o, tax_id: e.target.value })} placeholder="12-3456789" /></div>
          <div className="md:col-span-2"><Label>Address</Label><Input value={o.address} onChange={(e) => setO({ ...o, address: e.target.value })} /></div>
        </div>
        <Button className="mt-4 bg-brand hover:bg-brand/90" disabled={busy === "details"} onClick={() => saveOrg(["legal_name", "address", "tax_id"], "details")}>Save</Button>
      </Step>

      <Step n={4} title="Connect Stripe to take card donations" done={steps.stripe}>
        <div className="text-sm text-brand/80 space-y-2 mb-4">
          <p>Donations go straight into your organization's own Stripe account and are paid out to your bank. Ner Media never holds your money.</p>
          <p>Stripe will ask for your organization's details and bank account. Registered 501(c)(3)s can then apply to Stripe for its discounted nonprofit rate.</p>
        </div>
        {steps.stripe ? (
          <p className="text-green-700 font-medium flex items-center gap-2"><CheckCircle2 className="w-5 h-5" />Stripe is connected. Your site is taking donations.</p>
        ) : (
          <>
            <Button className="bg-[#635bff] hover:bg-[#5249e0] text-white" disabled={busy === "stripe" || pay?.platform_ready === false} onClick={connect}>
              {busy === "stripe" ? <Loader2 className="w-4 h-4 animate-spin" /> : org.stripe_account_id ? "Continue Stripe setup" : "Connect with Stripe"}
            </Button>
            {org.stripe_account_id && <p className="text-sm text-amber-700 mt-2">Stripe still needs a few details before you can take donations. Click above to finish.</p>}
            {pay?.platform_ready === false && <p className="text-sm text-amber-700 mt-2">Stripe sign-up opens soon. Ner Media will let you know.</p>}
          </>
        )}
      </Step>

      <Step n={5} title="Donors Fund" done={org.donors_fund_enabled} optional>
        <p className="text-sm text-brand/80 mb-3">Lets donors give from their Donors Fund card on your donation page.</p>
        {pay ? (
          <div className="space-y-3">
            <div className="max-w-sm"><Label>Your Donors Fund charity account number</Label><Input value={dfAccount} onChange={(e) => setDfAccount(e.target.value)} /></div>
            {!pay.donors_fund.platform_key && (
              <>
                <p className="text-sm text-brand/70">Get an API key and validation token from The Donors Fund (ask them for "API integration" for your charity), then paste them here.</p>
                <div className="grid md:grid-cols-2 gap-3">
                  <div><Label>API key{pay.donors_fund.api_key ? " (saved)" : ""}</Label><Input type="password" autoComplete="off" value={dfKeys.donors_fund_api_key} onChange={(e) => setDfKeys({ ...dfKeys, donors_fund_api_key: e.target.value })} /></div>
                  <div><Label>Validation token{pay.donors_fund.token ? " (saved)" : ""}</Label><Input type="password" autoComplete="off" value={dfKeys.donors_fund_validation_token} onChange={(e) => setDfKeys({ ...dfKeys, donors_fund_validation_token: e.target.value })} /></div>
                </div>
              </>
            )}
            {!org.tax_id && <p className="text-sm text-amber-700">Add your tax ID in step 3 first.</p>}
            <Button variant="outline" disabled={busy === "df"} onClick={saveDonorsFund}>Save Donors Fund</Button>
          </div>
        ) : <Loader2 className="w-5 h-5 animate-spin text-brand" />}
      </Step>

      <Card>
        <CardContent className="p-5 md:p-6 flex gap-6 items-center flex-wrap">
          <div className="bg-white p-2 rounded-lg border"><QRCodeSVG value={site} size={110} /></div>
          <div className="space-y-2 flex-1 min-w-[220px]">
            <h3 className="text-lg font-semibold text-brand">Share your site</h3>
            <div className="flex gap-2"><Input readOnly value={site} />
              <Button variant="outline" size="icon" onClick={() => { navigator.clipboard?.writeText(site); toast.success("Copied"); }}><Copy className="w-4 h-4" /></Button></div>
            <div className="flex gap-2 flex-wrap">
              <a href={site} target="_blank" rel="noreferrer"><Button variant="outline"><ExternalLink className="w-4 h-4 mr-1" />Open my site</Button></a>
              <Link to="/admin/poster"><Button variant="outline">Make a poster</Button></Link>
              <Link to="/admin"><Button className="bg-brand hover:bg-brand/90">Go to dashboard</Button></Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
