// Spring physics + gesture helpers. Everything that moves in the app is driven by these,
// so motion is interruptible and keeps its momentum, like UIKit's spring animations.

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

export const SPRINGS = {
  /** Snappy, almost no overshoot — selection, toggles */
  snappy: { stiffness: 520, damping: 40, mass: 1 },
  /** Gentle overshoot — returning dragged items, the squeeze wobble */
  bouncy: { stiffness: 380, damping: 18, mass: 1 },
  /** Soft and slow — sheets and large surfaces */
  smooth: { stiffness: 230, damping: 28, mass: 1 },
  /** Jelly — the liquid lens stretching */
  jelly: { stiffness: 300, damping: 14, mass: 0.9 },
} satisfies Record<string, SpringConfig>;

const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Tickable = { step(dt: number): boolean };
const active = new Set<Tickable>();
let last = 0;
let raf = 0;

function frame(t: number) {
  const dt = Math.min(0.064, last ? (t - last) / 1000 : 1 / 60);
  last = t;
  for (const s of [...active]) if (!s.step(dt)) active.delete(s);
  raf = active.size ? requestAnimationFrame(frame) : 0;
  if (!raf) last = 0;
}

function schedule(s: Tickable) {
  active.add(s);
  if (!raf) raf = requestAnimationFrame(frame);
}

export class Spring {
  value: number;
  velocity = 0;
  target: number;
  private cfg: SpringConfig;
  private listeners = new Set<(v: number, vel: number) => void>();
  private onRest?: () => void;

  constructor(value: number, cfg: SpringConfig = SPRINGS.snappy) {
    this.value = value;
    this.target = value;
    this.cfg = cfg;
  }

  onChange(fn: (v: number, vel: number) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit() {
    this.listeners.forEach((f) => f(this.value, this.velocity));
  }

  /** Jump without animation (used while a finger is dragging). */
  set(v: number, velocity = 0) {
    active.delete(this);
    this.value = v;
    this.target = v;
    this.velocity = velocity;
    this.emit();
  }

  to(target: number, opts: { velocity?: number; config?: SpringConfig; onRest?: () => void } = {}) {
    this.target = target;
    if (opts.velocity !== undefined) this.velocity = opts.velocity;
    if (opts.config) this.cfg = opts.config;
    this.onRest = opts.onRest;
    if (reduceMotion()) {
      this.set(target);
      this.onRest?.();
      return;
    }
    schedule(this);
  }

  step(dt: number): boolean {
    const { stiffness: k, damping: c, mass: m } = this.cfg;
    // Semi-implicit Euler with fixed sub-steps for stability at any frame rate.
    const sub = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      const f = -k * (this.value - this.target) - c * this.velocity;
      this.velocity += (f / m) * h;
      this.value += this.velocity * h;
    }
    const settled = Math.abs(this.velocity) < 0.02 && Math.abs(this.value - this.target) < 0.005;
    if (settled) {
      this.value = this.target;
      this.velocity = 0;
    }
    this.emit();
    if (settled) this.onRest?.();
    return !settled;
  }
}

/**
 * Apple's rubber-band function: past the limit, displacement grows ever more slowly.
 * `d` is the overshoot in px, `dim` the dimension of the scroll view.
 */
export function rubberBand(d: number, dim: number, c = 0.55): number {
  const s = Math.sign(d);
  const a = Math.abs(d);
  return s * (1 - 1 / ((a * c) / dim + 1)) * dim;
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Volume-preserving squash & stretch: stretched along the pull axis, squeezed across it.
 * `amount` is ~0..0.35.
 */
export function squeeze(amount: number, axis: 'x' | 'y'): string {
  const a = clamp(amount, -0.45, 0.45);
  const along = 1 + a;
  const across = 1 / Math.sqrt(along);
  return axis === 'x' ? `scale(${along.toFixed(4)}, ${across.toFixed(4)})` : `scale(${across.toFixed(4)}, ${along.toFixed(4)})`;
}

export interface DragState {
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  event: PointerEvent;
  /** The element the press started on (move events can target anything, even the window). */
  target: Element | null;
}

export interface DragOptions {
  /** Lock to an axis after a few px of movement; if the gesture goes the other way it's released (e.g. to scrolling). */
  axis?: 'x' | 'y' | 'both';
  threshold?: number;
  onStart?: (s: DragState) => void | false;
  onMove?: (s: DragState) => void;
  onEnd?: (s: DragState) => void;
  onTap?: (e: PointerEvent, target: Element | null) => void;
}

/** Pointer-based drag recognizer with velocity tracking and axis locking. */
export function drag(el: HTMLElement, opts: DragOptions): () => void {
  const threshold = opts.threshold ?? 6;
  let id: number | null = null;
  let x0 = 0, y0 = 0;
  let started = false;
  let rejected = false;
  let samples: { t: number; x: number; y: number }[] = [];
  let origin: Element | null = null;

  const velocity = () => {
    const now = performance.now();
    const recent = samples.filter((s) => now - s.t < 90);
    if (recent.length < 2) return { vx: 0, vy: 0 };
    const a = recent[0];
    const b = recent[recent.length - 1];
    const dt = Math.max(1, b.t - a.t) / 1000;
    return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
  };

  const down = (e: PointerEvent) => {
    if (id !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    id = e.pointerId;
    origin = e.target instanceof Element ? e.target : null;
    x0 = e.clientX;
    y0 = e.clientY;
    started = false;
    rejected = false;
    samples = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  const move = (e: PointerEvent) => {
    if (e.pointerId !== id || rejected) return;
    samples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    if (samples.length > 12) samples.shift();
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (!started) {
      if (Math.hypot(dx, dy) < threshold) return;
      const horizontal = Math.abs(dx) > Math.abs(dy);
      if ((opts.axis === 'x' && !horizontal) || (opts.axis === 'y' && horizontal)) {
        rejected = true;
        return;
      }
      if (opts.onStart?.({ dx, dy, vx: 0, vy: 0, event: e, target: origin }) === false) {
        rejected = true;
        return;
      }
      started = true;
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    e.preventDefault();
    opts.onMove?.({ dx, dy, ...velocity(), event: e, target: origin });
  };

  const finish = (e: PointerEvent, tap: boolean) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    if (started) opts.onEnd?.({ dx: e.clientX - x0, dy: e.clientY - y0, ...velocity(), event: e, target: origin });
    else if (tap && !rejected) opts.onTap?.(e, origin);
    id = null;
    started = false;
  };
  const up = (e: PointerEvent) => e.pointerId === id && finish(e, true);
  const cancel = (e: PointerEvent) => e.pointerId === id && finish(e, false);

  el.addEventListener('pointerdown', down);
  return () => {
    el.removeEventListener('pointerdown', down);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
  };
}

export function haptic(ms = 8) {
  try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
}
