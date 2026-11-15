import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_KEY;

export const supabase = createClient(URL, KEY);

// Calls the server. Everything involving money goes through here, never straight to the database.
export async function api(action, payload = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const res = await fetch(`${URL}/functions/v1/api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Something went wrong. Please try again.");
  return body;
}

export async function uploadAsset(orgId, file) {
  const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
  const path = `${orgId}/${Date.now()}_${safe}`;
  const { error } = await supabase.storage.from("org-assets").upload(path, file, { cacheControl: "31536000" });
  if (error) throw error;
  return supabase.storage.from("org-assets").getPublicUrl(path).data.publicUrl;
}

export const money = (n, digits = 0) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(n) || 0);

export const everyLabel = (i) => (i === "year" ? "year" : i === "quarter" ? "quarter" : "month");
