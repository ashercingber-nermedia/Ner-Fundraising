import { useEffect, useRef } from "react";

/**
 * Slowly auto-scrolls its children vertically and loops back to the top when reaching the bottom.
 * Pauses when the user hovers over the list.
 */
export default function AutoScrollList({ children, className = "", pixelsPerSecond = 25, pauseMs = 2000 }) {
  const containerRef = useRef(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let rafId;
    let lastTs = 0;
    let pauseUntil = 0;
    let offset = 0; // accumulates fractional scroll

    const step = (ts) => {
      if (!lastTs) lastTs = ts;
      const dt = ts - lastTs;
      lastTs = ts;

      if (!pausedRef.current && ts >= pauseUntil) {
        const maxScroll = el.scrollHeight - el.clientHeight;
        if (maxScroll > 0) {
          if (el.scrollTop >= maxScroll - 1) {
            pauseUntil = ts + pauseMs;
            setTimeout(() => {
              if (el) {
                el.scrollTop = 0;
                offset = 0;
              }
            }, pauseMs);
          } else {
            offset += (pixelsPerSecond * dt) / 1000;
            if (offset >= 1) {
              const whole = Math.floor(offset);
              el.scrollTop += whole;
              offset -= whole;
            }
          }
        }
      }
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [pixelsPerSecond, pauseMs]);

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => (pausedRef.current = true)}
      onMouseLeave={() => (pausedRef.current = false)}
      className={`${className} min-h-0`}
    >
      {children}
    </div>
  );
}