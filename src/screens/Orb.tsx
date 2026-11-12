import { useEffect, useRef } from 'react';
import { narrator } from '../tts/player';
import type { VoiceDef } from '../tts/voices';

/**
 * Voice avatar: a neutral monogram in the style of iOS Contacts. When `live`, it breathes
 * gently with the narration's audio level.
 */
export function Orb({ voice, live = false, size, className = '' }: { voice: VoiceDef; live?: boolean; size?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!live || !el) return;
    let raf = 0;
    let smooth = 0;
    const loop = () => {
      smooth += (narrator.level() - smooth) * 0.2;
      el.style.transform = `scale(${(1 + smooth * 0.06).toFixed(4)})`;
      el.style.setProperty('--level', smooth.toFixed(3));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      el.style.transform = '';
      el.style.setProperty('--level', '0');
    };
  }, [live]);
  return (
    <div ref={ref} className={`orb ${live ? 'live' : ''} ${className}`} aria-hidden style={size ? { width: size, height: size } : undefined}>
      <span>{voice.name[0]}</span>
    </div>
  );
}
