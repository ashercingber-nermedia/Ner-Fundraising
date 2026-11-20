import { Link, NavLink } from "react-router-dom";
import { Flame } from "lucide-react";
import NerBadge from "@/components/NerBadge";
import { useCampaigns, useOrg } from "@/lib/org";

// Shared frame for an organization's public pages: header with logo and name, footer with the Ner Media badge.
export function OrgMark({ org }) {
  if (org.logo_url) return <span className="org-logo"><img src={org.logo_url} alt="" /></span>;
  return <span className="org-mark"><Flame size={22} /></span>;
}

export default function SiteLayout({ children, nav = true, className = "" }) {
  const { org } = useOrg();
  const { campaigns } = useCampaigns();
  const active = campaigns.filter((c) => c.is_active);
  const main = active.find((c) => c.is_default) || active[0];
  const city = shortAddress(org.address);
  return (
    <div className={`ner ${className}`}>
      <header className="org-bar">
        <div className="wrap org-inner">
          <Link to="/" className="org-brand">
            <OrgMark org={org} />
            <span><strong>{org.name}</strong>{city && <small>{city}</small>}</span>
          </Link>
          {nav && (
            <nav aria-label="Organization" className="org-nav">
              <NavLink to="/" end>Home</NavLink>
              {active.length > 1 && <a href="/#campaigns">Campaigns</a>}
              {main && <Link to={`/c/${main.slug}/donate`} className="ner-btn gold">{main.type === "membership" ? "Join" : main.type === "spin_raffle" ? "Spin to give" : "Donate"}</Link>}
            </nav>
          )}
        </div>
      </header>
      <main>{children}</main>
      <footer className="wrap ner-footer">
        <NerBadge />
        <div className="footer-org">
          <strong>{org.legal_name || org.name}</strong>
          {org.address && <small>{org.address}</small>}
          {org.tax_id && <small>Tax ID: {org.tax_id}</small>}
        </div>
      </footer>
    </div>
  );
}

// "123 Main St, Lakewood, NJ 08701" -> "Lakewood, NJ"
export function shortAddress(address) {
  if (!address) return "";
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return `${parts[parts.length - 2]}, ${parts[parts.length - 1].replace(/\s*\d{5}(-\d{4})?$/, "")}`;
  return parts.length === 2 ? parts[1].replace(/\s*\d{5}(-\d{4})?$/, "") : "";
}

export function Subhead({ label, title, children }) {
  return (
    <header className="subhead">
      {label && <div className="eyebrow">{label}</div>}
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </header>
  );
}

export function Progress({ raised, goal }) {
  const value = goal > 0 ? Math.min(Math.round((raised / goal) * 100), 100) : 0;
  return <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${value}%` }} /></div>;
}

export const typeTag = { regular: "Campaign", membership: "Membership", spin_raffle: "Spin raffle" };
const STOCK = ["/stock/sefer.jpg", "/stock/building.jpg", "/stock/sanctuary.jpg"];
export const stockImage = (c, i = 0) => c?.images?.[0] || (c?.type === "membership" ? STOCK[1] : c?.type === "spin_raffle" ? STOCK[2] : STOCK[i % STOCK.length]);
