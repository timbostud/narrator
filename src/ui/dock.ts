// The bottom dock (tab bar + mini player), with iOS 26's "minimize on scroll" behaviour:
// scrolling down shrinks the tab bar to a single capsule and the mini player slides in beside it;
// scrolling up (or tapping the capsule) restores it. One spring drives everything, so the parts
// move as one material, and the liquid layer joins them while they pass close to each other.
import { createStore } from '../lib/store';
import { Spring, SPRINGS } from './physics';

export const dockSpring = new Spring(0, SPRINGS.smooth);
export const dockState = createStore({ compact: false });

export const TABBAR_H = 64;
export const TABBAR_FULL = 360;
export const TABBAR_COMPACT = 64;
export const DOCK_GAP = 14;

export function setCompact(compact: boolean) {
  if (dockState.get().compact === compact) return;
  dockState.set({ compact });
  dockSpring.to(compact ? 1 : 0, { config: compact ? SPRINGS.smooth : SPRINGS.bouncy });
}

/** Horizontal geometry of the app column the dock lives in. */
export function column() {
  const vw = document.documentElement.clientWidth;
  const colW = Math.min(vw, 560);
  const left = (vw - colW) / 2 + 16;
  return { left, width: colW - 32 };
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

dockSpring.onChange((p) => document.documentElement.style.setProperty('--dock', p.toFixed(4)));

/**
 * Follows a scroll container: minimize after scrolling down a bit, restore when scrolling up or
 * near the top. Hysteresis keeps it from flickering.
 */
export function followScroll(el: HTMLElement): () => void {
  let last = el.scrollTop;
  let acc = 0;
  const onScroll = () => {
    const y = el.scrollTop;
    const dy = y - last;
    last = y;
    if (y < 40) { acc = 0; setCompact(false); return; }
    acc = Math.sign(dy) === Math.sign(acc) ? acc + dy : dy;
    if (acc > 36) setCompact(true);
    else if (acc < -28) setCompact(false);
  };
  el.addEventListener('scroll', onScroll, { passive: true });
  return () => el.removeEventListener('scroll', onScroll);
}
