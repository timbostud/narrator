import { useEffect, useRef, useState } from 'react';
import { Glass, IconButton, Segmented, Sheet, Slider, toast } from '../ui/components';
import { Backward, ChevronDown, Forward, Pause, Play, Share } from '../ui/icons';
import { drag, haptic, rubberBand, Spring, SPRINGS, squeeze } from '../ui/physics';
import { column, DOCK_GAP, dockSpring, lerp, TABBAR_COMPACT, TABBAR_H } from '../ui/dock';
import { joinLiquid } from '../ui/liquid';
import { useStore } from '../lib/store';
import { settings, setSetting } from '../lib/settings';
import { narrator, playerState } from '../tts/player';
import { voiceFor } from '../tts/voices';
import { engineInfo } from '../tts/engine';
import { NowLine } from './Reader';
import { Orb } from './Orb';

function useCurrentVoice() {
  const lang = useStore(playerState, (s) => s.plan?.chunks[s.chunk]?.lang ?? s.plan?.langs[0] ?? 'en');
  const gender = useStore(settings, (s) => s.gender);
  return voiceFor(lang, gender);
}

/**
 * Floating glass capsule above the tab bar. Swipe it sideways to skip sentences (it stretches
 * toward your finger), swipe or tap it up to expand the full player.
 */
export function MiniPlayer({ onExpand }: { onExpand: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const ps = useStore(playerState);
  const voice = useCurrentVoice();
  const expandRef = useRef(onExpand);
  expandRef.current = onExpand;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const x = new Spring(0, SPRINGS.jelly);
    const y = new Spring(0, SPRINGS.jelly);
    const render = () => {
      const ax = Math.abs(x.value) >= Math.abs(y.value) ? 'x' : 'y';
      const d = ax === 'x' ? x.value : y.value;
      const amt = Math.min(0.12, Math.abs(d) / (ax === 'x' ? el.offsetWidth : 160) * 0.6);
      // Stretch away from the anchored side, so it reads as being pulled.
      el.style.transformOrigin = ax === 'x' ? (d > 0 ? '0% 50%' : '100% 50%') : d > 0 ? '50% 0%' : '50% 100%';
      el.style.transform = `translate(${x.value.toFixed(1)}px, ${y.value.toFixed(1)}px) ${squeeze(amt, ax)}`;
    };
    const a = x.onChange(render);
    const b = y.onChange(render);

    // Dock position: its own row above the tab bar, or beside the minimized tab bar.
    const layout = () => {
      const p = dockSpring.value;
      const col = column();
      const left = lerp(col.left, col.left + TABBAR_COMPACT + 12, p);
      el.style.left = `${left.toFixed(2)}px`;
      el.style.width = `${(col.left + col.width - left).toFixed(2)}px`;
      const rise = lerp(TABBAR_H + DOCK_GAP, (TABBAR_H - el.offsetHeight) / 2, p);
      el.style.bottom = `calc(var(--safe-bottom) + 14px + ${rise.toFixed(2)}px)`;
    };
    layout();
    const offDock = dockSpring.onChange(layout);
    addEventListener('resize', layout);
    const leave = joinLiquid(el);

    let fired = false;
    const stop = drag(el, {
      onStart: (s) => { if (s.target?.closest('button')) return false; fired = false; },
      onMove: ({ dx, dy }) => {
        if (Math.abs(dx) > Math.abs(dy)) { x.set(rubberBand(dx, 220, 0.7)); y.set(0); }
        // Pulling down is allowed far enough to touch the tab bar, where the two glass shapes
        // merge; let go and the neck stretches and snaps as it springs back.
        else { y.set(dy < 0 ? rubberBand(dy, 260, 0.7) : rubberBand(dy, 120, 0.6)); x.set(0); }
        if (!fired && Math.abs(dx) > 70) { fired = true; haptic(10); }
      },
      onEnd: ({ dx, dy, vx, vy }) => {
        if (Math.abs(dx) > 70 || Math.abs(vx) > 800) { if (dx > 0) narrator.prev(); else narrator.next(); }
        else if (dy < -40 || vy < -600) expandRef.current();
        x.to(0, { velocity: vx, config: SPRINGS.jelly });
        y.to(0, { velocity: vy, config: SPRINGS.jelly });
      },
      onTap: (_e, target) => { if (!target?.closest('button')) expandRef.current(); },
    });
    return () => { stop(); a(); b(); offDock(); leave(); removeEventListener('resize', layout); };
  }, [ps.plan]);

  if (!ps.plan) return null;
  const sentence = ps.plan.sentences[ps.sentence];
  const playing = ps.status === 'playing' || ps.status === 'buffering';
  return (
    <Glass ref={ref} className="mini strong" refraction={{ depth: 40, bezel: 26 }} role="region" aria-label="Now playing">
      <Orb voice={voice} live={playing} />
      <div className="info">
        <div className="t">{ps.title}</div>
        <div className="s">
          {ps.status === 'buffering'
            ? `${voice.name} is preparing${ps.preparing !== undefined ? ` · ${Math.round(ps.preparing * 100)}%` : '…'}`
            : sentence ? ps.plan.text.slice(sentence.start, sentence.end) : ''}
        </div>
      </div>
      <IconButton label={playing ? 'Pause' : 'Play'} onClick={() => narrator.toggle()} refraction={false}>{playing ? <Pause /> : <Play />}</IconButton>
      <IconButton label="Next sentence" onClick={() => narrator.next()} refraction={false}><Forward /></IconButton>
      <div className="bar"><div style={{ width: `${ps.progress * 100}%` }} /></div>
    </Glass>
  );
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function PlayerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ps = useStore(playerState);
  const s = useStore(settings);
  const info = useStore(engineInfo);
  const voice = useCurrentVoice();
  const [scrub, setScrub] = useState<number | null>(null);
  const [exporting, setExporting] = useState<number | null>(null);
  const playing = ps.status === 'playing' || ps.status === 'buffering';
  const words = ps.plan ? ps.plan.text.split(/\s+/).length : 0;
  const total = (words / (155 * s.speed)) * 60;
  const progress = scrub ?? ps.progress;

  const exportAudio = async () => {
    if (exporting !== null) return;
    setExporting(0);
    try {
      const blob = await narrator.exportWav((p) => setExporting(p));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(ps.title || 'narration').replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'narration'}.wav`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast('Audio exported', <Share />);
    } catch (e) {
      toast(`Export failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="sheet-scroll">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <IconButton label="Close player" onClick={onClose}><ChevronDown /></IconButton>
          <IconButton label={exporting !== null ? `Exporting ${Math.round(exporting * 100)}%` : 'Export as WAV'} onClick={() => void exportAudio()}>
            {exporting !== null ? <span style={{ fontSize: 12, fontWeight: 700 }}>{Math.round(exporting * 100)}%</span> : <Share />}
          </IconButton>
        </div>
        <div className="player-orb-wrap">
          <Orb voice={voice} live={playing} className="player-orb" />
        </div>
        <div className="player-title">{ps.title || 'Nothing playing'}</div>
        <div className="player-voice">
          {voice.name} · {voice.lang === 'de' ? 'Deutsch' : 'English'}
          {ps.status === 'buffering' ? ' · preparing…' : ''}
        </div>
        <NowLine />
        <Slider label="Position" value={progress} onChange={(v) => setScrub(v)} onCommit={(v) => { setScrub(null); narrator.seekProgress(v); }} />
        <div className="times"><span>{fmt(progress * total)}</span><span>-{fmt(Math.max(0, (1 - progress) * total))}</span></div>
        <div className="controls">
          <IconButton label="Previous sentence" size="lg" onClick={() => narrator.prev()}><Backward /></IconButton>
          <IconButton label={playing ? 'Pause' : 'Play'} size="xl" className="accent" refraction={{ depth: 44, bezel: 30 }}
            onClick={() => narrator.toggle()}>{playing ? <Pause /> : <Play />}</IconButton>
          <IconButton label="Next sentence" size="lg" onClick={() => narrator.next()}><Forward /></IconButton>
        </div>

        <div className="section-h">Voice</div>
        <Segmented value={s.gender} onChange={(g) => { setSetting('gender', g); narrator.configure({ gender: g }); }}
          options={[{ value: 'female', label: `${voiceFor('en', 'female').name} · ${voiceFor('de', 'female').name}` }, { value: 'male', label: `${voiceFor('en', 'male').name} · ${voiceFor('de', 'male').name}` }]} />

        <div className="section-h">Delivery</div>
        <div className="slider-row">
          <span className="lbl">Speed</span>
          <Slider label="Speed" min={0.6} max={1.8} step={0.05} value={s.speed}
            onChange={(v) => setSetting('speed', v)} onCommit={(v) => narrator.configure({ speed: v })} />
          <span className="val">{s.speed.toFixed(2)}×</span>
        </div>
        <div className="slider-row">
          <span className="lbl">Pauses</span>
          <Slider label="Pause length" min={0.3} max={2} step={0.1} value={s.pause}
            onChange={(v) => setSetting('pause', v)} onCommit={(v) => narrator.configure({ pause: v })} />
          <span className="val">{s.pause.toFixed(1)}×</span>
        </div>
        <p className="hint">
          {info.isolated ? `${info.threads} CPU threads` : 'Single-threaded'}
          {info.lastRtf ? ` · synthesizes at ${(1 / info.lastRtf).toFixed(1)}× real-time` : ''}
        </p>
      </div>
    </Sheet>
  );
}
