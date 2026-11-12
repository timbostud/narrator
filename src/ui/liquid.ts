// Liquid merging between glass shapes, modelled on SwiftUI's GlassEffectContainer.
//
// Shapes in the same group stay separate at rest. When two of them come within `reach` px of
// each other, a glass "neck" grows between them like surface tension pulling two drops together.
// It is thin when they're far apart, widens as they approach, and fuses into a smooth fillet
// when they touch. Pull them apart and the neck thins and snaps.
//
// Each neck is its own glass element clipped with `clip-path: path(…)`, so it uses the same
// material (blur, saturation, tint) as the shapes it joins, and it sits just above them to cover
// their rim lines at the junction. Geometry:
//   - facing flat edges (e.g. mini player above the tab bar) → an edge bridge with concave fillets
//   - otherwise (e.g. two capsules side by side) → the classic metaball bridge between the two
//     nearest corner circles, drawn as tangent curves plus the circle arcs.

interface Shape {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

interface Member {
  el: HTMLElement;
  group: string;
  /** Cached computed style (refreshed every ~half second, not every frame). */
  radius: number;
  visible: boolean;
  checked: number;
}

const members = new Set<Member>();
const bridges = new Map<string, { el: HTMLDivElement; rim: SVGPathElement; svg: SVGSVGElement; last: string }>();
let raf = 0;
let layer: HTMLDivElement | null = null;

/** Gap in px under which shapes start to pull toward each other. Kept small, as in iOS. */
const REACH = 13;

function shapeOf(m: Member, frame: number): Shape | null {
  const el = m.el;
  if (frame - m.checked > 30) {
    const cs = getComputedStyle(el);
    m.visible = !(cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05);
    m.radius = parseFloat(cs.borderTopLeftRadius) || 0;
    m.checked = frame;
  }
  if (!m.visible) return null;
  const b = el.getBoundingClientRect();
  if (!b.width || !b.height) return null;
  const rad = m.radius;
  // Scale the corner radius with any transform (squeeze) so the geometry stays matched.
  const sx = el.offsetWidth ? b.width / el.offsetWidth : 1;
  const sy = el.offsetHeight ? b.height / el.offsetHeight : 1;
  const r = Math.min(rad * Math.min(sx, sy), b.width / 2, b.height / 2);
  return { x: b.left, y: b.top, w: b.width, h: b.height, r };
}

const f = (n: number) => n.toFixed(1);

/** Bridge between two facing horizontal edges: `top` is above `bottom`. */
interface Bridge { fill: string; rim: string }

function edgeBridgeV(top: Shape, bot: Shape, x0: number, x1: number): Bridge | null {
  const yA = top.y + top.h;
  const yB = bot.y;
  const gap = yB - yA;
  if (gap >= REACH) return null;
  const t = Math.max(0, Math.min(1, 1 - Math.max(0, gap) / REACH));
  const half = (x1 - x0) / 2;
  const cx = (x0 + x1) / 2;
  // Neck width grows quickly once inside reach, like a meniscus snapping together.
  const n = Math.max(1, half * Math.pow(t, 1.6) * 0.9);
  const fil = Math.min(14, 4 + 10 * t, half - n + 6);
  // When the shapes overlap (gap < 0) the junction collapses to one line; keep a minimum
  // height so the fillets still form a smooth waist instead of an inverted path.
  const mid = (yA + yB) / 2;
  const span = Math.max(gap + 4, fil * 0.9);
  const ya = mid - span / 2;
  const yb = mid + span / 2;
  const ym = mid;
  const L = cx - n;
  const R = cx + n;
  const left = [
    `M ${f(L - fil)} ${f(ya)}`,
    `C ${f(L - fil * 0.3)} ${f(ya)} ${f(L)} ${f(ya + (ym - ya) * 0.45)} ${f(L)} ${f(ym)}`,
    `C ${f(L)} ${f(yb - (yb - ym) * 0.45)} ${f(L - fil * 0.3)} ${f(yb)} ${f(L - fil)} ${f(yb)}`,
  ];
  const right = [
    `M ${f(R + fil)} ${f(yb)}`,
    `C ${f(R + fil * 0.3)} ${f(yb)} ${f(R)} ${f(yb - (yb - ym) * 0.45)} ${f(R)} ${f(ym)}`,
    `C ${f(R)} ${f(ya + (ym - ya) * 0.45)} ${f(R + fil * 0.3)} ${f(ya)} ${f(R + fil)} ${f(ya)}`,
  ];
  return {
    fill: [...left, `L ${f(R + fil)} ${f(yb)}`, ...right.slice(1), 'Z'].join(' '),
    rim: [...left, ...right].join(' '),
  };
}

/** Same as above for facing vertical edges: `left` is left of `right`. */
function edgeBridgeH(left: Shape, right: Shape, y0: number, y1: number): Bridge | null {
  // Reuse the vertical construction in a transposed coordinate system.
  const tr = (s: Shape): Shape => ({ x: s.y, y: s.x, w: s.h, h: s.w, r: s.r });
  const d = edgeBridgeV(tr(left), tr(right), y0, y1);
  if (!d) return null;
  // Swap every x/y pair back (these paths only contain M/C/L, i.e. coordinate pairs).
  const swap = (p: string) => p.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_m, a, b) => `${b} ${a}`);
  return { fill: swap(d.fill), rim: swap(d.rim) };
}

/** Metaball bridge between two circles (after varun.ca/metaballs), including the arcs. */
function circleBridge(c1: { x: number; y: number }, r1: number, c2: { x: number; y: number }, r2: number): Bridge | null {
  const d = Math.hypot(c2.x - c1.x, c2.y - c1.y);
  const gap = d - r1 - r2;
  if (gap >= REACH || d <= Math.abs(r1 - r2) || d === 0) return null;
  const t = Math.max(0, Math.min(1, 1 - Math.max(0, gap) / REACH));
  // Spread controls how far around the circles the neck attaches; it grows as they approach.
  const v = 0.18 + 0.32 * Math.pow(t, 1.4);
  const handle = 2.4;
  const u1 = d < r1 + r2 ? Math.acos((r1 * r1 + d * d - r2 * r2) / (2 * r1 * d)) : 0;
  const u2 = d < r1 + r2 ? Math.acos((r2 * r2 + d * d - r1 * r1) / (2 * r2 * d)) : 0;
  const ang = Math.atan2(c2.y - c1.y, c2.x - c1.x);
  const spread = Math.acos(Math.max(-1, Math.min(1, (r1 - r2) / d)));
  const a1 = ang + u1 + (spread - u1) * v;
  const a2 = ang - u1 - (spread - u1) * v;
  const a3 = ang + Math.PI - u2 - (Math.PI - u2 - spread) * v;
  const a4 = ang - Math.PI + u2 + (Math.PI - u2 - spread) * v;
  const pt = (c: { x: number; y: number }, r: number, a: number) => ({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  const p1 = pt(c1, r1, a1);
  const p2 = pt(c1, r1, a2);
  const p3 = pt(c2, r2, a3);
  const p4 = pt(c2, r2, a4);
  const total = r1 + r2;
  const d2 = Math.min(v * handle, Math.hypot(p1.x - p3.x, p1.y - p3.y) / total) * Math.min(1, (d * 2) / total);
  const h1 = pt(p1, r1 * d2, a1 - Math.PI / 2);
  const h2 = pt(p2, r1 * d2, a2 + Math.PI / 2);
  const h3 = pt(p3, r2 * d2, a3 + Math.PI / 2);
  const h4 = pt(p4, r2 * d2, a4 - Math.PI / 2);
  // Close each end along the circle's own arc (the side facing the other circle), so the neck
  // never overlaps the shapes' interiors.
  const sideA = `C ${f(h1.x)} ${f(h1.y)} ${f(h3.x)} ${f(h3.y)} ${f(p3.x)} ${f(p3.y)}`;
  const sideB = `C ${f(h4.x)} ${f(h4.y)} ${f(h2.x)} ${f(h2.y)} ${f(p2.x)} ${f(p2.y)}`;
  return {
    fill: [
      `M ${f(p1.x)} ${f(p1.y)}`, sideA,
      `A ${f(r2)} ${f(r2)} 0 0 1 ${f(p4.x)} ${f(p4.y)}`, sideB,
      `A ${f(r1)} ${f(r1)} 0 0 1 ${f(p1.x)} ${f(p1.y)}`, 'Z',
    ].join(' '),
    rim: `M ${f(p1.x)} ${f(p1.y)} ${sideA} M ${f(p4.x)} ${f(p4.y)} ${sideB}`,
  };
}

/** Shifts an absolute path (M/L/C/A/Z commands) by -ox,-oy. */
function translate(d: string, ox: number, oy: number): string {
  return d.replace(/([MLCA])([^MLCAZ]*)/g, (_m, cmd: string, args: string) => {
    const n = args.trim().split(/\s+/).filter(Boolean).map(Number);
    if (cmd === 'A') {
      // rx ry rotation large-arc sweep x y
      for (let i = 0; i + 6 < n.length + 1; i += 7) { n[i + 5] -= ox; n[i + 6] -= oy; }
    } else {
      for (let i = 0; i + 1 < n.length; i += 2) { n[i] -= ox; n[i + 1] -= oy; }
    }
    return `${cmd} ${n.map((v) => f(v)).join(' ')} `;
  });
}

/** Corner circle of a rounded rect nearest to a point. */
function cornerToward(s: Shape, px: number, py: number) {
  const cx = Math.min(Math.max(px, s.x + s.r), s.x + s.w - s.r);
  const cy = Math.min(Math.max(py, s.y + s.r), s.y + s.h - s.r);
  return { x: cx, y: cy };
}

function bridgePath(a: Shape, b: Shape): Bridge | null {
  // Flat-edge overlap (excluding rounded corners)
  const fx0 = Math.max(a.x + a.r, b.x + b.r);
  const fx1 = Math.min(a.x + a.w - a.r, b.x + b.w - b.r);
  const fy0 = Math.max(a.y + a.r, b.y + b.r);
  const fy1 = Math.min(a.y + a.h - a.r, b.y + b.h - b.r);
  if (fx1 - fx0 > 16) {
    if (a.y + a.h <= b.y + 1) return edgeBridgeV(a, b, fx0, fx1);
    if (b.y + b.h <= a.y + 1) return edgeBridgeV(b, a, fx0, fx1);
  }
  if (fy1 - fy0 > 16) {
    if (a.x + a.w <= b.x + 1) return edgeBridgeH(a, b, fy0, fy1);
    if (b.x + b.w <= a.x + 1) return edgeBridgeH(b, a, fy0, fy1);
  }
  // Otherwise join the two nearest corner circles.
  const ca = cornerToward(a, b.x + b.w / 2, b.y + b.h / 2);
  const cb = cornerToward(b, ca.x, ca.y);
  const ca2 = cornerToward(a, cb.x, cb.y);
  return circleBridge(ca2, Math.max(a.r, 1), cb, Math.max(b.r, 1));
}

function ensureLayer(): HTMLDivElement {
  if (layer) return layer;
  layer = document.createElement('div');
  layer.className = 'liquid-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  return layer;
}

function getBridge(key: string) {
  let b = bridges.get(key);
  if (b) return b;
  const el = document.createElement('div');
  el.className = 'liquid-bridge';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'liquid-rim');
  const rim = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svg.appendChild(rim);
  ensureLayer().append(el, svg);
  b = { el, rim, svg, last: '' };
  bridges.set(key, b);
  return b;
}

let frame = 0;

function tick() {
  raf = requestAnimationFrame(tick);
  frame++;
  const byGroup = new Map<string, { m: Member; s: Shape }[]>();
  for (const m of members) {
    if (!m.el.isConnected) { members.delete(m); continue; }
    const s = shapeOf(m, frame);
    if (!s) continue;
    const list = byGroup.get(m.group) ?? [];
    list.push({ m, s });
    byGroup.set(m.group, list);
  }
  const seen = new Set<string>();
  byGroup.forEach((list, group) => {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].s;
        const c = list[j].s;
        const d = bridgePath(a, c);
        if (!d) continue;
        const key = `${group}:${list[i].m.el.dataset.liquidId}:${list[j].m.el.dataset.liquidId}`;
        seen.add(key);
        const b = getBridge(key);
        // Tight box around both shapes: the blur only has to be computed there.
        const x0 = Math.floor(Math.min(a.x, c.x)) - 4;
        const y0 = Math.floor(Math.min(a.y, c.y)) - 4;
        const x1 = Math.ceil(Math.max(a.x + a.w, c.x + c.w)) + 4;
        const y1 = Math.ceil(Math.max(a.y + a.h, c.y + c.h)) + 4;
        const sig = `${x0},${y0},${x1},${y1}|${d.fill}`;
        if (b.last !== sig) {
          b.last = sig;
          for (const node of [b.el, b.svg] as (HTMLElement | SVGSVGElement)[]) {
            node.style.left = `${x0}px`;
            node.style.top = `${y0}px`;
            node.style.width = `${x1 - x0}px`;
            node.style.height = `${y1 - y0}px`;
          }
          b.el.style.clipPath = `path('${translate(d.fill, x0, y0)}')`;
          b.rim.setAttribute('d', translate(d.rim, x0, y0));
        }
        b.el.style.display = '';
        b.svg.style.display = '';
      }
    }
  });
  bridges.forEach((b, key) => {
    if (!seen.has(key) && b.last) {
      b.last = '';
      b.el.style.display = 'none';
      b.svg.style.display = 'none';
    }
  });
}

/**
 * Adds a glass element to a liquid group. Elements in the same group merge when they come close.
 * Returns an unregister function.
 */
let nextId = 1;

export function joinLiquid(el: HTMLElement, group = 'dock'): () => void {
  const m: Member = { el, group, radius: 0, visible: true, checked: -Infinity };
  if (!el.dataset.liquidId) el.dataset.liquidId = String(nextId++);
  members.add(m);
  if (!raf && !matchMedia('(prefers-reduced-motion: reduce)').matches) raf = requestAnimationFrame(tick);
  return () => {
    members.delete(m);
    if (!members.size) {
      cancelAnimationFrame(raf);
      raf = 0;
      bridges.forEach((b) => { b.el.style.display = 'none'; b.svg.style.display = 'none'; b.last = ''; });
    }
  };
}
