import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState,
  type CSSProperties, type HTMLAttributes, type ReactNode,
} from 'react';
import { usePress, useRefraction } from './hooks';
import type { RefractOptions } from './glass';
import { clamp, drag, haptic, rubberBand, Spring, SPRINGS } from './physics';

/* ───────────────────────── Glass surface ───────────────────────── */

type GlassProps = HTMLAttributes<HTMLDivElement> & {
  refraction?: RefractOptions | false;
  press?: boolean | number;
  as?: 'div' | 'button';
  disabled?: boolean;
  type?: 'button';
};

export const Glass = forwardRef<HTMLDivElement, GlassProps>(function Glass(
  { refraction = false, press = false, className = '', as = 'div', children, ...rest }, fwd,
) {
  const ref = useRef<HTMLDivElement>(null);
  useImperativeHandle(fwd, () => ref.current!);
  useRefraction(ref, refraction);
  usePress(ref, { scale: typeof press === 'number' ? press : 1.08, disabled: !press });
  const El = as as 'div';
  return (
    <El ref={ref} className={`glass ${className}`} {...rest}>
      {children}
    </El>
  );
});

export function IconButton({ children, label, onClick, className = '', size, refraction = { depth: 30 }, style }: {
  children: ReactNode; label: string; onClick?: () => void; className?: string; size?: 'lg' | 'xl';
  refraction?: RefractOptions | false; style?: CSSProperties;
}) {
  return (
    <Glass as="button" type="button" aria-label={label} title={label} press className={`icon-btn ${size ?? ''} ${className}`}
      refraction={refraction} onClick={onClick} style={style}>
      {children}
    </Glass>
  );
}

/* ───────────────────────── Liquid lens (shared by tab bar + segmented) ───────────────────────── */

/**
 * A selection lens that slides between equal-width slots. While moving it stretches with its
 * velocity (and squeezes vertically), so it reads as a drop of liquid rather than a box.
 * It can be grabbed and dragged; on release it snaps to the nearest slot.
 */
function useLiquidLens(
  containerRef: React.RefObject<HTMLDivElement | null>,
  lensRef: React.RefObject<HTMLDivElement | null>,
  count: number,
  index: number,
  onSelect: (i: number) => void,
  opts: { grow?: number; draggable?: boolean } = {},
) {
  const x = useRef(new Spring(0, SPRINGS.jelly));
  const grow = useRef(new Spring(1, SPRINGS.bouncy));
  const geom = useRef({ slot: 0, pad: 4 });
  const dragging = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const render = useCallback(() => {
    const lens = lensRef.current;
    if (!lens) return;
    const v = x.current.velocity;
    const stretch = Math.min(0.5, Math.abs(v) / 2400);
    const g = grow.current.value;
    lens.style.width = `${geom.current.slot}px`;
    lens.style.transform = `translateX(${x.current.value.toFixed(2)}px) scale(${((1 + stretch) * g).toFixed(4)}, ${((1 - stretch * 0.45) * g).toFixed(4)})`;
  }, [lensRef]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const pad = 4;
      const slot = (el.clientWidth - pad * 2) / count;
      geom.current = { slot, pad };
      if (!dragging.current) x.current.set(pad + slot * index);
      render();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  useEffect(() => {
    const a = x.current.onChange(render);
    const b = grow.current.onChange(render);
    return () => { a(); b(); };
  }, [render]);

  useEffect(() => {
    if (dragging.current) return;
    const { pad, slot } = geom.current;
    x.current.to(pad + slot * index, { config: SPRINGS.jelly });
  }, [index]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || opts.draggable === false) return;
    let start = 0;
    let lastSlot = index;
    return drag(el, {
      axis: 'x',
      threshold: 4,
      onStart: (s) => {
        const rect = el.getBoundingClientRect();
        const { pad, slot } = geom.current;
        const px = s.event.clientX - s.dx - rect.left;
        // Only grab when the press began on the lens itself
        const cur = x.current.value;
        if (px < cur - 6 || px > cur + slot + 6) return false;
        dragging.current = true;
        start = cur;
        lastSlot = Math.round((cur - pad) / slot);
        grow.current.to(opts.grow ?? 1.18, { config: SPRINGS.snappy });
        lensRef.current?.classList.add('lensing');
      },
      onMove: ({ dx }) => {
        const { pad, slot } = geom.current;
        const min = pad;
        const max = pad + slot * (count - 1);
        let p = start + dx;
        if (p < min) p = min + rubberBand(p - min, slot, 0.5);
        if (p > max) p = max + rubberBand(p - max, slot, 0.5);
        const prev = x.current.value;
        x.current.set(p, (p - prev) * 60);
        const nearest = clamp(Math.round((p - pad) / slot), 0, count - 1);
        if (nearest !== lastSlot) { lastSlot = nearest; haptic(5); }
      },
      onEnd: ({ vx }) => {
        dragging.current = false;
        const { pad, slot } = geom.current;
        const projected = x.current.value + vx * 0.12;
        const i = clamp(Math.round((projected - pad) / slot), 0, count - 1);
        grow.current.to(1, { config: SPRINGS.bouncy });
        lensRef.current?.classList.remove('lensing');
        x.current.to(pad + slot * i, { velocity: vx, config: SPRINGS.jelly });
        onSelectRef.current(i);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, opts.draggable]);
}

/* ───────────────────────── Segmented control ───────────────────────── */

export function Segmented<T extends string>({ options, value, onChange, className = '' }: {
  options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lens = useRef<HTMLDivElement>(null);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  useLiquidLens(ref, lens, options.length, index, (i) => onChange(options[i].value), { grow: 1.12 });
  return (
    <Glass ref={ref} className={`segmented ${className}`} role="tablist">
      <Glass ref={lens} className="lens" refraction={{ depth: 26, bezel: 14 }} />
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''}
          onClick={() => { onChange(o.value); haptic(5); }}>
          {o.label}
        </button>
      ))}
    </Glass>
  );
}

/* ───────────────────────── Tab bar ───────────────────────── */

export function TabBar<T extends string>({ tabs, value, onChange }: {
  tabs: { value: T; label: string; icon: ReactNode }[]; value: T; onChange: (v: T) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lens = useRef<HTMLDivElement>(null);
  const index = Math.max(0, tabs.findIndex((t) => t.value === value));
  useLiquidLens(ref, lens, tabs.length, index, (i) => onChange(tabs[i].value), { grow: 1.22 });
  return (
    <div className="tabbar-wrap">
      <Glass ref={ref} className="tabbar" refraction={{ depth: 40, bezel: 24 }} role="tablist">
        <Glass ref={lens} className="lens" refraction={{ depth: 34, bezel: 20 }} />
        {tabs.map((t) => (
          <button key={t.value} type="button" role="tab" aria-selected={t.value === value} className={`tab ${t.value === value ? 'on' : ''}`}
            onClick={() => { onChange(t.value); haptic(5); }}>
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </Glass>
    </div>
  );
}

/* ───────────────────────── Slider with liquid thumb ───────────────────────── */

/**
 * iOS 26 slider: grabbing the thumb inflates it into a clear glass lens that magnifies the track
 * beneath; pulling past either end rubber-bands the whole control.
 */
export function Slider({ value, min = 0, max = 1, step = 0, onChange, onCommit, label }: {
  value: number; min?: number; max?: number; step?: number; label: string;
  onChange?: (v: number) => void; onCommit?: (v: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const pos = useRef(new Spring(0, SPRINGS.snappy));
  const grow = useRef(new Spring(1, SPRINGS.bouncy));
  const over = useRef(new Spring(0, SPRINGS.bouncy));
  const dragging = useRef(false);
  const cb = useRef({ onChange, onCommit });
  cb.current = { onChange, onCommit };

  const toFrac = (v: number) => (max === min ? 0 : (v - min) / (max - min));
  const fromFrac = (f: number) => {
    let v = min + clamp(f, 0, 1) * (max - min);
    if (step) v = Math.round(v / step) * step;
    return +v.toFixed(4);
  };

  const render = useCallback(() => {
    const el = ref.current;
    if (!el || !thumb.current || !fill.current) return;
    const w = el.clientWidth;
    const f = pos.current.value;
    const o = over.current.value;
    const g = grow.current.value;
    thumb.current.style.transform = `translateX(${(f * w + o).toFixed(2)}px) scale(${(g * (1 + Math.abs(o) / 140)).toFixed(4)}, ${(g / (1 + Math.abs(o) / 260)).toFixed(4)})`;
    fill.current.style.width = `${(f * 100).toFixed(3)}%`;
    el.style.transform = o ? `scaleX(${(1 + Math.abs(o) / Math.max(1, w) * 0.5).toFixed(4)})` : '';
    el.style.transformOrigin = o > 0 ? '0% 50%' : '100% 50%';
  }, []);

  useEffect(() => {
    const a = pos.current.onChange(render);
    const b = grow.current.onChange(render);
    const c = over.current.onChange(render);
    return () => { a(); b(); c(); };
  }, [render]);

  useEffect(() => {
    if (!dragging.current) pos.current.to(toFrac(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, min, max]);

  useLayoutEffect(() => {
    pos.current.set(toFrac(value));
    const ro = new ResizeObserver(render);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = ref.current!;
    const fracAt = (clientX: number) => {
      const r = el.getBoundingClientRect();
      return (clientX - r.left) / r.width;
    };
    const update = (clientX: number) => {
      const raw = fracAt(clientX);
      const w = el.clientWidth;
      const f = clamp(raw, 0, 1);
      pos.current.set(f);
      over.current.set(raw < 0 ? rubberBand(raw * w, 80) : raw > 1 ? rubberBand((raw - 1) * w, 80) : 0);
      cb.current.onChange?.(fromFrac(f));
    };
    const begin = () => {
      dragging.current = true;
      setActive(true);
      grow.current.to(1.45, { config: SPRINGS.snappy });
    };
    const end = () => {
      dragging.current = false;
      setActive(false);
      grow.current.to(1, { config: SPRINGS.bouncy });
      over.current.to(0, { config: SPRINGS.jelly });
      cb.current.onCommit?.(fromFrac(pos.current.value));
    };
    return drag(el, {
      axis: 'x',
      threshold: 2,
      onStart: (s) => { begin(); update(s.event.clientX); },
      onMove: (s) => update(s.event.clientX),
      onEnd: end,
      onTap: (e) => { begin(); update(e.clientX); setTimeout(end, 120); },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max, step]);

  return (
    <div ref={ref} className="slider" role="slider" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} tabIndex={0}
      onKeyDown={(e) => {
        const d = (step || (max - min) / 20) * (e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0);
        if (!d) return;
        e.preventDefault();
        const v = clamp(value + d, min, max);
        onChange?.(v);
        onCommit?.(v);
      }}>
      <div className="track"><div ref={fill} className="fill" /></div>
      <Glass ref={thumb} className={`thumb ${active ? 'lensing clear' : ''}`} refraction={active ? { depth: 34, bezel: 13 } : false} />
    </div>
  );
}

/* ───────────────────────── Bottom sheet ───────────────────────── */

export interface SheetHandle { close(): void }

/**
 * Glass sheet that rises with a spring; drag it down to dismiss (velocity-aware), drag it up and
 * it rubber-bands and stretches.
 */
export const Sheet = forwardRef<SheetHandle, { open: boolean; onClose: () => void; children: ReactNode; className?: string }>(
  function Sheet({ open, onClose, children, className = '' }, fwd) {
    const ref = useRef<HTMLDivElement>(null);
    const scrim = useRef<HTMLDivElement>(null);
    const y = useRef(new Spring(1, SPRINGS.smooth));
    const [mounted, setMounted] = useState(open);
    const closing = useRef(false);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    const render = useCallback(() => {
      const el = ref.current;
      if (!el) return;
      const h = el.offsetHeight || innerHeight;
      const v = y.current.value; // 0 = open, 1 = closed, <0 = pulled up
      const ty = v >= 0 ? v * h : rubberBand(v * h, h, 0.4);
      const stretch = v < 0 ? Math.min(0.06, -ty / h) : 0;
      el.style.transform = `translate(-50%, ${ty.toFixed(2)}px) scaleY(${(1 + stretch).toFixed(4)})`;
      if (scrim.current) scrim.current.style.opacity = String(clamp(1 - v, 0, 1));
    }, []);

    useEffect(() => y.current.onChange(render), [render]);

    const dismiss = useCallback((velocity = 0) => {
      if (closing.current) return;
      closing.current = true;
      y.current.to(1, {
        velocity, config: SPRINGS.smooth,
        onRest: () => { setMounted(false); closing.current = false; onCloseRef.current(); },
      });
    }, []);
    useImperativeHandle(fwd, () => ({ close: () => dismiss() }), [dismiss]);

    useEffect(() => {
      if (open) {
        setMounted(true);
        closing.current = false;
      } else if (mounted) dismiss();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const openedAt = useRef(0);
    useLayoutEffect(() => {
      if (!mounted || !open) return;
      openedAt.current = performance.now();
      y.current.set(1);
      render();
      requestAnimationFrame(() => y.current.to(0, { config: SPRINGS.smooth }));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mounted]);

    useEffect(() => {
      const el = ref.current;
      if (!mounted || !el) return;
      let startV = 0;
      return drag(el, {
        axis: 'y',
        onStart: (s) => {
          // Let the inner list scroll unless it's at the top and the user pulls down.
          const scroller = (s.event.target as HTMLElement).closest('.sheet-scroll') as HTMLElement | null;
          if (scroller && (scroller.scrollTop > 0 || s.dy < 0)) return false;
          startV = y.current.value;
        },
        onMove: ({ dy }) => y.current.set(startV + dy / (el.offsetHeight || innerHeight)),
        onEnd: ({ vy }) => {
          const h = el.offsetHeight || innerHeight;
          if (y.current.value > 0.3 || vy > 900) dismiss(vy / h);
          else y.current.to(0, { velocity: vy / h, config: SPRINGS.bouncy });
        },
      });
    }, [mounted, dismiss]);

    if (!mounted) return null;
    return (
      <>
        {/* The click that opened the sheet would otherwise land on the fresh scrim and close it. */}
        <div ref={scrim} className="scrim" style={{ pointerEvents: 'auto' }} onClick={() => performance.now() - openedAt.current > 350 && dismiss()} />
        <Glass ref={ref} className={`sheet strong ${className}`} role="dialog" aria-modal="true">
          <div className="grabber" />
          {children}
        </Glass>
      </>
    );
  },
);

/* ───────────────────────── Toggle ───────────────────────── */

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  const knob = useRef<HTMLDivElement>(null);
  const x = useRef(new Spring(on ? 1 : 0, SPRINGS.bouncy));
  useEffect(() => x.current.onChange((v) => {
    if (knob.current) knob.current.style.transform = `translateX(${(v * 14).toFixed(2)}px) scaleX(${(1 + Math.abs(x.current.velocity) / 40).toFixed(3)})`;
  }), []);
  useEffect(() => { x.current.to(on ? 1 : 0); }, [on]);
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => { onChange(!on); haptic(6); }}>
      <div ref={knob} className="knob" />
    </button>
  );
}

/* ───────────────────────── Toasts ───────────────────────── */

interface ToastAction { label: string; run: () => void }
interface ToastMsg { text: string; icon?: ReactNode; action?: ToastAction }
let pushToast: ((t: ToastMsg) => void) | null = null;
export const toast = (text: string, icon?: ReactNode, action?: ToastAction) => pushToast?.({ text, icon, action });

export function Toaster() {
  const [t, setT] = useState<(ToastMsg & { id: number }) | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const y = useRef(new Spring(-1, SPRINGS.bouncy));
  useEffect(() => {
    pushToast = (x) => setT({ ...x, id: Date.now() });
    return () => { pushToast = null; };
  }, []);
  useEffect(() => y.current.onChange((v) => {
    if (ref.current) ref.current.style.transform = `translate(-50%, ${(v * 90).toFixed(1)}px) scale(${(1 - Math.abs(v) * 0.2).toFixed(3)})`;
  }), []);
  useEffect(() => {
    if (!t) return;
    y.current.set(-1);
    y.current.to(0);
    const h = setTimeout(() => y.current.to(-1, { config: SPRINGS.smooth, onRest: () => setT(null) }), t.action ? 4500 : 2600);
    return () => clearTimeout(h);
  }, [t]);
  if (!t) return null;
  return (
    <Glass ref={ref} className="toast strong" refraction={{ depth: 30 }} role="status">
      {t.icon}<span>{t.text}</span>
      {t.action && (
        <button type="button" style={{ color: 'var(--accent)', fontWeight: 700, marginLeft: 6 }}
          onClick={() => { t.action!.run(); y.current.to(-1, { config: SPRINGS.smooth, onRest: () => setT(null) }); }}>
          {t.action.label}
        </button>
      )}
    </Glass>
  );
}
