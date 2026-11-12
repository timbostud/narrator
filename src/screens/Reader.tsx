import { memo, useEffect, useRef } from 'react';
import { useStore } from '../lib/store';
import { narrator, playerState } from '../tts/player';
import type { Plan } from '../tts/text/prepare';

/**
 * Read-along view: the text with the current sentence tinted and the current word lit by a
 * gradient pill. Tap any sentence to jump there.
 */
export const Reader = memo(function Reader({ plan }: { plan: Plan }) {
  const sentence = useStore(playerState, (s) => s.sentence);
  const chunk = useStore(playerState, (s) => s.chunk);
  const word = useStore(playerState, (s) => s.word);
  const status = useStore(playerState, (s) => s.status);
  const ref = useRef<HTMLDivElement>(null);

  // Keep the current sentence comfortably in view while playing.
  useEffect(() => {
    if (status !== 'playing' && status !== 'buffering') return;
    const el = ref.current?.querySelector('.s.now');
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.18 || r.bottom > innerHeight * 0.62) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [sentence, status]);

  const text = plan.text;
  const parts: React.ReactNode[] = [];
  let pos = 0;
  const activeWord = plan.chunks[chunk]?.words[word];
  const live = status === 'playing' || status === 'buffering' || status === 'paused';
  plan.sentences.forEach((s) => {
    if (s.start > pos) parts.push(text.slice(pos, s.start));
    const cls = s.index === sentence && live ? 'now' : s.index < sentence && live ? 'past' : '';
    let inner: React.ReactNode = text.slice(s.start, s.end);
    if (cls === 'now' && activeWord && activeWord.start >= s.start && activeWord.end <= s.end && status !== 'buffering') {
      inner = (
        <>
          {text.slice(s.start, activeWord.start)}
          <span className="w now">{text.slice(activeWord.start, activeWord.end)}</span>
          {text.slice(activeWord.end, s.end)}
        </>
      );
    }
    parts.push(
      <span key={s.index} className={`s ${cls}`} onClick={() => { narrator.seekSentence(s.index); if (status !== 'playing') void narrator.play(); }}>
        {inner}
      </span>,
    );
    pos = s.end;
  });
  if (pos < text.length) parts.push(text.slice(pos));
  return <div ref={ref} className="reader">{parts}</div>;
});

/** The current sentence, word by word, for the full-screen player. */
export function NowLine() {
  const plan = useStore(playerState, (s) => s.plan);
  const sentence = useStore(playerState, (s) => s.sentence);
  const chunk = useStore(playerState, (s) => s.chunk);
  const word = useStore(playerState, (s) => s.word);
  if (!plan || !plan.sentences[sentence]) return <div className="now-line" />;
  const s = plan.sentences[sentence];
  const words = plan.chunks.filter((c) => c.sentence === sentence).flatMap((c) => c.words.map((w, i) => ({ ...w, c: c.id, i })));
  const out: React.ReactNode[] = [];
  let pos = s.start;
  for (const w of words) {
    if (w.start > pos) out.push(plan.text.slice(pos, w.start));
    const state = w.c < chunk || (w.c === chunk && w.i < word) ? 'past' : w.c === chunk && w.i === word ? 'now' : 'future';
    out.push(<span key={`${w.c}-${w.i}`} className={`w ${state}`}>{plan.text.slice(w.start, w.end)}</span>);
    pos = w.end;
  }
  if (pos < s.end) out.push(plan.text.slice(pos, s.end));
  return <div className="now-line">{out}</div>;
}
