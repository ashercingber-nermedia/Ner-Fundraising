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

export const PLATFORM_DOMAIN = (import.meta.env.VITE_PLATFORM_DOMAIN || "nermediagroup.com").toLowerCase();
export const PLATFORM_HOME = `https://give.${PLATFORM_DOMAIN}`;
export const NER_MEDIA_SITE = import.meta.env.VITE_NER_MEDIA_SITE || `https://${PLATFORM_DOMAIN}`;
export const orgUrl = (org) => `https://${org.slug}.${PLATFORM_DOMAIN}`;

// The platform's own addresses (signup page, owner page, testing copies)
export function isPlatformHost(host = window.location.hostname) {
  host = host.toLowerCase();
  return host === `give.${PLATFORM_DOMAIN}` || host.endsWith(".workers.dev") || host === "localhost" || host === "127.0.0.1";
}

const bySlug = async (slug) => {
  const { data } = await supabase.from("organizations").select("*").eq("slug", String(slug).toLowerCase()).maybeSingle();
  return data;
};

// Which organization is this site for?
//   kahal-ner-shlomo.nermediagroup.com -> that organization
//   an organization's own domain (e.g. kolleltiferesmoshe.org) -> that organization
//   the platform address (give.nermediagroup.com) -> the signup page, or ?org=slug to look at one organization
async function resolveOrg() {
  const host = window.location.hostname.toLowerCase();
  const fromUrl = new URLSearchParams(window.location.search).get("org");
  if (isPlatformHost(host)) {
    if (fromUrl) sessionStorage.setItem("org_slug", fromUrl);
    const slug = fromUrl || sessionStorage.getItem("org_slug");
    return slug ? await bySlug(slug) : null;
  }
  if (host.endsWith(`.${PLATFORM_DOMAIN}`)) {
    return await bySlug(host.slice(0, -(PLATFORM_DOMAIN.length + 1)));
  }
  const { data: byHost } = await supabase.from("organizations").select("*").contains("domains", [host]).limit(1);
  return byHost?.[0] || null;
}

export function OrgProvider({ children }) {
  const [org, setOrg] = useState(undefined); // undefined = loading, null = not found
  const [session, setSession] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

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
    root.setProperty("--brand-rgb", hexToRgb(t.brand, "15 23 42"));
    root.setProperty("--gold-rgb", hexToRgb(t.accent, "197 160 89"));
    root.setProperty("--canvas-rgb", hexToRgb(t.canvas, "248 245 240"));
    document.title = org.name;
  }, [org]);

  useEffect(() => {
    if (session === undefined || org === undefined) return;
    if (!session) { setIsAdmin(false); setIsPlatformAdmin(false); setAuthChecked(true); return; }
    let cancelled = false;
    (async () => {
      await supabase.rpc("claim_invites"); // pick up any admin invite sent to this email (also switches a new site on)
      const uid = session.user.id;
      const [{ data: m }, { data: p }] = await Promise.all([
        org ? supabase.from("org_members").select("user_id").eq("org_id", org.id).eq("user_id", uid).maybeSingle() : { data: null },
        supabase.from("platform_admins").select("user_id").eq("user_id", uid).maybeSingle(),
      ]);
      if (cancelled) return;
      if (org?.status === "pending" && m) { const fresh = await resolveOrg(); if (!cancelled && fresh) setOrg(fresh); }
      setIsAdmin(!!org && !!(m || p)); setIsPlatformAdmin(!!p); setAuthChecked(true);
    })();
    return () => { cancelled = true; };
  }, [session, org]);

  return (
    <OrgContext.Provider value={{ org, reloadOrg, session, isAdmin, isPlatformAdmin, authChecked, signOut: () => supabase.auth.signOut() }}>
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
