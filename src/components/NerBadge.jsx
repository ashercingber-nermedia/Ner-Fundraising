import { NER_MEDIA_SITE } from "@/lib/org";

// Ner Media mark (logo option D): a screen outline with an orange flame and "Ner" inside, on a small stand.
const FLAME = "#F2A93B";
export function NerLogo({ size = 16, dark = false }) {
  const ink = dark ? "#FFFFFF" : "#0E1B2C";
  const s = size / 16;
  return (
    <span aria-hidden="true" style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2 * s }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 * s, border: `${1.5 * s}px solid ${ink}`, borderRadius: 4 * s, padding: `${2 * s}px ${6 * s}px` }}>
        <svg width={7 * s} height={9 * s} viewBox="0 0 24 32"><path d="M12 1C12 1 3 11 3 20a9 9 0 0 0 18 0C21 11 12 1 12 1Z" fill={FLAME} /></svg>
        <span style={{ fontFamily: "Rubik, system-ui, sans-serif", fontWeight: 700, fontSize: 11 * s, lineHeight: 1, color: ink }}>Ner</span>
      </span>
      <span style={{ width: 14 * s, height: 2 * s, borderRadius: 2, background: ink }} />
    </span>
  );
}

// Full logo (screen + "Ner Media" + tagline), as drawn in the Ner Media Logo design.
export function NerLogoFull({ height = 40 }) {
  return <img src="/brand/ner-media-logo.png" alt="Ner Media" style={{ height, width: "auto" }} />;
}

// "Set up by Ner Media" link shown on every organization's public pages (bottom-left).
export default function NerBadge({ fixed = false, dark = false, className = "", style }) {
  return (
    <a
      href={NER_MEDIA_SITE}
      target="_blank"
      rel="noopener"
      title="Free fundraising websites by Ner Media"
      className={`ner-badge ${dark ? "dark" : ""} ${className}`}
      style={fixed ? { position: "fixed", left: 12, bottom: 12, zIndex: 40, ...style } : style}
    >
      <NerLogo size={15} dark={dark} />
      <span>Set up by <strong>Ner Media</strong></span>
    </a>
  );
}
