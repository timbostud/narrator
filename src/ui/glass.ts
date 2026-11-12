// Liquid Glass rendering helpers.
//
// Real Liquid Glass *refracts*: content behind the curved rim of a glass shape is bent like a lens.
// We reproduce that with a per-shape displacement map fed into an SVG feDisplacementMap, applied
// through `backdrop-filter: url(#…)` (Chromium). Each colour channel is displaced by a slightly
// different amount for subtle chromatic dispersion at the edge. Other browsers fall back to a
// blur + saturation material, which is what Apple's "frosted" fallback looks like anyway.

const SVG_NS = 'http://www.w3.org/2000/svg';

export const refractionSupported = (() => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const chromium = /Chrome\/|Chromium\/|Edg\//.test(ua) && !/Firefox\//.test(ua);
  return chromium && CSS.supports('backdrop-filter', 'url(#a)');
})();

let defs: SVGDefsElement | null = null;
function getDefs(): SVGDefsElement {
  if (defs) return defs;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
  defs = document.createElementNS(SVG_NS, 'defs');
  svg.appendChild(defs);
  document.body.appendChild(svg);
  return defs;
}

const mapCache = new Map<string, string>();

/**
 * Displacement map for a rounded rectangle. Inside a band of width `bezel` along the rim the
 * surface curves away (a squircle profile), so pixels are displaced along the outward normal,
 * most strongly at the very edge. The flat centre is left untouched.
 */
function displacementMap(w: number, h: number, r: number, bezel: number): string {
  const key = `${w}x${h}r${r}b${bezel}`;
  const hit = mapCache.get(key);
  if (hit) return hit;
  // Render at reduced resolution; the filter scales it back up smoothly.
  const s = Math.min(1, 220 / Math.max(w, h));
  const W = Math.max(2, Math.round(w * s));
  const H = Math.max(2, Math.round(h * s));
  const R = Math.min(r * s, W / 2, H / 2);
  const B = Math.max(1, bezel * s);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const hw = W / 2;
  const hh = H / 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5 - hw;
      const py = y + 0.5 - hh;
      const qx = Math.abs(px) - (hw - R);
      const qy = Math.abs(py) - (hh - R);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const dist = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - R; // < 0 inside
      const inside = -dist;
      let nx = 0;
      let ny = 0;
      let mag = 0;
      if (inside >= 0 && inside < B) {
        if (qx > 0 && qy > 0) {
          const l = Math.hypot(qx, qy) || 1;
          nx = (qx / l) * Math.sign(px);
          ny = (qy / l) * Math.sign(py);
        } else if (qx > qy) nx = Math.sign(px);
        else ny = Math.sign(py);
        const t = inside / B; // 0 at rim → 1 at inner edge of bezel
        // Slope of a convex squircle surface: steep at the rim, flat inside.
        mag = Math.pow(1 - t, 2.4);
      }
      const i = (y * W + x) * 4;
      img.data[i] = 128 + nx * mag * 127;
      img.data[i + 1] = 128 + ny * mag * 127;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL();
  mapCache.set(key, url);
  return url;
}

const filters = new Map<string, number>();

/** Creates (or reuses) an SVG filter for a glass shape and returns its id. */
export function acquireFilter(w: number, h: number, r: number, bezel: number, depth: number): string {
  w = Math.round(w);
  h = Math.round(h);
  const id = `lg-${w}-${h}-${Math.round(r)}-${Math.round(bezel)}-${Math.round(depth)}`;
  filters.set(id, (filters.get(id) ?? 0) + 1);
  if (document.getElementById(id)) return id;
  const f = document.createElementNS(SVG_NS, 'filter');
  f.id = id;
  f.setAttribute('x', '0');
  f.setAttribute('y', '0');
  f.setAttribute('width', String(w));
  f.setAttribute('height', String(h));
  f.setAttribute('filterUnits', 'userSpaceOnUse');
  f.setAttribute('primitiveUnits', 'userSpaceOnUse');
  f.setAttribute('color-interpolation-filters', 'sRGB');
  const map = displacementMap(w, h, r, bezel);
  f.innerHTML = `
    <feImage href="${map}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${depth}" xChannelSelector="R" yChannelSelector="G" result="dr"/>
    <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${depth * 0.92}" xChannelSelector="R" yChannelSelector="G" result="dg"/>
    <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="g"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${depth * 0.84}" xChannelSelector="R" yChannelSelector="G" result="db"/>
    <feColorMatrix in="db" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="b"/>
    <feBlend in="r" in2="g" mode="screen" result="rg"/>
    <feBlend in="rg" in2="b" mode="screen"/>`;
  getDefs().appendChild(f);
  return id;
}

export function releaseFilter(id: string) {
  const n = (filters.get(id) ?? 1) - 1;
  if (n > 0) {
    filters.set(id, n);
    return;
  }
  filters.delete(id);
  // Keep recently-used filters around briefly; shapes often bounce between sizes.
  setTimeout(() => {
    if (!filters.has(id)) document.getElementById(id)?.remove();
  }, 4000);
}

export interface RefractOptions {
  radius?: number | 'pill';
  bezel?: number;
  depth?: number;
  blur?: number;
  saturate?: number;
}

/** Applies live refraction to an element, tracking its size. Returns a cleanup function. */
export function refract(el: HTMLElement, opts: RefractOptions = {}): () => void {
  if (!refractionSupported || document.documentElement.dataset.glass === 'frosted') return () => {};
  let current: string | null = null;
  const apply = () => {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h) return;
    const radius = opts.radius === 'pill' || opts.radius === undefined ? Math.min(w, h) / 2 : opts.radius;
    const bezel = opts.bezel ?? Math.min(radius, 22, Math.min(w, h) / 2);
    const id = acquireFilter(w, h, radius, bezel, opts.depth ?? 46);
    if (current) releaseFilter(current);
    current = id;
    const tail = `blur(${opts.blur ?? 2}px) saturate(${opts.saturate ?? 1.7}) brightness(1.06)`;
    el.style.setProperty('backdrop-filter', `url(#${id}) ${tail}`);
    el.style.setProperty('-webkit-backdrop-filter', `url(#${id}) ${tail}`);
    el.classList.add('is-refracting');
  };
  const ro = new ResizeObserver(() => requestAnimationFrame(apply));
  ro.observe(el);
  apply();
  return () => {
    ro.disconnect();
    if (current) releaseFilter(current);
    el.style.removeProperty('backdrop-filter');
    el.style.removeProperty('-webkit-backdrop-filter');
    el.classList.remove('is-refracting');
  };
}

/**
 * Global light source for specular highlights. Follows the pointer; on phones it follows device
 * tilt; when idle it drifts slowly so the glass always feels alive.
 */
export function startLight(): () => void {
  const root = document.documentElement;
  let tx = innerWidth * 0.3;
  let ty = innerHeight * 0.15;
  let x = tx;
  let y = ty;
  let lastInput = 0;
  let raf = 0;
  const onMove = (e: PointerEvent) => {
    tx = e.clientX;
    ty = e.clientY;
    lastInput = performance.now();
  };
  const onTilt = (e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return;
    tx = innerWidth * (0.5 + Math.max(-1, Math.min(1, e.gamma / 35)) * 0.5);
    ty = innerHeight * (0.5 + Math.max(-1, Math.min(1, (e.beta - 45) / 35)) * 0.5);
    lastInput = performance.now();
  };
  const loop = (t: number) => {
    if (t - lastInput > 4000) {
      tx = innerWidth * (0.5 + 0.38 * Math.cos(t / 5200));
      ty = innerHeight * (0.35 + 0.25 * Math.sin(t / 4100));
    }
    x += (tx - x) * 0.12;
    y += (ty - y) * 0.12;
    root.style.setProperty('--px', `${x.toFixed(1)}px`);
    root.style.setProperty('--py', `${y.toFixed(1)}px`);
    raf = requestAnimationFrame(loop);
  };
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('deviceorientation', onTilt);
  raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    removeEventListener('pointermove', onMove);
    removeEventListener('deviceorientation', onTilt);
  };
}
