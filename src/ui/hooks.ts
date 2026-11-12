import { useEffect, useRef, type RefObject } from 'react';
import { refract, type RefractOptions } from './glass';
import { drag, haptic, rubberBand, Spring, SPRINGS, squeeze } from './physics';

/** Live refraction for a glass element. */
export function useRefraction(ref: RefObject<HTMLElement | null>, opts: RefractOptions | false = {}) {
  const key = JSON.stringify(opts);
  useEffect(() => {
    if (!ref.current || opts === false) return;
    return refract(ref.current, opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, key]);
}

/**
 * iOS 26 glass press: the control *grows* and brightens under the finger, then settles with a
 * small bounce. Also adds the squeeze when the finger slides while pressed.
 */
export function usePress(ref: RefObject<HTMLElement | null>, opts: { scale?: number; disabled?: boolean } = {}) {
  const target = opts.scale ?? 1.08;
  useEffect(() => {
    const el = ref.current;
    if (!el || opts.disabled) return;
    const s = new Spring(1, SPRINGS.bouncy);
    let stretchX = 0;
    let stretchY = 0;
    let x0 = 0;
    let y0 = 0;
    const render = () => {
      const k = s.value;
      el.style.transform = `translate(${stretchX * 0.35}px, ${stretchY * 0.35}px) scale(${(k * (1 + Math.abs(stretchX) / 300)).toFixed(4)}, ${(k * (1 + Math.abs(stretchY) / 300)).toFixed(4)})`;
    };
    const off = s.onChange(render);
    const down = (e: PointerEvent) => {
      x0 = e.clientX;
      y0 = e.clientY;
      stretchX = stretchY = 0;
      el.classList.add('pressed');
      s.to(target, { config: SPRINGS.snappy });
      addEventListener('pointermove', move);
      addEventListener('pointerup', up, { once: true });
      addEventListener('pointercancel', up, { once: true });
    };
    const move = (e: PointerEvent) => {
      stretchX = rubberBand(e.clientX - x0, 120, 0.6);
      stretchY = rubberBand(e.clientY - y0, 120, 0.6);
      render();
    };
    const up = () => {
      el.classList.remove('pressed');
      removeEventListener('pointermove', move);
      const sx = stretchX;
      const sy = stretchY;
      // Release the stretch through the same spring so it wobbles back
      const back = new Spring(1, SPRINGS.bouncy);
      back.onChange((v) => {
        stretchX = sx * v;
        stretchY = sy * v;
        render();
      });
      back.to(0);
      s.to(1, { config: SPRINGS.bouncy });
    };
    el.addEventListener('pointerdown', down);
    return () => {
      off();
      el.removeEventListener('pointerdown', down);
      removeEventListener('pointermove', move);
    };
  }, [ref, target, opts.disabled]);
}

/**
 * Pull-to-squeeze: dragging the element moves it with rubber-band resistance and deforms it —
 * stretching along the pull and squeezing across it (volume preserved). On release it springs
 * back with a wobble. Used for cards and anything "grabbable".
 */
export function useSqueeze(ref: RefObject<HTMLElement | null>, opts: { axis?: 'x' | 'y' | 'both'; limit?: number; onTap?: () => void } = {}) {
  const onTap = useRef(opts.onTap);
  onTap.current = opts.onTap;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const limit = opts.limit ?? 140;
    const sx = new Spring(0, SPRINGS.bouncy);
    const sy = new Spring(0, SPRINGS.bouncy);
    const render = () => {
      const x = sx.value;
      const y = sy.value;
      const ax = Math.abs(x) >= Math.abs(y) ? 'x' : 'y';
      const d = ax === 'x' ? x : y;
      const vel = ax === 'x' ? sx.velocity : sy.velocity;
      const amount = Math.min(0.22, Math.abs(d) / (ax === 'x' ? el.offsetWidth : el.offsetHeight) * 0.55 + Math.abs(vel) / 11000);
      el.style.transformOrigin = ax === 'x' ? (x > 0 ? '0% 50%' : '100% 50%') : y > 0 ? '50% 0%' : '50% 100%';
      el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) ${squeeze(amount, ax)}`;
    };
    const o1 = sx.onChange(render);
    const o2 = sy.onChange(render);
    const stop = drag(el, {
      axis: opts.axis ?? 'both',
      onStart: () => { el.classList.add('pressed'); haptic(6); },
      onMove: ({ dx, dy }) => {
        sx.set(opts.axis === 'y' ? 0 : rubberBand(dx, limit));
        sy.set(opts.axis === 'x' ? 0 : rubberBand(dy, limit));
      },
      onEnd: ({ vx, vy }) => {
        el.classList.remove('pressed');
        sx.to(0, { velocity: vx * 0.4, config: SPRINGS.jelly });
        sy.to(0, { velocity: vy * 0.4, config: SPRINGS.jelly });
      },
      onTap: () => onTap.current?.(),
    });
    return () => { stop(); o1(); o2(); };
  }, [ref, opts.axis, opts.limit]);
}
