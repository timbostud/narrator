import { useCallback, useEffect, useRef, useState } from 'react';
import { TabBar, Toaster } from './ui/components';
import { Book, Person, Wave } from './ui/icons';
import { startLight } from './ui/glass';
import { Spring, SPRINGS } from './ui/physics';
import { useStore } from './lib/store';
import { settings } from './lib/settings';
import { library, loadLibrary, patchDoc, type Doc } from './lib/library';
import { refreshCacheStatus, setAcceleration, warmUp } from './tts/engine';
import { narrator, playerState } from './tts/player';
import { detectLang } from './tts/text/detect';
import { voiceFor } from './tts/voices';
import { ReadScreen } from './screens/ReadScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { VoicesScreen } from './screens/VoicesScreen';
import { MiniPlayer, PlayerSheet } from './screens/Player';
import { SettingsSheet } from './screens/SettingsSheet';

type Tab = 'read' | 'library' | 'voices';
const TABS: Tab[] = ['read', 'library', 'voices'];

export function App() {
  const s = useStore(settings);
  const ps = useStore(playerState);
  const [tab, setTab] = useState<Tab>('read');
  const [doc, setDoc] = useState<Doc | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const screens = useRef<Record<Tab, HTMLDivElement | null>>({ read: null, library: null, voices: null });
  const libScroll = useRef<HTMLDivElement | null>(null);

  // Boot
  useEffect(() => {
    void loadLibrary();
    void refreshCacheStatus();
    const stopLight = startLight();
    const t = setTimeout(warmUp, 600);
    narrator.onSentenceDone = (docId, sentence) => {
      const plan = playerState.get().plan;
      const progress = plan?.sentences[sentence] ? plan.sentences[sentence].start / Math.max(1, plan.text.length) : 0;
      void patchDoc(docId, { position: sentence, progress });
    };
    return () => { stopLight(); clearTimeout(t); };
  }, []);

  // Open the most recent text on first load
  const docs = useStore(library);
  useEffect(() => {
    if (!doc && docs.length) setDoc(docs[0]);
  }, [docs, doc]);

  // Settings → engine + document attributes. Speed/pause are applied when a slider is released
  // (re-synthesizing on every drag step would thrash the engine); this only seeds them at boot.
  useEffect(() => {
    narrator.configure({ speed: s.speed, pause: s.pause, gender: s.gender });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => setAcceleration(s.gpu), [s.gpu]);
  useEffect(() => {
    const root = document.documentElement;
    if (s.theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = s.theme;
    root.dataset.glass = s.glass;
  }, [s.theme, s.glass]);

  // Re-plan when the language mode changes while something is open
  const firstLang = useRef(true);
  useEffect(() => {
    if (firstLang.current) { firstLang.current = false; return; }
    const st = playerState.get();
    if (!st.plan) return;
    const wasPlaying = st.status === 'playing' || st.status === 'buffering';
    narrator.open(st.plan.text, { title: st.title, docId: st.docId, lang: s.lang, startSentence: st.sentence });
    if (wasPlaying) void narrator.play();
  }, [s.lang]);

  // Ambient tint follows the active voice
  const lang = ps.plan?.chunks[ps.chunk]?.lang ?? (doc ? detectLang(doc.text.slice(0, 500), 'en') : 'en');
  const voice = voiceFor(s.lang === 'auto' ? lang : s.lang, s.gender);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--hue-a', voice.hue[0]);
    root.style.setProperty('--hue-b', voice.hue[1]);
    root.style.setProperty('--accent', voice.hue[1]);
    root.style.setProperty('--accent-2', voice.hue[0]);
  }, [voice]);

  // Screen transitions: the incoming screen slides and settles on a spring; the outgoing one
  // recedes slightly, as in iOS.
  const prevTab = useRef<Tab>(tab);
  useEffect(() => {
    const from = TABS.indexOf(prevTab.current);
    const to = TABS.indexOf(tab);
    prevTab.current = tab;
    const dir = Math.sign(to - from);
    const sp = new Spring(1, SPRINGS.smooth);
    const off = sp.onChange((v) => {
      for (const t of TABS) {
        const el = screens.current[t];
        if (!el) continue;
        if (t === tab) {
          el.style.opacity = String(1 - v * 0.9);
          el.style.transform = v ? `translateX(${(dir * v * 40).toFixed(1)}px) scale(${(1 - v * 0.03).toFixed(4)})` : '';
          el.style.visibility = 'visible';
          el.style.pointerEvents = 'auto';
        } else {
          el.style.opacity = '0';
          el.style.visibility = 'hidden';
          el.style.pointerEvents = 'none';
        }
      }
    });
    sp.set(dir ? 1 : 0);
    sp.to(0);
    return () => { off(); };
  }, [tab]);

  const openDoc = useCallback((d: Doc) => {
    setDoc(d);
    setTab('read');
  }, []);

  const playDoc = useCallback((d: Doc) => {
    setDoc(d);
    const resume = d.position > 0 && d.progress < 0.98 ? d.position : 0;
    narrator.open(d.text, { title: d.title || 'Untitled', docId: d.id, lang: settings.get().lang, startSentence: resume });
    void narrator.play();
  }, []);

  return (
    <>
      <div className="ambient" aria-hidden>
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
        <div className="lines" />
        <div className="grain" />
      </div>
      <main className="app">
        <div ref={(el) => { screens.current.read = el; }} className="screen" aria-hidden={tab !== 'read'}>
          <ReadScreen doc={doc} setDoc={setDoc} openSettings={() => setSettingsOpen(true)} />
        </div>
        <div ref={(el) => { screens.current.library = el; libScroll.current = el; }} className="screen" aria-hidden={tab !== 'library'}>
          <LibraryScreen open={openDoc} play={playDoc} scrollRef={libScroll} />
        </div>
        <div ref={(el) => { screens.current.voices = el; }} className="screen" aria-hidden={tab !== 'voices'}>
          <VoicesScreen />
        </div>
      </main>
      <MiniPlayer onExpand={() => setPlayerOpen(true)} />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'read', label: 'Read', icon: <Wave /> },
          { value: 'library', label: 'Library', icon: <Book /> },
          { value: 'voices', label: 'Voices', icon: <Person /> },
        ]}
      />
      <PlayerSheet open={playerOpen} onClose={() => setPlayerOpen(false)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Toaster />
    </>
  );
}
