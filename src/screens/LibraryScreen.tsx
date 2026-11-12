import { useEffect, useMemo, useRef, useState } from 'react';
import { Glass, toast } from '../ui/components';
import { Pin, Play, Plus, Search, Trash } from '../ui/icons';
import { drag, haptic, rubberBand, Spring, SPRINGS, squeeze } from '../ui/physics';
import { useStore } from '../lib/store';
import { deleteDoc, library, newDoc, patchDoc, saveDoc, type Doc } from '../lib/library';
import { detectLang } from '../tts/text/detect';
import { playerState } from '../tts/player';

const ACTION_W = 96;

/**
 * A library row you can grab. Swipe left → delete, swipe right → play (or pin with a short swipe).
 * While pulled, the row stretches toward your finger and squeezes vertically; past the action
 * threshold it "snaps" with a haptic, and on release it springs back with a jelly wobble.
 */
function SwipeRow({ doc, onOpen, onPlay }: { doc: Doc; onOpen: () => void; onPlay: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const leftAct = useRef<HTMLDivElement>(null);
  const rightAct = useRef<HTMLDivElement>(null);
  const cbs = useRef({ onOpen, onPlay, doc });
  cbs.current = { onOpen, onPlay, doc };
  const lang = useMemo(() => detectLang(doc.text.slice(0, 600), 'en'), [doc.text]);
  const nowPlaying = useStore(playerState, (s) => s.docId === doc.id && (s.status === 'playing' || s.status === 'buffering'));

  useEffect(() => {
    const el = row.current!;
    const w = wrap.current!;
    const x = new Spring(0, SPRINGS.bouncy);
    let armed: 'left' | 'right' | null = null;
    const render = () => {
      const width = w.offsetWidth;
      const val = x.value;
      // Subtle on position, stronger with speed: a slow pull barely deforms, a flick wobbles.
      const stretch = Math.min(0.1, Math.abs(val) / width * 0.18 + Math.abs(x.velocity) / 14000);
      el.style.transformOrigin = val > 0 ? '0% 50%' : '100% 50%';
      el.style.transform = `translateX(${val.toFixed(2)}px) ${squeeze(stretch, 'x')}`;
      const p = Math.min(1, Math.abs(val) / ACTION_W);
      if (leftAct.current) {
        leftAct.current.style.opacity = val > 0 ? String(p) : '0';
        leftAct.current.style.transform = `scale(${0.7 + 0.3 * p})`;
      }
      if (rightAct.current) {
        rightAct.current.style.opacity = val < 0 ? String(p) : '0';
        rightAct.current.style.transform = `scale(${0.7 + 0.3 * p})`;
      }
    };
    const off = x.onChange(render);
    // Long-press to pin: the row swells, then pops back when the pin toggles.
    let lp = 0;
    let longPressed = false;
    const pop = new Spring(1, SPRINGS.bouncy);
    pop.onChange((k) => { if (!x.value) el.style.transform = `scale(${k.toFixed(4)})`; });
    const down = () => {
      longPressed = false;
      clearTimeout(lp);
      pop.to(1.03, { config: SPRINGS.smooth });
      lp = window.setTimeout(() => {
        longPressed = true;
        haptic(14);
        const d = cbs.current.doc;
        void patchDoc(d.id, { pinned: !d.pinned });
        toast(d.pinned ? 'Unpinned' : 'Pinned to top', <Pin />);
        pop.set(1.07);
        pop.to(1, { config: SPRINGS.jelly });
      }, 520);
    };
    const cancelLp = () => { clearTimeout(lp); if (!longPressed) pop.to(1); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', cancelLp);
    el.addEventListener('pointercancel', cancelLp);
    el.addEventListener('pointerleave', cancelLp);
    const stop = drag(el, {
      axis: 'x',
      onStart: () => { cancelLp(); el.classList.add('pressed'); },
      onMove: ({ dx }) => {
        const width = w.offsetWidth;
        // Free movement up to the action width, then rubber-band resistance.
        const lim = width * 0.42;
        const val = Math.abs(dx) < lim ? dx : Math.sign(dx) * (lim + rubberBand(Math.abs(dx) - lim, width * 0.6));
        const prev = x.value;
        x.set(val, (val - prev) * 60);
        const nowArmed = val > ACTION_W ? 'right' : val < -ACTION_W ? 'left' : null;
        if (nowArmed !== armed) {
          armed = nowArmed;
          if (armed) haptic(10);
          wrap.current?.classList.toggle('armed', !!armed);
        }
      },
      onEnd: ({ vx }) => {
        el.classList.remove('pressed');
        const fling = Math.abs(vx) > 900;
        const dir = armed ?? (fling && Math.abs(x.value) > 30 ? (vx > 0 ? 'right' : 'left') : null);
        armed = null;
        if (dir === 'left') {
          // Fly out, then delete with undo
          x.to(-w.offsetWidth * 1.2, {
            velocity: Math.min(vx, -1200), config: SPRINGS.snappy,
            onRest: async () => {
              const removed = await deleteDoc(cbs.current.doc.id);
              if (removed) toast(`Deleted "${removed.title || 'Untitled'}"`, <Trash />, { label: 'Undo', run: () => void saveDoc(removed) });
            },
          });
          return;
        }
        if (dir === 'right') cbs.current.onPlay();
        x.to(0, { velocity: vx, config: SPRINGS.jelly });
      },
      onTap: () => { if (!longPressed) cbs.current.onOpen(); },
    });
    return () => {
      stop();
      off();
      clearTimeout(lp);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', cancelLp);
      el.removeEventListener('pointercancel', cancelLp);
      el.removeEventListener('pointerleave', cancelLp);
    };
  }, []);

  const initials = (doc.title || 'U').split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');
  return (
    <div ref={wrap} className="row-wrap">
      <div className="row-actions" aria-hidden>
        <div ref={leftAct} className="act left"><Play /> Play</div>
        <div ref={rightAct} className="act right">Delete <Trash /></div>
      </div>
      <Glass ref={row} className="row" refraction={false} role="button" tabIndex={0} aria-label={`Open ${doc.title}`}
        onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
        <div className={`art ${nowPlaying ? 'playing' : ''}`}>{nowPlaying ? <Play width={20} /> : initials}</div>
        <div className="body">
          <div className="t">{doc.title || 'Untitled'}</div>
          <div className="p">{doc.text.slice(0, 160) || 'Empty'}</div>
          <div className="m">
            {doc.pinned && <Pin className="pin" />}
            <span>{lang === 'de' ? 'Deutsch' : 'English'}</span>
            <span>·</span>
            <span>{new Date(doc.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          </div>
        </div>
        <ProgressRing value={doc.progress} />
      </Glass>
    </div>
  );
}

function ProgressRing({ value }: { value: number }) {
  const r = 12;
  const c = 2 * Math.PI * r;
  return (
    <svg className="progress-ring" viewBox="0 0 30 30" aria-label={`${Math.round(value * 100)}% listened`}>
      <circle cx="15" cy="15" r={r} fill="none" stroke="var(--fill)" strokeWidth="3" />
      <circle cx="15" cy="15" r={r} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round"
        strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 15 15)" />
    </svg>
  );
}

export function LibraryScreen({ open, play, scrollRef }: { open: (d: Doc) => void; play: (d: Doc) => void; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const docs = useStore(library);
  const [q, setQ] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? docs.filter((d) => d.title.toLowerCase().includes(k) || d.text.toLowerCase().includes(k)) : docs;
  }, [docs, q]);

  // Pull down at the top of the list to create a new text: the list rubber-bands and a glass
  // drop stretches out of the top edge; release past the threshold to create.
  useEffect(() => {
    const scroller = scrollRef.current;
    const el = list.current;
    if (!scroller || !el) return;
    const y = new Spring(0, SPRINGS.bouncy);
    const TH = 90;
    let armed = false;
    const render = () => {
      const v = y.value;
      el.style.transform = v ? `translateY(${v.toFixed(2)}px)` : '';
      const ind = indicator.current;
      if (ind) {
        const p = Math.min(1, v / TH);
        ind.style.opacity = String(Math.min(1, p * 1.4));
        const stretch = Math.max(0, Math.min(0.5, (v - 20) / 160));
        ind.style.transform = `translateY(${(v * 0.45).toFixed(1)}px) scale(${(0.4 + 0.6 * p).toFixed(3)}) ${squeeze(stretch, 'y')} rotate(${(p * 90).toFixed(1)}deg)`;
      }
    };
    const off = y.onChange(render);
    const stop = drag(scroller, {
      axis: 'y',
      onStart: (s) => {
        if (scroller.scrollTop > 0 || s.dy < 0) return false;
        if ((s.event.target as HTMLElement).closest('input,textarea')) return false;
      },
      onMove: ({ dy }) => {
        const v = Math.max(0, rubberBand(dy, innerHeight, 0.45));
        y.set(v);
        if (v > TH !== armed) { armed = v > TH; if (armed) haptic(10); }
      },
      onEnd: ({ vy }) => {
        if (armed) {
          armed = false;
          const d = newDoc();
          void saveDoc(d);
          open(d);
        }
        y.to(0, { velocity: vy * 0.3, config: SPRINGS.jelly });
      },
    });
    return () => { stop(); off(); };
  }, [scrollRef, open]);

  return (
    <>
      <Glass ref={indicator} className="pull-indicator strong" refraction={{ depth: 30 }}><Plus /></Glass>
      <div className="large-title">
        <div>
          <h1>Library</h1>
          <div className="sub">{docs.length} {docs.length === 1 ? 'text' : 'texts'} · pull down for new</div>
        </div>
      </div>
      <Glass className="search" refraction={{ depth: 24 }}>
        <Search />
        <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search library" />
      </Glass>
      <div ref={list} className="list">
        {filtered.map((d) => (
          <SwipeRow key={d.id} doc={d} onOpen={() => open(d)} onPlay={() => play(d)} />
        ))}
        {!filtered.length && (
          <div className="empty">
            <div className="big">{q ? 'No matches' : 'Nothing here yet'}</div>
            {q ? 'Try a different search.' : 'Pull down, or write something on the Read tab.'}
          </div>
        )}
      </div>
      {!!docs.length && <p className="hint">Swipe right to play · swipe left to delete · long-press to pin</p>}
    </>
  );
}
