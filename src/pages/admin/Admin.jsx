import { useMemo, useRef, useState } from "react";
import { Link, NavLink, Navigate, Outlet } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Eye, EyeOff, Link2, Loader2, Mail, MailCheck, Monitor, Tablet, Trash2, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrg, useCampaigns, Spinner } from "@/lib/org";
import { api, money, supabase } from "@/lib/supabase";

export const selectCls = "h-10 rounded-md border border-input bg-white px-3 text-sm";

export function AdminLayout() {
  const { org, session, isAdmin, authChecked, signOut } = useOrg();
  if (session === undefined || !authChecked) return <Spinner />;
  if (!session || !isAdmin) return <Navigate to="/login" replace />;
  const tab = ({ isActive }) => `px-3 py-2 rounded-md text-sm font-medium ${isActive ? "bg-brand text-white" : "text-brand hover:bg-brand/10"}`;
  return (
    <div className="min-h-screen bg-canvas">
      <div className="bg-white border-b border-brand/10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-brand">{org.name}</h1>
          <nav className="flex gap-1 flex-wrap">
            <NavLink to="/admin" end className={tab}>Dashboard</NavLink>
            <NavLink to="/admin/donations" className={tab}>Donations</NavLink>
            <NavLink to="/admin/campaigns" className={tab}>Campaigns</NavLink>
            <NavLink to="/admin/members" className={tab}>Members</NavLink>
            <NavLink to="/admin/poster" className={tab}>Poster</NavLink>
            <NavLink to="/admin/settings" className={tab}>Settings</NavLink>
            <button onClick={signOut} className="px-3 py-2 text-sm text-brand/60 hover:text-brand">Sign out</button>
          </nav>
        </div>
      </div>
      <div className="max-w-7xl mx-auto p-4 md:p-6"><Outlet /></div>
    </div>
  );
}

export function useDonations() {
  const { org } = useOrg();
  return useQuery({
    queryKey: ["donations", org.id],
    queryFn: async () => {
      const all = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("donations").select("*").eq("org_id", org.id).order("created_at", { ascending: false }).range(from, from + 999);
        if (error) throw error;
        all.push(...data);
        if (data.length < 1000) break;
      }
      return all;
    },
  });
}

// Same rule the public pages use: pledge renewals are already inside the pledge total; membership renewals are new money.
const counts = (d) => d.status === "completed" && ((d.show_on_projector && !d.is_recurring_renewal) || (d.is_recurring_renewal && d.kind === "membership"));
export const raisedFor = (campaign, donations) =>
  donations.filter((d) => counts(d) && (campaign.counts_all_campaigns || d.campaign_id === campaign.id)).reduce((n, d) => n + Number(d.amount), 0);

const typeName = { regular: "Regular", spin_raffle: "Spin raffle", membership: "Membership" };

// ───────────── Dashboard ─────────────
export function Dashboard() {
  const { org } = useOrg();
  const { campaigns } = useCampaigns();
  const { data: donations = [] } = useDonations();
  const qc = useQueryClient();
  const blank = { campaign_id: "", donor_name: "", display_name: "", phone: "", email: "", amount: "", months: "", is_anonymous: false, parnas_type: "none", parnas_sponsor: "", parnas_message: "" };
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const cashCampaigns = campaigns.filter((c) => c.type === "regular");

  const recordCash = async (e) => {
    e.preventDefault();
    const amount = parseFloat(f.amount), months = parseInt(f.months) || 0;
    const campaign_id = f.campaign_id || cashCampaigns.find((c) => c.is_default)?.id || cashCampaigns[0]?.id;
    if (!(amount > 0) || !campaign_id) return toast.error("Enter an amount and pick a campaign.");
    setSaving(true);
    const { data, error } = await supabase.from("donations").insert({
      org_id: org.id, campaign_id, donor_name: f.donor_name, display_name: f.is_anonymous ? "Anonymous" : f.display_name || f.donor_name,
      phone: f.phone, email: f.email, is_anonymous: f.is_anonymous,
      amount: months > 1 ? amount * months : amount, kind: months > 1 ? "pledge" : "one_time",
      is_recurring: months > 1, recurring_interval: months > 1 ? "month" : null, recurring_count: months > 1 ? months : null,
      parnas_type: f.parnas_type, parnas_sponsor: f.parnas_sponsor, parnas_message: f.parnas_message,
      donation_type: "cash", donation_source: "cash", status: "completed",
    }).select().single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Cash donation recorded");
    if (data.email) api("send_receipt", { donation_id: data.id }).then(() => toast.success("Receipt emailed")).catch((err) => toast.error("Receipt not sent: " + err.message));
    setF(blank);
    qc.invalidateQueries({ queryKey: ["donations"] });
    qc.invalidateQueries({ queryKey: ["feed"] });
  };

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        {campaigns.map((c) => {
          const raised = raisedFor(c, donations), goal = Number(c.goal_amount);
          return (
            <Card key={c.id} className={c.is_active ? "" : "opacity-50"}>
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <p className="font-semibold text-brand">{c.name}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gold/20 text-brand whitespace-nowrap">{typeName[c.type]}{c.is_default ? " · home page" : ""}</span>
                </div>
                <p className="text-2xl font-light text-brand">{money(raised)} <span className="text-sm text-brand/50">{goal > 0 ? `of ${money(goal)}` : ""}</span></p>
                {goal > 0 && <div className="h-2 bg-brand/10 rounded-full overflow-hidden"><div className="h-full bg-gold" style={{ width: `${Math.min((raised / goal) * 100, 100)}%` }} /></div>}
                <div className="flex gap-2 pt-1 flex-wrap">
                  <Link to={`/c/${c.slug}`} target="_blank"><Button size="sm" variant="outline"><Monitor className="w-3.5 h-3.5 mr-1" />Screen</Button></Link>
                  <Link to={`/kiosk?c=${c.slug}`} target="_blank"><Button size="sm" variant="outline"><Tablet className="w-3.5 h-3.5 mr-1" />Card reader</Button></Link>
                  <Link to={`/c/${c.slug}/donate`} target="_blank"><Button size="sm" variant="outline">Donate page</Button></Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-brand text-lg">Record a cash or check donation</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={recordCash} className="grid md:grid-cols-4 gap-3 items-end">
            <div><Label>Campaign</Label>
              <select className={selectCls + " w-full"} value={f.campaign_id} onChange={(e) => set("campaign_id", e.target.value)}>
                <option value="">Home page campaign</option>
                {cashCampaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><Label>Donor name</Label><Input required value={f.donor_name} onChange={(e) => set("donor_name", e.target.value)} /></div>
            <div><Label>Name to show (optional)</Label><Input value={f.display_name} onChange={(e) => set("display_name", e.target.value)} /></div>
            <div><Label>Amount {parseInt(f.months) > 1 ? "per month" : ""}</Label><Input required type="number" min="1" step="0.01" value={f.amount} onChange={(e) => set("amount", e.target.value)} /></div>
            <div><Label>Phone</Label><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
            <div><Label>Email (gets a receipt)</Label><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div><Label>Months (blank = one time)</Label><Input type="number" min="2" value={f.months} onChange={(e) => set("months", e.target.value)} /></div>
            <div><Label>Parnas</Label>
              <select className={selectCls + " w-full"} value={f.parnas_type} onChange={(e) => set("parnas_type", e.target.value)}>
                <option value="none">None</option><option value="parnes_hayom">Parnes Hayom</option><option value="parnes_hashavua">Parnes Hashavua</option><option value="amudei_hakolel">Amudei Hakolel</option>
              </select></div>
            {f.parnas_type !== "none" && <>
              <div className="md:col-span-2"><Label>Sponsored by</Label><Input value={f.parnas_sponsor} onChange={(e) => set("parnas_sponsor", e.target.value)} /></div>
              <div className="md:col-span-2"><Label>Parnas message</Label><Input value={f.parnas_message} onChange={(e) => set("parnas_message", e.target.value)} /></div>
            </>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_anonymous} onChange={(e) => set("is_anonymous", e.target.checked)} />Anonymous</label>
            <Button type="submit" disabled={saving} className="bg-brand hover:bg-brand/90">{saving ? "Saving..." : "Record donation"}</Button>
          </form>
          <p className="text-xs text-brand/50 mt-3">Card and Donors Fund payments: use the “Card reader” button on a campaign above. Membership payments by cash: use the Members tab.</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────── CSV helpers (export + bringing donations over from the old Base44 app) ─────────────
function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((c) => c !== "")) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some((c) => c !== "")) rows.push(row);
  const head = (rows.shift() || []).map((h) => h.trim().replace(/^﻿/, ""));
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
// Cells starting with = + - @ would run as formulas in Excel; a leading apostrophe makes them plain text.
const csvCell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function downloadCsv(name, rows) {
  if (!rows.length) return;
  const head = Object.keys(rows[0]);
  const text = [head.join(","), ...rows.map((r) => head.map((h) => csvCell(r[h])).join(","))].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
const truthy = (v) => /^(true|1|yes)$/i.test(String(v).trim());

// ───────────── Donations ─────────────
export function Donations() {
  const { org } = useOrg();
  const { campaigns } = useCampaigns();
  const { data: donations = [], isLoading } = useDonations();
  const qc = useQueryClient();
  const [campaignId, setCampaignId] = useState("");
  const [status, setStatus] = useState("completed");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const fileRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["donations"] }); qc.invalidateQueries({ queryKey: ["feed"] }); };
  const cName = (id) => campaigns.find((c) => c.id === id)?.name || "";

  const rows = useMemo(() => donations.filter((d) =>
    (!campaignId || d.campaign_id === campaignId) && (status === "all" || d.status === status) &&
    (!search || `${d.donor_name} ${d.email} ${d.phone} ${d.cardholder_name}`.toLowerCase().includes(search.toLowerCase()))), [donations, campaignId, status, search]);
  const total = rows.filter((d) => d.status === "completed" && !(d.is_recurring_renewal && d.kind !== "membership")).reduce((n, d) => n + Number(d.amount), 0);

  const patch = async (id, values) => { const { error } = await supabase.from("donations").update(values).eq("id", id); if (error) toast.error(error.message); else refresh(); };
  const remove = async (d) => {
    if (!window.confirm(`Delete the ${money(d.amount)} donation from ${d.donor_name || "this donor"}? This does not refund the card.`)) return;
    const { error } = await supabase.from("donations").delete().eq("id", d.id);
    if (error) toast.error(error.message); else refresh();
  };
  const act = async (d, fn) => { setBusyId(d.id); try { await fn(); refresh(); } catch (e) { toast.error(e.message); } setBusyId(null); };
  const receipt = (d) => act(d, async () => {
    let override;
    if (!d.email) { override = window.prompt("No email on file. Send the receipt to:"); if (!override) return; await supabase.from("donations").update({ email: override }).eq("id", d.id); }
    const r = await api("send_receipt", { donation_id: d.id, override_email: override });
    toast.success(`Receipt sent to ${r.sentTo}`);
  });
  const setupLink = (d) => act(d, async () => {
    const r = await api("create_setup_link", { donation_id: d.id, send_email: !!d.email && window.confirm(`Email the setup link to ${d.email}?`), app_url: window.location.origin });
    await navigator.clipboard?.writeText(r.url).catch(() => {});
    toast.success(r.emailSent ? "Link emailed and copied" : "Link copied"); window.prompt("Setup link:", r.url);
  });
  const cancelMembership = (d) => act(d, async () => {
    if (!window.confirm("Stop this automatic billing? The donor will not be charged again.")) return;
    await api("cancel_membership", { donation_id: d.id }); toast.success("Automatic billing cancelled");
  });

  const exportCsv = () => downloadCsv(`donations_${new Date().toISOString().slice(0, 10)}.csv`, rows.map((d) => ({
    Date: new Date(d.created_at).toLocaleString("en-US"), "Donor Name": d.donor_name, "Display Name": d.display_name, "Name on Card": d.cardholder_name,
    Email: d.email, Phone: d.phone, Address: d.address, Amount: d.amount, Source: d.donation_source, Status: d.status, Type: d.kind,
    Payments: d.recurring_count || "", Every: d.recurring_interval || "", Renewal: d.is_recurring_renewal ? "Yes" : "No", Anonymous: d.is_anonymous ? "Yes" : "No",
    "Dedication Type": d.dedication_type, "Dedication Message": d.dedication_message, Campaign: cName(d.campaign_id), "Receipt #": d.receipt_number, Notes: d.notes,
  })));

  // Import the "Donation" export from Base44. Safe to run again: rows are matched by their old id.
  const importCsv = async (file) => {
    setImporting(true);
    try {
      const list = parseCsv(await file.text());
      if (!list.length || !("amount" in list[0])) throw new Error("This doesn't look like the Donation export (no 'amount' column).");
      const main = campaigns.find((c) => c.legacy_names?.includes("Main")) || campaigns.find((c) => c.counts_all_campaigns) || campaigns[0];
      const byLegacy = (name) => campaigns.find((c) => (c.legacy_names || []).some((n) => n.toLowerCase() === String(name || "").trim().toLowerCase())) || main;
      const allow = (v, opts, d) => (opts.includes(v) ? v : d);
      const mapped = list.filter((r) => parseFloat(r.amount) > 0 && r.id).map((r) => {
        const months = parseInt(r.recurring_months) || null, renewal = truthy(r.is_recurring_renewal), rec = truthy(r.is_recurring);
        return {
          org_id: org.id, legacy_id: r.id, campaign_id: byLegacy(r.campaign).id,
          kind: renewal || (rec && months > 1) ? "pledge" : "one_time",
          donor_name: r.donor_name, display_name: r.display_name, email: r.email, phone: r.phone, address: r.address, cardholder_name: r.cardholder_name,
          amount: parseFloat(r.amount), donation_type: allow(r.donation_type, ["cash", "credit_card"], "cash"),
          donation_source: allow(r.donation_source, ["cash", "credit_card", "ojc_donors_fund"], r.donation_type === "credit_card" ? "credit_card" : "cash"),
          is_anonymous: truthy(r.is_anonymous), dedication_type: allow(r.dedication_type, ["none", "custom", "in_honor", "in_memory"], "none"), dedication_message: r.dedication_message,
          parnas_type: allow(r.parnas_type, ["none", "parnes_hayom", "parnes_hashavua", "amudei_hakolel"], "none"), parnas_message: r.parnas_message, parnas_sponsor: r.parnas_sponsor,
          is_recurring: rec, recurring_interval: rec && months ? "month" : null, recurring_count: rec ? months : null, is_recurring_renewal: renewal,
          status: allow(r.status, ["pending", "completed", "cancelled"], "pending"), show_on_projector: r.show_on_projector === "" ? true : truthy(r.show_on_projector),
          receipt_sent: truthy(r.receipt_sent), receipt_sent_at: r.receipt_sent_at || null, receipt_number: r.receipt_number || null, sms_sent: truthy(r.sms_sent),
          created_at: r.created_date || new Date().toISOString(),
        };
      });
      for (let i = 0; i < mapped.length; i += 200) {
        const { error } = await supabase.from("donations").upsert(mapped.slice(i, i + 200), { onConflict: "org_id,legacy_id" });
        if (error) throw error;
      }
      // Re-link renewal charges to their original pledge
      const { data: ids } = await supabase.from("donations").select("id, legacy_id").eq("org_id", org.id).not("legacy_id", "is", null);
      const map = Object.fromEntries((ids || []).map((x) => [x.legacy_id, x.id]));
      for (const r of list.filter((x) => x.original_donation_id && map[x.id] && map[x.original_donation_id])) {
        await supabase.from("donations").update({ original_donation_id: map[r.original_donation_id] }).eq("id", map[r.id]);
      }
      toast.success(`Imported ${mapped.length} donations`); refresh();
    } catch (e) { toast.error("Import failed: " + e.message); }
    setImporting(false); fileRef.current.value = "";
  };

  if (isLoading) return <Loader2 className="w-6 h-6 animate-spin mx-auto mt-10 text-brand" />;
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <select className={selectCls} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
          <option value="">All campaigns</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="completed">Completed</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option><option value="all">All</option>
        </select>
        <Input placeholder="Search name, email, phone" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs bg-white" />
        <span className="text-sm text-brand ml-auto">{rows.length} shown · {money(total)}</span>
        <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1" />Export</Button>
        <Button variant="outline" size="sm" disabled={importing} onClick={() => fileRef.current.click()}><Upload className="w-4 h-4 mr-1" />{importing ? "Importing..." : "Import from Base44"}</Button>
        <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => e.target.files[0] && importCsv(e.target.files[0])} />
      </div>
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-brand/60 border-b"><tr>{["Date", "Donor", "Amount", "Campaign", "Paid by", "Status", ""].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0, 500).map((d) => (
              <tr key={d.id} className={`border-b last:border-0 ${d.show_on_projector ? "" : "bg-gray-50 text-gray-500"}`}>
                <td className="p-3 whitespace-nowrap">{new Date(d.created_at).toLocaleDateString("en-US")}</td>
                <td className="p-3">
                  <p className="font-medium text-brand">{d.donor_name || "—"}{d.is_anonymous ? " (anonymous)" : ""}</p>
                  <p className="text-xs text-gray-500">{[d.email, d.phone, d.cardholder_name && `card: ${d.cardholder_name}`].filter(Boolean).join(" · ")}</p>
                  {d.notes && <p className="text-xs text-amber-700">{d.notes}</p>}
                </td>
                <td className="p-3 whitespace-nowrap">
                  {money(d.amount, 2)}
                  <p className="text-xs text-gray-500">{d.is_recurring_renewal ? "renewal charge" : d.kind === "pledge" ? `${d.recurring_count} × every ${d.recurring_interval}` : d.kind === "membership" ? `membership / ${d.recurring_interval || "one time"}${d.membership_status === "cancelled" ? " (cancelled)" : ""}` : ""}</p>
                </td>
                <td className="p-3">{cName(d.campaign_id)}</td>
                <td className="p-3">{{ cash: "Cash", credit_card: "Card", ojc_donors_fund: "Donors Fund" }[d.donation_source]}</td>
                <td className="p-3">{d.status}</td>
                <td className="p-3">
                  <div className="flex gap-1 justify-end">
                    {busyId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <>
                      {d.status === "completed" && <Button size="icon" variant="ghost" title={d.receipt_sent ? "Resend receipt" : "Send receipt"} onClick={() => receipt(d)}>{d.receipt_sent ? <MailCheck className="w-4 h-4 text-green-600" /> : <Mail className="w-4 h-4" />}</Button>}
                      {d.kind === "pledge" && !d.is_recurring_renewal && d.recurring_interval === "month" && !d.stripe_subscription_id && d.status === "completed" && <Button size="icon" variant="ghost" title="Link for donor to save a card for the remaining months" onClick={() => setupLink(d)}><Link2 className="w-4 h-4" /></Button>}
                      {d.stripe_subscription_id && d.kind === "membership" && d.membership_status !== "cancelled" && !d.is_recurring_renewal && <Button size="icon" variant="ghost" title="Cancel automatic billing" onClick={() => cancelMembership(d)}><XCircle className="w-4 h-4" /></Button>}
                      <Button size="icon" variant="ghost" title={d.show_on_projector ? "Hide from screen and totals" : "Show on screen"} onClick={() => patch(d.id, { show_on_projector: !d.show_on_projector })}>{d.show_on_projector ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</Button>
                      <Button size="icon" variant="ghost" title="Delete" onClick={() => remove(d)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                    </>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-8 text-center text-gray-400">No donations match.</p>}
        {rows.length > 500 && <p className="p-3 text-center text-xs text-gray-400">Showing the first 500. Use Export for the full list.</p>}
      </div>
    </div>
  );
}
