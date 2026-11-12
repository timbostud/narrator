import { useRef } from 'react';
import { Glass, toast } from '../ui/components';
import { Check, Download, Play, Stop } from '../ui/icons';
import { useSqueeze } from '../ui/hooks';
import { useStore } from '../lib/store';
import { settings, setSetting } from '../lib/settings';
import { loadVoice, voiceStates } from '../tts/engine';
import { narrator, playerState } from '../tts/player';
import { VOICES, type VoiceDef } from '../tts/voices';
import { Orb } from './Orb';

function VoiceCard({ v }: { v: VoiceDef }) {
  const ref = useRef<HTMLDivElement>(null);
  const st = useStore(voiceStates, (s) => s[v.id]);
  const gender = useStore(settings, (s) => s.gender);
  const previewing = useStore(playerState, (s) => s.previewing === v.id);
  const selected = gender === v.gender;
  useSqueeze(ref, {
    limit: 110,
    onTap: () => {
      setSetting('gender', v.gender);
      narrator.configure({ gender: v.gender });
    },
  });

  const preview = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewing) { narrator.stopPreview(); return; }
    void narrator.preview(v.id);
  };
  const download = (e: React.MouseEvent) => {
    e.stopPropagation();
    loadVoice(v.id).then(() => toast(`${v.name} is ready`, <Check />), (err: Error) => toast(`Download failed: ${err.message}`));
  };

  const ready = st.status === 'ready' || st.status === 'cached';
  const loading = st.status === 'loading';
  return (
    <Glass ref={ref} className={`voice-card ${selected ? 'selected' : ''}`} refraction={{ depth: 34, bezel: 26 }}
      role="button" aria-pressed={selected} aria-label={`${v.name}, ${v.gender} ${v.lang === 'de' ? 'German' : 'English'} voice`}>
      <div className="row2">
        <Orb voice={v} live={previewing} />
        <button type="button" className="icon-btn glass" style={{ width: 40, height: 40 }} onClick={preview}
          aria-label={previewing ? `Stop ${v.name} preview` : `Preview ${v.name}`}>
          {previewing ? <Stop width={18} /> : <Play width={18} />}
        </button>
      </div>
      <div>
        <div className="name">{v.name}</div>
        <div className="tech">{v.gender === 'female' ? 'Female' : 'Male'} · {v.lang === 'de' ? 'Deutsch' : 'English'}</div>
      </div>
      <div className="desc">{v.blurb}</div>
      {loading ? (
        <div className="mini-progress" aria-label={`Downloading ${Math.round(st.progress * 100)}%`}><div style={{ width: `${st.progress * 100}%` }} /></div>
      ) : null}
      <div className="row2">
        {ready ? (
          <span className="status-chip ready"><Check />{st.device === 'gpu' ? 'Ready · GPU' : 'Ready'}</span>
        ) : loading ? (
          <span className="status-chip">{st.progress >= 0.999 ? 'Preparing…' : `${Math.round(st.progress * 100)}%`}</span>
        ) : (
          <button type="button" className="status-chip" onClick={download}><Download />{v.sizeMB} MB</button>
        )}
        <span className="tech">{v.license}</span>
      </div>
      {st.status === 'error' && <div className="tech" style={{ color: 'var(--danger)' }}>{st.error}</div>}
    </Glass>
  );
}

export function VoicesScreen() {
  return (
    <>
      <div className="large-title">
        <div>
          <h1>Voices</h1>
          <div className="sub">Neural voices that run on your device</div>
        </div>
      </div>
      <div className="section-h">English</div>
      <div className="voice-grid">{VOICES.filter((v) => v.lang === 'en').map((v) => <VoiceCard key={v.id} v={v} />)}</div>
      <div className="section-h">Deutsch</div>
      <div className="voice-grid">{VOICES.filter((v) => v.lang === 'de').map((v) => <VoiceCard key={v.id} v={v} />)}</div>
      <p className="hint">
        Tap a voice to choose it, or pull a card to feel it squeeze. Ava and Leo share one English model. Each voice downloads once,
        then works offline.
      </p>
    </>
  );
}
