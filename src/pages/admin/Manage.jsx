import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Copy, Plus, Trash2, Trophy, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrg, useCampaigns } from "@/lib/org";
import { api, money, supabase, uploadAsset } from "@/lib/supabase";
import { selectCls, useDonations } from "@/pages/admin/Admin";

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "campaign";
const Check = ({ label, checked, onChange }) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
const Field = ({ label, children, className = "" }) => <div className={className}><Label className="text-brand/80">{label}</Label>{children}</div>;

// ───────────── Campaigns ─────────────
const NEW = { name: "", slug: "", type: "regular", goal_amount: 0, is_active: true, is_default: false, counts_all_campaigns: false, headline: "", description: "", tag_labels: [], images: [], quick_amounts: [50, 100, 180, 250, 360, 500, 1000], suggested_tiers: [], allow_recurring: true, spin_segments: [{ amount: 18, weight: 4 }, { amount: 36, weight: 4 }, { amount: 54, weight: 3 }, { amount: 72, weight: 3 }, { amount: 100, weight: 2 }, { amount: 180, weight: 2 }, { amount: 250, weight: 1 }, { amount: 360, weight: 1 }], raffle_prize: "", membership_period: "year", membership_tiers: [] };

export function Campaigns() {
  const { org } = useOrg();
  const { campaigns } = useCampaigns();
  const qc = useQueryClient();
  const [c, setC] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));
  const list = (k, i, key, v) => set(k, c[k].map((row, j) => (j === i ? { ...row, [key]: v } : row)));
  const reload = () => qc.invalidateQueries({ queryKey: ["campaigns"] });

  const save = async () => {
    if (!c.name.trim()) return toast.error("Give the campaign a name.");
    setSaving(true);
    try {
      const { id, membership_tiers, created_at, org_id, raffle_winner, legacy_names, legacy_pages, ...rest } = c;
      const row = {
        ...rest, slug: slugify(c.slug || c.name), goal_amount: Number(c.goal_amount) || 0,
        quick_amounts: c.quick_amounts.map(Number).filter((n) => n > 0),
        suggested_tiers: c.suggested_tiers.filter((t) => Number(t.amount) > 0).map((t) => ({ amount: Number(t.amount), label: t.label || "", monthly: !!t.monthly })),
        spin_segments: c.spin_segments.filter((s) => Number(s.amount) > 0).map((s) => ({ amount: Number(s.amount), weight: Math.max(1, Number(s.weight) || 1) })),
      };
      row.ticket_count = c.type === "spin_raffle" ? parseInt(c.ticket_count) || null : null;
      if (c.type === "spin_raffle" && !(row.ticket_count >= 2 && row.ticket_count <= 5000)) throw new Error("Enter how many tickets the raffle has (2 to 5000).");
      if (row.is_default) await supabase.from("campaigns").update({ is_default: false }).eq("org_id", org.id).neq("id", id || "00000000-0000-0000-0000-000000000000");
      const res = id ? await supabase.from("campaigns").update(row).eq("id", id).select().single()
        : await supabase.from("campaigns").insert({ ...row, org_id: org.id }).select().single();
      if (res.error) throw new Error(res.error.code === "23505" ? "Another campaign already uses that web address." : res.error.message);
      if (c.type === "membership") {
        const keep = membership_tiers.filter((t) => t.id).map((t) => t.id);
        const { data: old } = await supabase.from("membership_tiers").select("id").eq("campaign_id", res.data.id);
        const gone = (old || []).map((t) => t.id).filter((x) => !keep.includes(x));
        if (gone.length) await supabase.from("membership_tiers").delete().in("id", gone);
        for (const [i, t] of membership_tiers.entries()) {
          const tr = { campaign_id: res.data.id, name: t.name, description: t.description || null, monthly_amount: Number(t.monthly_amount) || null, yearly_amount: Number(t.yearly_amount) || null, sort_order: i, is_active: true };
          if (!tr.name || (!tr.monthly_amount && !tr.yearly_amount)) continue;
          const r = t.id ? await supabase.from("membership_tiers").update(tr).eq("id", t.id) : await supabase.from("membership_tiers").insert(tr);
          if (r.error) throw r.error;
        }
      }
      toast.success("Campaign saved"); setC(null); reload();
    } catch (e) { toast.error(e.message); }
    setSaving(false);
  };
  const remove = async () => {
    if (!window.confirm(`Delete "${c.name}"? Its donations stay in the Donations list but lose their campaign.`)) return;
    const { error } = await supabase.from("campaigns").delete().eq("id", c.id);
    if (error) toast.error(error.message); else { setC(null); reload(); }
  };
  const draw = async () => {
    if (!window.confirm("Draw the raffle winner now? This shows the winner on the campaign screen.")) return;
    try { const r = await api("draw_winner", { campaign_id: c.id }); window.alert(`Winner: ${r.contact.name}\nPhone: ${r.contact.phone || "—"}\nEmail: ${r.contact.email || "—"}\n(${r.winner.entries} entries)`); setC(null); reload(); }
    catch (e) { toast.error(e.message); }
  };
  const addImage = async (file) => { try { set("images", [...c.images, await uploadAsset(org.id, file)]); } catch (e) { toast.error(e.message); } };

  if (!c) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-brand">Campaigns</h2>
          <Button className="bg-brand hover:bg-brand/90" onClick={() => setC({ ...NEW })}><Plus className="w-4 h-4 mr-1" />New campaign</Button>
        </div>
        {campaigns.map((x) => (
          <button key={x.id} onClick={() => setC({ ...x, headline: x.headline || "", description: x.description || "", raffle_prize: x.raffle_prize || "" })} className="w-full text-left bg-white rounded-xl shadow p-4 flex justify-between items-center hover:ring-2 ring-gold">
            <div><p className="font-semibold text-brand">{x.name}</p><p className="text-xs text-gray-500">/c/{x.slug} · {{ regular: "Regular", spin_raffle: "Spin raffle", membership: "Membership" }[x.type]}{x.is_default ? " · home page" : ""}{x.is_active ? "" : " · closed"}</p></div>
            <span className="text-brand">{Number(x.goal_amount) > 0 ? `Goal ${money(x.goal_amount)}` : ""}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-brand">{c.id ? `Edit: ${c.name}` : "New campaign"}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Name"><Input value={c.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Web address: /c/..."><Input value={c.slug} placeholder={slugify(c.name)} onChange={(e) => set("slug", e.target.value)} /></Field>
          <Field label="Type">
            <select className={selectCls + " w-full"} value={c.type} disabled={!!c.id} onChange={(e) => set("type", e.target.value)}>
              <option value="regular">Regular campaign</option><option value="spin_raffle">Spin raffle</option><option value="membership">Membership</option>
            </select>
          </Field>
          <Field label="Goal ($, 0 = no goal)"><Input type="number" min="0" value={c.goal_amount} onChange={(e) => set("goal_amount", e.target.value)} /></Field>
          <Field label="Headline" className="md:col-span-2"><Input value={c.headline} onChange={(e) => set("headline", e.target.value)} /></Field>
          <Field label="Description" className="md:col-span-3"><textarea className="w-full rounded-md border border-input p-2 text-sm" rows={2} value={c.description} onChange={(e) => set("description", e.target.value)} /></Field>
          <Field label="Banner boxes (comma separated)" className="md:col-span-3"><Input value={c.tag_labels.join(", ")} onChange={(e) => set("tag_labels", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} /></Field>
        </div>
        <div className="flex gap-5 flex-wrap">
          <Check label="Open for donations" checked={c.is_active} onChange={(v) => set("is_active", v)} />
          <Check label="Show on the home page" checked={c.is_default} onChange={(v) => set("is_default", v)} />
          <Check label="Total includes every campaign" checked={c.counts_all_campaigns} onChange={(v) => set("counts_all_campaigns", v)} />
        </div>

        <div>
          <Label className="text-brand/80">Photos (up to 3)</Label>
          <div className="flex gap-2 items-center flex-wrap mt-1">
            {c.images.map((src) => (
              <div key={src} className="relative"><img src={src} alt="" className="h-16 w-24 object-cover rounded" />
                <button type="button" onClick={() => set("images", c.images.filter((i) => i !== src))} className="absolute -top-2 -right-2 bg-white rounded-full shadow"><XCircle className="w-5 h-5 text-red-500" /></button></div>
            ))}
            {c.images.length < 3 && <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && addImage(e.target.files[0])} className="text-sm" />}
          </div>
        </div>

        {c.type === "regular" && (
          <div className="space-y-3 border-t pt-4">
            <Field label="Amount buttons (comma separated)"><Input value={c.quick_amounts.join(", ")} onChange={(e) => set("quick_amounts", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} /></Field>
            <Check label="Allow monthly / quarterly / yearly pledges" checked={c.allow_recurring} onChange={(v) => set("allow_recurring", v)} />
            <Label className="text-brand/80 block">Featured boxes on the campaign screen (optional)</Label>
            {c.suggested_tiers.map((t, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input type="number" className="w-28" placeholder="Amount" value={t.amount} onChange={(e) => list("suggested_tiers", i, "amount", e.target.value)} />
                <Input placeholder='Label, e.g. "1% of our goal"' value={t.label} onChange={(e) => list("suggested_tiers", i, "label", e.target.value)} />
                <Check label="monthly" checked={t.monthly} onChange={(v) => list("suggested_tiers", i, "monthly", v)} />
                <Button size="icon" variant="ghost" onClick={() => set("suggested_tiers", c.suggested_tiers.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => set("suggested_tiers", [...c.suggested_tiers, { amount: "", label: "", monthly: false }])}><Plus className="w-4 h-4 mr-1" />Add box</Button>
          </div>
        )}

        {c.type === "spin_raffle" && (
          <div className="space-y-3 border-t pt-4">
            <Field label="Prize"><Input value={c.raffle_prize} onChange={(e) => set("raffle_prize", e.target.value)} placeholder="e.g. $1,000 cash" /></Field>
            <Field label="Number of tickets (tickets are numbered 1 to this number, and each number is its price in dollars)">
              <Input type="number" min="2" max="5000" className="w-40" value={c.ticket_count ?? ""} onChange={(e) => set("ticket_count", e.target.value)} />
            </Field>
            {Number(c.ticket_count) >= 2 && (
              <p className="text-sm text-brand/70">
                If every ticket sells, this raises {money((Number(c.ticket_count) * (Number(c.ticket_count) + 1)) / 2)}. Cards are held for up to {money(c.ticket_count)}.
                Donors may split a ticket into monthly payments of at least ${Math.max(25, Math.ceil(Number(c.ticket_count) / 12))}, finished within 12 months.
              </p>
            )}
            {c.id && (c.raffle_winner
              ? <p className="text-brand font-medium"><Trophy className="w-4 h-4 inline text-gold" /> Winner: {c.raffle_winner.display_name}</p>
              : <Button variant="outline" onClick={draw}><Trophy className="w-4 h-4 mr-1" />Draw the winner</Button>)}
          </div>
        )}

        {c.type === "membership" && (
          <div className="space-y-3 border-t pt-4">
            <Field label="A cash payment counts as paid for">
              <select className={selectCls} value={c.membership_period} onChange={(e) => set("membership_period", e.target.value)}><option value="year">One year</option><option value="month">One month</option></select>
            </Field>
            <Label className="text-brand/80 block">Membership levels (fill monthly, yearly, or both)</Label>
            {c.membership_tiers.map((t, i) => (
              <div key={t.id || i} className="grid grid-cols-12 gap-2 items-center">
                <Input className="col-span-3" placeholder="Level name" value={t.name || ""} onChange={(e) => list("membership_tiers", i, "name", e.target.value)} />
                <Input className="col-span-2" type="number" placeholder="$ / month" value={t.monthly_amount || ""} onChange={(e) => list("membership_tiers", i, "monthly_amount", e.target.value)} />
                <Input className="col-span-2" type="number" placeholder="$ / year" value={t.yearly_amount || ""} onChange={(e) => list("membership_tiers", i, "yearly_amount", e.target.value)} />
                <Input className="col-span-4" placeholder="What's included (optional)" value={t.description || ""} onChange={(e) => list("membership_tiers", i, "description", e.target.value)} />
                <Button size="icon" variant="ghost" onClick={() => set("membership_tiers", c.membership_tiers.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => set("membership_tiers", [...c.membership_tiers, { name: "", monthly_amount: "", yearly_amount: "", description: "" }])}><Plus className="w-4 h-4 mr-1" />Add level</Button>
          </div>
        )}

        <div className="flex gap-2 border-t pt-4">
          <Button className="bg-brand hover:bg-brand/90" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save"}</Button>
          <Button variant="outline" onClick={() => setC(null)}>Cancel</Button>
          {c.id && <Button variant="ghost" className="ml-auto text-red-600" onClick={remove}>Delete campaign</Button>}
        </div>
      </CardContent>
    </Card>
  );
}

// ───────────── Members: the roster, and who has paid ─────────────
const paidUntil = (d, period) => {
  const t = new Date(d.created_at), i = d.recurring_interval || period;
  t.setMonth(t.getMonth() + (i === "month" ? 1 : i === "quarter" ? 3 : 12));
  return t;
};

export function Members() {
  const { org } = useOrg();
  const { campaigns } = useCampaigns();
  const memberCampaigns = campaigns.filter((c) => c.type === "membership");
  const [campaignId, setCampaignId] = useState("");
  const campaign = memberCampaigns.find((c) => c.id === campaignId) || memberCampaigns[0];
  const { data: donations = [] } = useDonations();
  const qc = useQueryClient();
  const { data: members = [] } = useQuery({
    queryKey: ["members", campaign?.id], enabled: !!campaign,
    queryFn: async () => { const { data, error } = await supabase.from("members").select("*").eq("campaign_id", campaign.id).order("name"); if (error) throw error; return data; },
  });
  const [bulk, setBulk] = useState("");
  const [filter, setFilter] = useState("all");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["members"] }); qc.invalidateQueries({ queryKey: ["donations"] }); qc.invalidateQueries({ queryKey: ["feed"] }); };

  const rows = useMemo(() => members.map((m) => {
    const pays = donations.filter((d) => d.member_id === m.id && d.status === "completed");
    const until = pays.reduce((best, d) => { const u = paidUntil(d, campaign.membership_period); return !best || u > best ? u : best; }, null);
    const auto = pays.some((d) => d.stripe_subscription_id && d.membership_status === "active");
    return { ...m, paid: !!until && until > new Date(), until, auto, last: pays[0], total: pays.reduce((n, d) => n + Number(d.amount), 0) };
  }), [members, donations, campaign]);
  const paidCount = rows.filter((r) => r.paid).length;
  const shown = rows.filter((r) => filter === "all" || (filter === "paid") === r.paid);

  if (!campaign) return <p className="text-brand/70">Create a campaign of type “Membership” first (Campaigns tab), then add your members here.</p>;

  const addBulk = async () => {
    const existing = new Set(members.map((m) => m.name.trim().toLowerCase()));
    const add = bulk.split("\n").map((line) => { const [name, phone, email] = line.split(",").map((s) => s.trim()); return { org_id: org.id, campaign_id: campaign.id, name, phone: phone || null, email: email || null }; })
      .filter((m) => m.name && !existing.has(m.name.toLowerCase()));
    if (!add.length) return toast.error("No new names to add.");
    const { error } = await supabase.from("members").insert(add);
    if (error) return toast.error(error.message);
    toast.success(`Added ${add.length} member${add.length === 1 ? "" : "s"}`); setBulk(""); refresh();
  };
  const cash = async (m) => {
    const amount = parseFloat(window.prompt(`Cash/check amount received from ${m.name}:`) || "");
    if (!(amount > 0)) return;
    const { error } = await supabase.from("donations").insert({ org_id: org.id, campaign_id: campaign.id, member_id: m.id, kind: "membership", donor_name: m.name, display_name: m.name, email: m.email, phone: m.phone, amount, donation_type: "cash", donation_source: "cash", status: "completed" });
    if (error) toast.error(error.message); else { toast.success(`${m.name} marked paid`); refresh(); }
  };
  const remove = async (m) => { if (window.confirm(`Remove ${m.name} from the list? Their past payments stay in Donations.`)) { await supabase.from("members").delete().eq("id", m.id); refresh(); } };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center flex-wrap">
        {memberCampaigns.length > 1 && <select className={selectCls} value={campaign.id} onChange={(e) => setCampaignId(e.target.value)}>{memberCampaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        <h2 className="text-xl font-semibold text-brand">{paidCount} of {rows.length} members paid</h2>
        <div className="ml-auto flex gap-1">{[["all", "All"], ["paid", "Paid"], ["unpaid", "Not paid"]].map(([v, l]) => <Button key={v} size="sm" variant={filter === v ? "default" : "outline"} className={filter === v ? "bg-brand" : ""} onClick={() => setFilter(v)}>{l}</Button>)}</div>
      </div>
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-brand/60 border-b"><tr>{["Member", "Status", "Paid through", "Total paid", ""].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="p-3"><p className="font-medium text-brand">{m.name}{m.self_added && <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">added themselves</span>}</p><p className="text-xs text-gray-500">{[m.phone, m.email].filter(Boolean).join(" · ")}</p></td>
                <td className="p-3">{m.paid ? <span className="inline-flex items-center gap-1 text-green-700 font-medium"><CheckCircle2 className="w-4 h-4" />Paid{m.auto ? " (auto-renews)" : ""}</span> : <span className="inline-flex items-center gap-1 text-red-600 font-medium"><XCircle className="w-4 h-4" />{m.until ? "Lapsed" : "Not paid"}</span>}</td>
                <td className="p-3">{m.until ? m.until.toLocaleDateString("en-US") : "—"}</td>
                <td className="p-3">{m.total ? money(m.total) : "—"}</td>
                <td className="p-3 text-right whitespace-nowrap"><Button size="sm" variant="outline" onClick={() => cash(m)}>Record cash</Button><Button size="icon" variant="ghost" onClick={() => remove(m)}><Trash2 className="w-4 h-4 text-red-500" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="p-8 text-center text-gray-400">No members here yet.</p>}
      </div>
      <Card><CardContent className="p-4 space-y-2">
        <Label className="text-brand">Add members: one per line. Optional: Name, phone, email</Label>
        <textarea className="w-full rounded-md border border-input p-2 text-sm" rows={5} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"Moshe Cohen\nYaakov Levi, 732-555-0100, ylevi@example.com"} />
        <Button className="bg-brand hover:bg-brand/90" onClick={addBulk}>Add to list</Button>
        <p className="text-xs text-brand/50">Card payments match a member by email, phone or exact name. On the kiosk tablet members pick their name from this list. Someone not on the list is added automatically and flagged.</p>
      </CardContent></Card>
    </div>
  );
}

// ───────────── Settings ─────────────
export function Settings() {
  const { org, reloadOrg, session } = useOrg();
  const qc = useQueryClient();
  const [o, setO] = useState({ name: org.name, legal_name: org.legal_name || "", address: org.address || "", tax_id: org.tax_id || "", receipt_prefix: org.receipt_prefix, about_text: org.about_text || "", logo_url: org.logo_url || "", theme: org.theme || {} });
  const { data: pay, refetch: refetchPay } = useQuery({ queryKey: ["payment_status", org.id], queryFn: () => api("payment_status", { org_id: org.id }) });
  const [keys, setKeys] = useState({});
  const [kioskUrl, setKioskUrl] = useState("");
  const [invite, setInvite] = useState("");
  const { data: team } = useQuery({
    queryKey: ["team", org.id],
    queryFn: async () => {
      const [m, i] = await Promise.all([supabase.from("org_members").select("user_id, email").eq("org_id", org.id), supabase.from("org_invites").select("id, email").eq("org_id", org.id)]);
      return { members: m.data || [], invites: i.data || [] };
    },
  });
  useEffect(() => { if (pay) setKeys({ stripe_reader_id: pay.reader_id, donors_fund_account_number: pay.donors_fund.account, connext_group: pay.connext.group }); }, [pay]);

  const saveOrg = async () => { const { error } = await supabase.from("organizations").update(o).eq("id", org.id); if (error) toast.error(error.message); else { toast.success("Saved"); reloadOrg(); } };
  const saveKeys = async (extra = {}) => { try { await api("save_secrets", { org_id: org.id, values: { ...keys, ...extra } }); toast.success("Saved"); setKeys({}); refetchPay(); reloadOrg(); } catch (e) { toast.error(e.message); } };
  const connect = async () => { try { const r = await api("connect_start", { org_id: org.id, return_url: window.location.href }); window.location.href = r.url; } catch (e) { toast.error(e.message); } };
  const kiosk = async (reset) => { if (reset && !window.confirm("Make a new kiosk link? The old link stops working on every tablet.")) return; try { const r = await api("kiosk_link", { org_id: org.id, reset }); setKioskUrl(`${window.location.origin}/kiosk?key=${r.kiosk_key}`); } catch (e) { toast.error(e.message); } };
  const addInvite = async () => { const email = invite.trim().toLowerCase(); if (!email) return; const { error } = await supabase.from("org_invites").insert({ org_id: org.id, email }); if (error) toast.error(error.message); else { setInvite(""); qc.invalidateQueries({ queryKey: ["team"] }); toast.success("Invited. They sign in at /login with that email."); } };
  const key = (k, label, saved, type = "password") => <Field label={`${label}${saved ? " (saved ✓ — leave blank to keep)" : ""}`}><Input type={type} autoComplete="off" value={keys[k] ?? ""} onChange={(e) => setKeys({ ...keys, [k]: e.target.value })} /></Field>;
  const Ok = ({ ok, children }) => <p className={`text-sm flex items-center gap-1 ${ok ? "text-green-700" : "text-amber-700"}`}>{ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}{children}</p>;

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Card><CardHeader><CardTitle className="text-brand text-lg">Organization</CardTitle></CardHeader><CardContent className="space-y-3">
        <Field label="Name shown on the site"><Input value={o.name} onChange={(e) => setO({ ...o, name: e.target.value })} /></Field>
        <Field label="Legal name (receipts)"><Input value={o.legal_name} onChange={(e) => setO({ ...o, legal_name: e.target.value })} /></Field>
        <Field label="Address"><Input value={o.address} onChange={(e) => setO({ ...o, address: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tax ID"><Input value={o.tax_id} onChange={(e) => setO({ ...o, tax_id: e.target.value })} /></Field>
          <Field label="Receipt number prefix"><Input value={o.receipt_prefix} onChange={(e) => setO({ ...o, receipt_prefix: e.target.value.toUpperCase().slice(0, 6) })} /></Field>
        </div>
        <Field label="About (shown on campaign screens)"><textarea className="w-full rounded-md border border-input p-2 text-sm" rows={3} value={o.about_text} onChange={(e) => setO({ ...o, about_text: e.target.value })} /></Field>
        <Field label="Logo"><div className="flex items-center gap-3">{o.logo_url && <img src={o.logo_url} alt="" className="h-12 bg-brand rounded p-1" />}<input type="file" accept="image/*" className="text-sm" onChange={async (e) => { if (e.target.files[0]) try { setO({ ...o, logo_url: await uploadAsset(org.id, e.target.files[0]) }); } catch (err) { toast.error(err.message); } }} /></div></Field>
        <div className="flex gap-4">{[["brand", "Main color"], ["accent", "Accent"], ["canvas", "Background"]].map(([k, l]) => <label key={k} className="text-sm flex items-center gap-2"><input type="color" value={o.theme[k] || "#000000"} onChange={(e) => setO({ ...o, theme: { ...o.theme, [k]: e.target.value } })} />{l}</label>)}</div>
        <Button className="bg-brand hover:bg-brand/90" onClick={saveOrg}>Save</Button>
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-brand text-lg">Card payments (Stripe)</CardTitle></CardHeader><CardContent className="space-y-3">
        {pay && <>
          <Ok ok={org.stripe_own_keys ? pay.own_keys.secret : pay.connect.charges_enabled}>{org.stripe_own_keys ? (pay.own_keys.secret ? "Using this organization's own Stripe keys" : "Stripe keys missing") : pay.connect.charges_enabled ? "Stripe account connected and ready" : pay.connect.account_id ? "Stripe setup started but not finished" : "No Stripe account connected yet"}</Ok>
          <Ok ok={pay.email_ready}>{pay.email_ready ? "Receipt emails are on" : "Receipt emails are not set up yet (platform setting)"}</Ok>
          {!org.stripe_own_keys && <Button variant="outline" onClick={connect} disabled={!pay.platform_ready}>{pay.connect.account_id ? "Continue Stripe setup" : "Set up a Stripe account"}</Button>}
          {!pay.platform_ready && !org.stripe_own_keys && <p className="text-xs text-amber-700">The platform Stripe account has not been added yet, so new accounts can't be created here.</p>}
          <details className="border rounded-md p-3" open={org.stripe_own_keys}>
            <summary className="text-sm font-medium text-brand cursor-pointer">Use an existing Stripe account's keys instead</summary>
            <div className="space-y-3 mt-3">
              {key("stripe_secret_key", "Secret key (sk_live_...)", pay.own_keys.secret)}
              <Field label="Publishable key (pk_live_...)"><Input value={keys.stripe_publishable_key ?? org.stripe_publishable_key ?? ""} onChange={(e) => setKeys({ ...keys, stripe_publishable_key: e.target.value })} /></Field>
              {key("stripe_webhook_secret", "Webhook signing secret (whsec_...)", pay.own_keys.webhook)}
              <p className="text-xs text-gray-500 break-all">In Stripe, add a webhook to: <strong>{pay.webhook_url}</strong><br />Events: checkout.session.completed, payment_intent.succeeded, invoice.payment_succeeded, customer.subscription.deleted</p>
            </div>
          </details>
          {key("stripe_reader_id", "Card reader ID (tmr_...)", false, "text")}
          <Button className="bg-brand hover:bg-brand/90" onClick={() => saveKeys()}>Save payment settings</Button>
        </>}
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-brand text-lg">Donors Fund and text alerts</CardTitle></CardHeader><CardContent className="space-y-3">
        {pay && <>
          {key("donors_fund_api_key", "Donors Fund API key", pay.donors_fund.api_key)}
          {key("donors_fund_validation_token", "Donors Fund validation token", pay.donors_fund.token)}
          {key("donors_fund_account_number", "Donors Fund account number", false, "text")}
          {key("connext_api_key", "Connext API key (text alert when a card donation comes in)", pay.connext.api_key)}
          {key("connext_group", "Connext group number", false, "text")}
          <Button className="bg-brand hover:bg-brand/90" onClick={() => saveKeys()}>Save</Button>
        </>}
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-brand text-lg">Admins and kiosk tablet</CardTitle></CardHeader><CardContent className="space-y-3">
        {(team?.members || []).map((m) => (
          <div key={m.user_id} className="flex justify-between items-center text-sm"><span>{m.email || "Admin"}</span>
            {m.user_id !== session.user.id && <Button size="sm" variant="ghost" className="text-red-600" onClick={async () => { await supabase.from("org_members").delete().eq("org_id", org.id).eq("user_id", m.user_id); qc.invalidateQueries({ queryKey: ["team"] }); }}>Remove</Button>}</div>
        ))}
        {(team?.invites || []).map((i) => (
          <div key={i.id} className="flex justify-between items-center text-sm text-gray-500"><span>{i.email} (invited, hasn't signed in yet)</span>
            <Button size="sm" variant="ghost" onClick={async () => { await supabase.from("org_invites").delete().eq("id", i.id); qc.invalidateQueries({ queryKey: ["team"] }); }}>Cancel</Button></div>
        ))}
        <div className="flex gap-2"><Input type="email" placeholder="Email of a new admin" value={invite} onChange={(e) => setInvite(e.target.value)} /><Button variant="outline" onClick={addInvite}>Invite</Button></div>
        <div className="border-t pt-3 space-y-2">
          <p className="text-sm text-brand">Kiosk tablet link: opens the card-reader screen without an admin login. Anyone with the link can take payments on your reader, so keep it on the tablet only.</p>
          <div className="flex gap-2"><Button variant="outline" onClick={() => kiosk(false)}>Show kiosk link</Button><Button variant="ghost" onClick={() => kiosk(true)}>Make a new link</Button></div>
          {kioskUrl && <div className="flex gap-2"><Input readOnly value={kioskUrl} /><Button size="icon" variant="outline" onClick={() => { navigator.clipboard?.writeText(kioskUrl); toast.success("Copied"); }}><Copy className="w-4 h-4" /></Button></div>}
        </div>
      </CardContent></Card>
    </div>
  );
}
