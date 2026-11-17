import { NER_MEDIA_SITE } from "@/lib/org";

// Ner Media mark: a TV screen with a flame, "Ner" inside the screen.
export function NerLogo({ size = 28, dark = false }) {
  const ink = dark ? "#ffffff" : "#1a2d5a";
  return (
    <svg width={size * 1.25} height={size} viewBox="0 0 50 40" aria-hidden="true">
      <rect x="2" y="2" width="46" height="29" rx="5" fill="none" stroke={ink} strokeWidth="3" />
      <path d="M18 36h14" stroke={ink} strokeWidth="3" strokeLinecap="round" />
      <path d="M13 23c-3-3-2-7 1-10 0 3 2 3 2 3 0-3 1-6 4-8-1 4 3 6 3 10 0 3-2 5-5 5s-4-1-5 0z" fill="#e8a317" />
      <text x="34" y="22" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="700" fontSize="12" fill={ink}>Ner</text>
    </svg>
  );
}

// "Set up by Ner Media" link shown on every organization's public pages.
export default function NerBadge({ fixed = false, dark = false, className = "" }) {
  return (
    <a
      href={NER_MEDIA_SITE}
      target="_blank"
      rel="noopener"
      title="Free fundraising websites by Ner Media"
      className={`${fixed ? "fixed bottom-3 left-3 z-40 shadow-md" : ""} inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium no-underline transition-opacity hover:opacity-100 opacity-90 ${
        dark ? "bg-white/10 text-white border border-white/20" : "bg-white/90 text-[#1a2d5a] border border-[#1a2d5a]/15"
      } ${className}`}
    >
      <NerLogo size={16} dark={dark} />
      <span>Set up by <strong>Ner Media</strong></span>
    </a>
  );
}
