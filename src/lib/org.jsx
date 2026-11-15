import React, { createContext, useContext, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const OrgContext = createContext(null);
export const useOrg = () => useContext(OrgContext);

function hexToRgb(hex, fallback) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

// Which organization is this site for? 1) ?org=slug  2) the web address  3) the default in .env
async function resolveOrg() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("org");
  if (fromUrl) sessionStorage.setItem("org_slug", fromUrl);
  const slug = fromUrl || sessionStorage.getItem("org_slug");
  if (slug) {
    const { data } = await supabase.from("organizations").select("*").eq("slug", slug).maybeSingle();
    if (data) return data;
  }
  const { data: byHost } = await supabase.from("organizations").select("*").contains("domains", [window.location.hostname]).limit(1);
  if (byHost?.length) return byHost[0];
  const fallback = import.meta.env.VITE_DEFAULT_ORG;
  if (fallback) {
    const { data } = await supabase.from("organizations").select("*").eq("slug", fallback).maybeSingle();
    if (data) return data;
  }
  return null;
}

export function OrgProvider({ children }) {
  const [org, setOrg] = useState(undefined); // undefined = loading, null = not found
  const [session, setSession] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const reloadOrg = () => resolveOrg().then(setOrg).catch(() => setOrg(null));
  useEffect(() => { reloadOrg(); }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!org) return;
    const t = org.theme || {};
    const root = document.documentElement.style;
    root.setProperty("--brand-rgb", hexToRgb(t.brand, "26 45 90"));
    root.setProperty("--gold-rgb", hexToRgb(t.accent, "201 162 39"));
    root.setProperty("--canvas-rgb", hexToRgb(t.canvas, "237 232 225"));
    document.title = org.name;
  }, [org]);

  useEffect(() => {
    if (session === undefined || org === undefined) return;
    if (!session || !org) { setIsAdmin(false); setAuthChecked(true); return; }
    let cancelled = false;
    (async () => {
      await supabase.rpc("claim_invites"); // pick up any admin invite sent to this email
      const uid = session.user.id;
      const [{ data: m }, { data: p }] = await Promise.all([
        supabase.from("org_members").select("user_id").eq("org_id", org.id).eq("user_id", uid).maybeSingle(),
        supabase.from("platform_admins").select("user_id").eq("user_id", uid).maybeSingle(),
      ]);
      if (!cancelled) { setIsAdmin(!!(m || p)); setAuthChecked(true); }
    })();
    return () => { cancelled = true; };
  }, [session, org]);

  return (
    <OrgContext.Provider value={{ org, reloadOrg, session, isAdmin, authChecked, signOut: () => supabase.auth.signOut() }}>
      {children}
    </OrgContext.Provider>
  );
}

// Campaigns for this organization (the public sees active ones; admins see all).
export function useCampaigns() {
  const { org, isAdmin } = useOrg();
  const q = useQuery({
    queryKey: ["campaigns", org?.id, isAdmin],
    enabled: !!org,
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*, membership_tiers(*)").eq("org_id", org.id).order("created_at");
      if (error) throw error;
      return data.map((c) => ({ ...c, membership_tiers: (c.membership_tiers || []).sort((a, b) => a.sort_order - b.sort_order) }));
    },
  });
  const campaigns = q.data || [];
  return {
    ...q,
    campaigns,
    defaultCampaign: campaigns.find((c) => c.is_default && c.is_active) || campaigns.find((c) => c.is_active) || null,
    bySlug: (slug) => campaigns.find((c) => c.slug === String(slug || "").toLowerCase()) || null,
  };
}

// Live totals and public donor list for one campaign (never includes email, phone or address).
export function useFeed(campaignId, refetchMs = 8000) {
  return useQuery({
    queryKey: ["feed", campaignId],
    enabled: !!campaignId,
    refetchInterval: refetchMs,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("campaign_feed", { p_campaign: campaignId });
      if (error) throw error;
      return data || { raised: 0, donors: 0, members_total: 0, members_paid: 0, donations: [] };
    },
  });
}

export function Spinner() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-canvas">
      <div className="w-8 h-8 border-4 border-brand/20 border-t-brand rounded-full animate-spin" />
    </div>
  );
}
