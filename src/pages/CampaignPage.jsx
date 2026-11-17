import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { Heart, Trophy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import NerBadge from "@/components/NerBadge";
import { Button } from "@/components/ui/button";
import AutoScrollList from "@/components/AutoScrollList";
import { useOrg, useCampaigns, useFeed, Spinner } from "@/lib/org";
import { money } from "@/lib/supabase";

const parnasLabel = { amudei_hakolel: "Amudei Hakolel", parnes_hayom: "Parnes Hayom", parnes_hashavua: "Parnes Hashavua" };

// The public campaign page. On a big screen this is the projector display; on a phone it is the landing page.
export default function CampaignPage() {
  const { slug } = useParams();
  const { org } = useOrg();
  const { bySlug, defaultCampaign, isLoading } = useCampaigns();
  const campaign = slug ? bySlug(slug) : defaultCampaign;
  const { data: feed } = useFeed(campaign?.id, 5000);
  const seen = useRef(null);

  // Celebrate on the projector whenever a new donation or membership payment lands.
  useEffect(() => {
    if (!feed) return;
    const ids = new Set(feed.donations.map((d) => d.id));
    if (seen.current && feed.donations.some((d) => !seen.current.has(d.id))) {
      confetti({ particleCount: 160, spread: 90, origin: { y: 0.5 } });
    }
    seen.current = ids;
  }, [feed]);

  if (isLoading) return <Spinner />;
  if (!campaign || !campaign.is_active) {
    return <div className="min-h-screen bg-canvas flex items-center justify-center text-brand/60">This campaign is not available.</div>;
  }

  const donations = feed?.donations || [];
  const raised = Number(feed?.raised || 0);
  const goal = Number(campaign.goal_amount || 0);
  const percent = goal > 0 ? Math.min((raised / goal) * 100, 100) : 0;
  const donateUrl = `/c/${campaign.slug}/donate`;
  const isMembership = campaign.type === "membership";
  const isSpin = campaign.type === "spin_raffle";
  const action = isMembership ? "Become a Member" : isSpin ? "Spin to Give" : "Make a Donation";
  const stat = "text-2xl md:text-4xl font-light";
  const statLabel = "text-brand/60 text-xs md:text-sm uppercase tracking-widest mb-1";

  return (
    <div className="min-h-screen bg-canvas flex flex-col md:flex-row relative overflow-hidden">
      {["top-4 left-4 border-l-2 border-t-2", "top-4 right-4 border-r-2 border-t-2", "bottom-4 left-4 border-l-2 border-b-2", "bottom-4 right-4 border-r-2 border-b-2"].map((c) => (
        <div key={c} className={`absolute w-24 h-24 border-gold hidden md:block ${c}`} />
      ))}

      <div className="flex-1 flex flex-col p-6 md:p-10 relative z-10">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-6 mb-6">
          {org.logo_url && (
            <div className="bg-brand rounded-lg p-4 shadow-xl flex-shrink-0">
              <img src={org.logo_url} alt={org.name} className="h-20 md:h-24 object-contain" />
            </div>
          )}
          <div className="text-center md:text-left flex-1">
            {!campaign.counts_all_campaigns && <p className="text-gold text-sm md:text-base font-semibold uppercase tracking-widest mb-1">{campaign.name}</p>}
            {campaign.headline && <p className="text-brand text-base md:text-lg leading-relaxed font-semibold">{campaign.headline}</p>}
            {!campaign.headline && org.about_text && <p className="text-brand text-sm md:text-base leading-relaxed">{org.about_text}</p>}
            {campaign.description && <p className="text-brand text-sm md:text-base leading-relaxed mt-3 font-medium">{campaign.description}</p>}
            {campaign.tag_labels?.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                {campaign.tag_labels.map((label) => (
                  <div key={label} className="border-2 border-gold bg-white/50 rounded-md py-2 px-2 text-center">
                    <p className="text-brand text-xs md:text-sm font-bold tracking-wider">{label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {isSpin && campaign.raffle_winner && (
          <div className="mb-6 rounded-xl border-2 border-gold bg-white p-5 text-center shadow">
            <Trophy className="w-8 h-8 text-gold mx-auto mb-1" />
            <p className="text-brand/60 uppercase tracking-widest text-xs">Raffle winner</p>
            <p className="text-3xl font-bold text-brand">{campaign.raffle_winner.display_name}</p>
          </div>
        )}
        {isSpin && !campaign.raffle_winner && campaign.raffle_prize && (
          <div className="mb-6 rounded-xl border-2 border-gold bg-white/60 p-4 text-center">
            <p className="text-brand/60 uppercase tracking-widest text-xs">Spin and win</p>
            <p className="text-2xl font-bold text-brand">{campaign.raffle_prize}</p>
          </div>
        )}

        {/* Quick links: suggested amounts or membership levels */}
        {campaign.type === "regular" && campaign.suggested_tiers?.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {campaign.suggested_tiers.map((t) => (
              <Link key={t.amount} to={`${donateUrl}?amount=${t.amount}${t.monthly ? "&monthly=1" : ""}`} className="bg-white border-2 border-gold hover:bg-gold rounded-lg p-3 md:p-4 text-center transition-all shadow-md group">
                <p className="text-2xl md:text-3xl font-bold text-brand group-hover:text-white">${t.amount}{t.monthly && <span className="text-sm md:text-base font-normal">/month</span>}</p>
                {t.label && <p className="text-xs md:text-sm text-gold group-hover:text-white font-semibold mt-1">{t.label}</p>}
              </Link>
            ))}
          </div>
        )}
        {isMembership && campaign.membership_tiers?.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {campaign.membership_tiers.filter((t) => t.is_active).map((t) => (
              <Link key={t.id} to={donateUrl} className="bg-white border-2 border-gold hover:bg-gold rounded-lg p-3 md:p-4 text-center transition-all shadow-md group">
                <p className="text-lg font-bold text-brand group-hover:text-white">{t.name}</p>
                <p className="text-sm text-gold group-hover:text-white font-semibold">
                  {t.monthly_amount ? `${money(t.monthly_amount)}/month` : `${money(t.yearly_amount)}/year`}
                </p>
              </Link>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 md:gap-6 mb-6">
          <div className="text-center">
            <p className={statLabel}>Goal</p>
            <p className={`${stat} text-gold`}>{goal > 0 ? money(goal) : "—"}</p>
          </div>
          <div className="text-center border-x border-gold/30">
            <p className={statLabel}>Raised</p>
            <motion.p key={raised} initial={{ scale: 1.08 }} animate={{ scale: 1 }} className={`${stat} text-brand`}>{money(raised)}</motion.p>
          </div>
          <div className="text-center">
            <p className={statLabel}>{isMembership ? "Members paid" : isSpin ? "Tickets sold" : "Donors"}</p>
            <p className={`${stat} text-brand`}>
              {isMembership && feed?.members_total > 0 ? `${feed.members_paid} of ${feed.members_total}` : isSpin ? `${feed?.tickets_sold?.length || 0} of ${feed?.tickets_total || 0}` : feed?.donors || 0}
            </p>
          </div>
        </div>

        {goal > 0 && (
          <div className="mb-6">
            <div className="flex justify-between mb-2">
              <span className="text-brand/60 text-sm uppercase tracking-wider">Progress</span>
              <span className="text-lg font-medium text-gold">{percent.toFixed(1)}%</span>
            </div>
            <div className="h-4 bg-brand/10 rounded-full overflow-hidden border border-gold/30">
              <motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 1.5, ease: "easeOut" }} className="h-full bg-gradient-to-r from-gold to-gold/70 rounded-full" />
            </div>
          </div>
        )}

        {isSpin && feed?.tickets_total > 0 && (
          <div className="hidden md:block mb-6">
            <p className="text-brand/60 text-xs uppercase tracking-widest mb-2">Ticket board</p>
            <div className="flex flex-wrap gap-[3px]">
              {Array.from({ length: feed.tickets_total }, (_, i) => i + 1).map((n) => {
                const sold = feed.tickets_sold.includes(n);
                return <span key={n} className={`w-[26px] h-[20px] rounded-[3px] text-[9px] leading-[20px] text-center font-semibold ${sold ? "bg-gold text-brand" : "bg-brand/10 text-brand/40"}`}>{n}</span>;
              })}
            </div>
          </div>
        )}

        {campaign.images?.length > 0 && !isSpin && (
          <div className="hidden md:grid grid-cols-3 gap-4 mb-6">
            {campaign.images.slice(0, 3).map((src) => (
              <div key={src} className="rounded-lg overflow-hidden shadow-lg border-2 border-gold/20">
                <img src={src} alt="" className="w-full h-36 object-cover" />
              </div>
            ))}
          </div>
        )}

        <div className="mt-auto pt-4 flex items-center justify-between">
          <div className="flex flex-col items-center">
            <p className="text-brand text-xs mb-2">Scan to give</p>
            <div className="bg-white p-2 rounded-lg">
              <QRCodeSVG value={window.location.origin + donateUrl} size={80} bgColor="#ffffff" fgColor="#1a2d5a" />
            </div>
            <NerBadge className="mt-3" />
          </div>
          <div className="text-center">
            <p className="text-brand font-semibold tracking-wide">{org.name}</p>
            {org.address && <p className="text-brand/60 text-sm">{org.address}</p>}
            {org.tax_id && <p className="text-brand/60 text-sm">Tax ID: {org.tax_id}</p>}
          </div>
          <div className="w-[96px]" />
        </div>
      </div>

      <div className="w-full md:w-80 bg-brand p-5 flex flex-col max-h-[50vh] md:max-h-none md:h-screen relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gold" />
        <Link to={donateUrl} className="mb-4">
          <Button className="w-full h-12 text-base font-medium bg-gold hover:bg-gold/90 text-brand rounded-lg shadow-lg">
            <Heart className="w-5 h-5 mr-2" />{action}
          </Button>
        </Link>
        <h2 className="text-lg font-light text-center text-gold uppercase tracking-widest mb-4">
          {isMembership ? "Members" : isSpin ? "Recent Spins" : "Recent Donations"}
        </h2>
        <AutoScrollList className="flex-1 overflow-y-auto space-y-3">
          <AnimatePresence mode="popLayout">
            {donations.map((d) => (
              <motion.div key={d.id} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="bg-white/10 border border-gold/30 rounded-lg p-3 text-center">
                <p className="text-white/90 font-medium text-sm truncate">{d.display_name}</p>
                {parnasLabel[d.parnas_type] && <p className="text-gold text-xs font-semibold uppercase">{parnasLabel[d.parnas_type]}</p>}
                <p className="text-xl font-light text-gold">{isMembership && d.tier_name ? d.tier_name : isSpin && d.ticket_number ? `Ticket #${d.ticket_number}` : money(d.amount)}</p>
                {d.parnas_sponsor && <p className="text-gold/90 text-xs">Sponsored by: {d.parnas_sponsor}</p>}
                {d.dedication_type !== "none" && d.dedication_message && (
                  <p className="text-white/50 text-xs italic truncate mt-1">
                    {d.dedication_type === "in_honor" && "In Honor Of: "}{d.dedication_type === "in_memory" && "In Memory Of: "}{d.dedication_message}
                  </p>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {donations.length === 0 && <p className="text-center text-white/40 py-8 text-sm">{isMembership ? "Waiting for the first member..." : "Waiting for donations..."}</p>}
        </AutoScrollList>
        {donations.length > 8 && (
          <Link to={`/c/${campaign.slug}/all`} className="mt-4">
            <Button className="w-full bg-gold hover:bg-gold/90 text-brand font-medium">See All</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
