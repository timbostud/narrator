import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Glass, IconButton, Segmented, toast } from '../ui/components';
import { Doc as DocIcon, Gear, Pencil, Play, Plus, Sparkle } from '../ui/icons';
import { useStore } from '../lib/store';
import { settings, setSetting } from '../lib/settings';
import { autoTitle, newDoc, patchDoc, saveDoc, type Doc } from '../lib/library';
import { narrator, playerState } from '../tts/player';
import { detectLang } from '../tts/text/detect';
import { voiceFor } from '../tts/voices';
import { Reader } from './Reader';
import { joinLiquid } from '../ui/liquid';

export function ReadScreen({ doc, setDoc, openSettings, active }: { doc: Doc | null; setDoc: (d: Doc) => void; openSettings: () => void; active: boolean }) {
  const s = useStore(settings);
  const ps = useStore(playerState);
  const [text, setText] = useState(doc?.text ?? '');
  const [title, setTitle] = useState(doc?.title ?? '');
  const [editing, setEditing] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fabRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number>(0);

  // Grow the editor with its content so the whole screen scrolls as one page.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  });

  useEffect(() => {
    setText(doc?.text ?? '');
    setTitle(doc?.title ?? '');
  }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOpenInPlayer = !!doc && ps.docId === doc.id && !!ps.plan;

  // The Listen button is part of the dock's liquid group: it merges with whatever it touches.
  useEffect(() => (fabRef.current ? joinLiquid(fabRef.current) : undefined), [isOpenInPlayer, active]);
  useEffect(() => {
    if (isOpenInPlayer && ps.status !== 'idle') setEditing(false);
  }, [isOpenInPlayer, ps.status]);

  const persist = (nextText: string, nextTitle: string) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      if (!nextText.trim() && !nextTitle.trim()) return;
      if (doc) void patchDoc(doc.id, { text: nextText, title: nextTitle }, true);
      else {
        const d = newDoc(nextText, nextTitle);
        void saveDoc(d);
        setDoc(d);
      }
    }, 400);
  };

  const lang = useMemo(() => (s.lang === 'auto' ? detectLang(text || 'the', 'en') : s.lang), [text, s.lang]);
  const voice = voiceFor(lang, s.gender);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const minutes = Math.max(1, Math.round(words / (155 * s.speed)));

  const listen = async () => {
    if (!text.trim()) {
      toast('Type or paste some text first', <Pencil />);
      return;
    }
    if (isOpenInPlayer && ps.status !== 'idle' && ps.status !== 'ended') {
      narrator.toggle();
      return;
    }
    let d = doc;
    const t = title.trim() || autoTitle(text);
    if (!d) {
      d = newDoc(text, t);
      await saveDoc(d);
      setDoc(d);
    } else {
      clearTimeout(saveTimer.current);
      await patchDoc(d.id, { text, title: t }, true);
    }
    const resume = d.text === text && d.position > 0 && d.progress < 0.98 ? d.position : 0;
    narrator.open(text, { title: t, docId: d.id, lang: s.lang, startSentence: resume });
    setEditing(false);
    void narrator.play();
  };

  const onImport = async (file: File) => {
    const raw = await file.text();
    const t = file.name.replace(/\.(txt|md|markdown)$/i, '');
    const d = newDoc(raw, t);
    await saveDoc(d);
    setDoc(d);
    setEditing(true);
    toast(`Imported "${t}"`, <DocIcon />);
  };

  const startNew = () => {
    narrator.stop();
    const d = newDoc();
    setDoc(d);
    setText('');
    setTitle('');
    setEditing(true);
  };

  return (
    <>
      <div className="large-title">
        <div>
          <h1>Narrator</h1>
          <div className="sub">{voice.name} · {lang === 'de' ? 'Deutsch' : 'English'}{s.lang === 'auto' ? ' (auto)' : ''}</div>
        </div>
        <div className="title-actions">
          <IconButton label="New text" onClick={startNew}><Plus /></IconButton>
          <IconButton label="Import a text file" onClick={() => fileRef.current?.click()}><DocIcon /></IconButton>
          <IconButton label="Settings" onClick={openSettings}><Gear /></IconButton>
          <input ref={fileRef} type="file" accept=".txt,.md,.markdown,text/plain" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImport(f); e.target.value = ''; }} />
        </div>
      </div>

      <div className="doc-card">
        <input className="doc-title" placeholder="Title" value={title} aria-label="Title"
          onChange={(e) => { setTitle(e.target.value); persist(text, e.target.value); }} />
        <div className="doc-meta">
          <span>{words} words</span>
          <span>≈ {minutes} min</span>
          {isOpenInPlayer && !editing && (
            <button type="button" style={{ color: 'var(--accent)', fontWeight: 600 }} onClick={() => { void narrator.pause(); setEditing(true); }}>
              Edit text
            </button>
          )}
        </div>
        {isOpenInPlayer && !editing && ps.plan ? (
          <Reader plan={ps.plan} />
        ) : (
          <textarea ref={taRef} className="doc-text" value={text} spellCheck={false} aria-label="Text to read"
            placeholder={'Paste or type anything. An article, a chapter, your notes…\n\nFüge hier einen deutschen Text ein, und die deutsche Stimme liest ihn vor.'}
            onChange={(e) => { setText(e.target.value); persist(e.target.value, title); }} />
        )}
      </div>

      <div className="section-h">Voice</div>
      <Segmented
        value={s.gender}
        onChange={(g) => { setSetting('gender', g); narrator.configure({ gender: g }); }}
        options={[
          { value: 'female', label: `${voiceFor('en', 'female').name} · ${voiceFor('de', 'female').name}` },
          { value: 'male', label: `${voiceFor('en', 'male').name} · ${voiceFor('de', 'male').name}` },
        ]}
      />
      <div className="section-h">Language</div>
      <Segmented
        value={s.lang}
        onChange={(l) => setSetting('lang', l)}
        options={[
          { value: 'auto', label: <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Sparkle width={14} height={14} />Auto</span> },
          { value: 'en', label: 'English' },
          { value: 'de', label: 'Deutsch' },
        ]}
      />

      <p className="hint">Runs on your device · {voice.model}</p>

      {/* Floating action: sits above the tab bar (and above the mini player when another text is playing) */}
      {/* Portaled to <body>: the screen's transition transform would otherwise capture position:fixed */}
      {!isOpenInPlayer && active && createPortal(
        <div className={`fab-dock ${ps.plan ? 'raised' : ''}`}>
          <Glass ref={fabRef} as="button" type="button" className="fab" press={1.06} refraction={{ depth: 40, bezel: 26 }} onClick={() => void listen()}>
            <Play />
            <span>Listen</span>
          </Glass>
        </div>,
        document.body,
      )}
    </>
  );
}
