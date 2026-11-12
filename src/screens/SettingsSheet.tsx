import { useEffect, useState } from 'react';
import { Glass, Segmented, Sheet, Switch, toast } from '../ui/components';
import { Bolt, Trash } from '../ui/icons';
import { refractionSupported } from '../ui/glass';
import { useStore } from '../lib/store';
import { settings, setSetting } from '../lib/settings';
import { clearModelCache, engineInfo, setAcceleration } from '../tts/engine';

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore(settings);
  const info = useStore(engineInfo);
  const [usage, setUsage] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1e6).toFixed(0)} MB used on this device`)).catch(() => {});
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="sheet-scroll">
        <div className="large-title" style={{ marginTop: 4 }}><h1 style={{ fontSize: 28 }}>Settings</h1></div>

        <div className="section-h">Appearance</div>
        <Segmented value={s.theme} onChange={(v) => setSetting('theme', v)}
          options={[{ value: 'auto', label: 'Auto' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
        <div style={{ height: 10 }} />
        <Segmented value={s.glass} onChange={(v) => setSetting('glass', v)}
          options={[{ value: 'liquid', label: 'Liquid' }, { value: 'frosted', label: 'Frosted' }, { value: 'tinted', label: 'Tinted' }]} />
        <p className="hint" style={{ textAlign: 'left' }}>
          Liquid refracts what's behind the glass{refractionSupported ? '' : ' (needs a Chromium browser, so you get Frosted here)'}.
          Tinted is more opaque and easier to read.
        </p>

        <div className="section-h">Engine</div>
        <Glass className="group">
          <div className="item">
            <Bolt width={20} style={{ color: 'var(--warning)' }} />
            <div className="lbl">GPU acceleration<small>Uses WebGPU when your graphics chip handles it correctly</small></div>
            <Switch label="GPU acceleration" on={s.gpu} onChange={(v) => { setSetting('gpu', v); setAcceleration(v); }} />
          </div>
          <div className="item">
            <div className="lbl">Threads<small>{info.isolated ? `${info.threads} CPU threads for synthesis` : 'Multi-threading unavailable (no cross-origin isolation)'}</small></div>
          </div>
          <button type="button" className="item" style={{ width: '100%', textAlign: 'left', color: 'var(--danger)' }}
            onClick={async () => {
              if (!confirm('Remove all downloaded voices? They will download again when needed.')) return;
              await clearModelCache();
              toast('Voices removed', <Trash />);
              navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1e6).toFixed(0)} MB used on this device`));
            }}>
            <Trash width={20} />
            <div className="lbl">Remove downloaded voices<small>{usage}</small></div>
          </button>
        </Glass>

        <div className="section-h">About</div>
        <Glass className="group">
          <div className="item"><div className="lbl">English: Kokoro-82M<small>hexgrad · Apache-2.0</small></div></div>
          <div className="item"><div className="lbl">Deutsch: Piper (Thorsten, Kerstin)<small>Thorsten-Voice, Rhasspy · CC0</small></div></div>
          <div className="item"><div className="lbl">Text front-end, engine and Liquid Glass UI<small>Built for this app: number, date, money and abbreviation rules for EN and DE</small></div></div>
        </Glass>
        <p className="hint">Your texts never leave this device.</p>
      </div>
    </Sheet>
  );
}
