import { useEffect, useRef } from 'react';
import { narrator } from '../tts/player';
import type { VoiceDef } from '../tts/voices';

/** A glossy voice orb. When `live`, it breathes with the narration's audio level. */
export function Orb({ voice, live = false, size, className = '' }: { voice: VoiceDef; live?: boolean; size?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!live) return;
    let raf = 0;
    let smooth = 0;
    let t0 = performance.now();
    const loop = (t: number) => {
      const lvl = narrator.level();
      smooth += (lvl - smooth) * 0.25;
      const el = ref.current;
      if (el) {
        const s = 1 + smooth * 0.14;
        const wob = Math.sin((t - t0) / 180) * smooth * 0.05;
        el.style.transform = `scale(${(s + wob).toFixed(4)}, ${(s - wob).toFixed(4)})`;
        el.style.setProperty('--glow', smooth.toFixed(3));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); t0 = 0; };
  }, [live]);
  const [a, b] = voice.hue;
  return (
    <div ref={ref} className={`orb ${className}`} aria-hidden
      style={{
        width: size, height: size,
        background: `radial-gradient(circle at 30% 25%, ${a}, transparent 60%), radial-gradient(circle at 75% 80%, ${b}, transparent 65%), linear-gradient(135deg, ${a}, ${b})`,
        boxShadow: `inset 0 -10px 24px rgba(0,0,0,.25), inset 0 8px 18px rgba(255,255,255,.5), 0 14px calc(30px + var(--glow, 0) * 60px) color-mix(in srgb, ${b} calc(35% + var(--glow, 0) * 50%), transparent)`,
      }} />
  );
}
