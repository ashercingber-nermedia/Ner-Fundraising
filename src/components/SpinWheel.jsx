import { useEffect, useMemo, useRef, useState } from "react";

const SLICES = 24;
const SPIN_MS = 6200;

// A raffle wheel for numbered tickets. The server picks the ticket (`result`); this only animates to it.
// The wheel shows a sample of ticket numbers; the winning number is placed on the slice it stops at.
export default function SpinWheel({ tickets = 360, result, onDone, size = 360 }) {
  const sample = useMemo(() => {
    const step = Math.max(tickets / SLICES, 1);
    const list = Array.from({ length: SLICES }, (_, i) => Math.min(tickets, Math.max(1, Math.round((i + 0.5) * step))));
    // spread highs and lows around the wheel instead of in order
    return list.map((_, i) => list[(i * 7) % SLICES]);
  }, [tickets]);
  const [labels, setLabels] = useState(sample);
  const [angle, setAngle] = useState(0);
  const [readout, setReadout] = useState(null);
  const [landed, setLanded] = useState(false);
  const started = useRef(false);
  const slice = 360 / SLICES;
  const r = size / 2;
  const rim = size * 0.055;
  const R = r - rim; // radius of the numbered face

  useEffect(() => {
    if (result == null || started.current) return;
    started.current = true;
    const stop = Math.floor(Math.random() * SLICES);
    setLabels((l) => l.map((v, i) => (i === stop ? result : v)));
    const offset = (Math.random() - 0.5) * slice * 0.6; // don't always stop dead center
    setAngle(360 * 7 + (360 - (stop + 0.5) * slice) + offset);
    const roll = setInterval(() => setReadout(1 + Math.floor(Math.random() * tickets)), 70);
    const done = setTimeout(() => { clearInterval(roll); setReadout(result); setLanded(true); }, SPIN_MS);
    const after = setTimeout(() => onDone?.(), SPIN_MS + 2200);
    return () => { clearInterval(roll); clearTimeout(done); clearTimeout(after); };
  }, [result]);

  const at = (deg, radius) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [r + radius * Math.cos(a), r + radius * Math.sin(a)];
  };

  return (
    <div className="mx-auto select-none" style={{ width: size }}>
      <style>{`
        @keyframes wheel-bulb { 0%, 49% { opacity: 1 } 50%, 100% { opacity: .25 } }
        @keyframes wheel-pop { 0% { transform: scale(.9) } 60% { transform: scale(1.08) } 100% { transform: scale(1) } }
      `}</style>
      <div className="relative" style={{ width: size, height: size, filter: "drop-shadow(0 18px 28px rgba(0,0,0,.35))" }}>
        {/* fixed gold rim with chasing lights */}
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
          <defs>
            <linearGradient id="rimGold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f6e29a" /><stop offset=".45" stopColor="#c9a227" /><stop offset="1" stopColor="#7a5c0e" />
            </linearGradient>
          </defs>
          <circle cx={r} cy={r} r={r - 1} fill="url(#rimGold)" />
          <circle cx={r} cy={r} r={R + 2} style={{ fill: "rgb(var(--brand-rgb))" }} />
          {Array.from({ length: SLICES }, (_, i) => {
            const [x, y] = at(i * slice, r - rim / 2);
            return <circle key={i} cx={x} cy={y} r={rim * 0.24} fill="#fff8dc" style={{ animation: `wheel-bulb 1s ${i % 2 ? "0s" : ".5s"} infinite` }} />;
          })}
        </svg>

        {/* spinning face */}
        <svg
          width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0"
          style={{ transform: `rotate(${angle}deg)`, transition: `transform ${SPIN_MS}ms cubic-bezier(0.1, 0.72, 0.08, 1)` }}
        >
          <defs>
            <radialGradient id="faceNavy" cx="50%" cy="50%" r="50%"><stop offset=".25" style={{ stopColor: "rgb(var(--brand-rgb) / .82)" }} /><stop offset="1" style={{ stopColor: "rgb(var(--brand-rgb))" }} /></radialGradient>
            <radialGradient id="faceCream" cx="50%" cy="50%" r="50%"><stop offset=".25" stopColor="#fffdf5" /><stop offset="1" stopColor="#eadfc0" /></radialGradient>
            <radialGradient id="hub" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#fff3c4" /><stop offset=".5" stopColor="#c9a227" /><stop offset="1" stopColor="#6e520b" /></radialGradient>
          </defs>
          {labels.map((n, i) => {
            const [x1, y1] = at(i * slice, R);
            const [x2, y2] = at((i + 1) * slice, R);
            const [tx, ty] = at((i + 0.5) * slice, R * 0.78);
            const dark = i % 2 === 0;
            return (
              <g key={i}>
                <path d={`M${r},${r} L${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2} Z`} fill={dark ? "url(#faceNavy)" : "url(#faceCream)"} stroke="#c9a227" strokeWidth="1.2" />
                <text x={tx} y={ty} style={{ fill: dark ? "#f6e29a" : "rgb(var(--brand-rgb))" }} fontSize={size / 21} fontWeight="800" fontFamily="Georgia, 'Times New Roman', serif"
                  textAnchor="middle" dominantBaseline="middle" transform={`rotate(${(i + 0.5) * slice + 90}, ${tx}, ${ty})`}>
                  {n}
                </text>
              </g>
            );
          })}
          <circle cx={r} cy={r} r={size * 0.13} fill="url(#hub)" stroke="#fff3c4" strokeWidth="2" />
          <circle cx={r} cy={r} r={size * 0.035} fill="#15244c" />
        </svg>

        {/* pointer */}
        <svg width={size * 0.11} height={size * 0.14} viewBox="0 0 44 56" className="absolute left-1/2 -translate-x-1/2" style={{ top: -size * 0.03 }}>
          <path d="M22 54 L4 14 A18 18 0 1 1 40 14 Z" fill="#c81e1e" stroke="#fff3c4" strokeWidth="3" />
          <circle cx="22" cy="17" r="6" fill="#fff3c4" />
        </svg>
      </div>

      {/* ticket readout */}
      <div className="mt-5 mx-auto rounded-xl bg-brand border-2 border-gold px-6 py-3 text-center shadow-lg" style={{ maxWidth: size * 0.8, animation: landed ? "wheel-pop .5s" : "none" }}>
        <p className="text-[11px] tracking-[0.3em] text-gold uppercase">{landed ? "Your ticket" : "Ticket"}</p>
        <p className="font-mono text-4xl font-bold text-[#fff3c4] tabular-nums leading-tight">
          {readout == null ? "– – –" : `#${readout}`}
        </p>
        {landed && <p className="text-[#fff3c4]/90 text-sm">= ${result} donation</p>}
      </div>
    </div>
  );
}

export function BigRedButton({ onClick, disabled, children = "SPIN" }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label="Spin" className="group mx-auto block relative w-40 h-40 disabled:opacity-60">
      {/* metal base */}
      <span className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(145deg,#f1f1f1,#8c8c8c 55%,#4a4a4a)", boxShadow: "0 14px 24px rgba(0,0,0,.4)" }} />
      <span className="absolute inset-[9px] rounded-full bg-[#2a2a2a]" />
      {/* red dome */}
      <span
        className="absolute inset-[15px] rounded-full flex items-center justify-center text-white text-3xl font-extrabold tracking-[0.12em] transition-transform duration-100 -translate-y-1.5 group-active:translate-y-0"
        style={{ background: "radial-gradient(circle at 35% 28%, #ff8a8a 0%, #e11d1d 38%, #8f0f0f 100%)", boxShadow: "0 7px 0 #5c0a0a, inset 0 -8px 14px rgba(0,0,0,.35)", textShadow: "0 2px 3px rgba(0,0,0,.45)" }}
      >
        {children}
        <span className="absolute left-[18%] top-[10%] w-[42%] h-[22%] rounded-full bg-white/30 blur-[3px]" />
      </span>
    </button>
  );
}
