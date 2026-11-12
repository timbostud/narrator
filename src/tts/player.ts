// Streaming narration: synthesizes ahead of the playhead, schedules gap-free Web Audio playback,
// and tracks the current sentence/word for karaoke highlighting.
import { createStore } from '../lib/store';
import { cancel, measuredRtf, synthesize } from './engine';
import { encodeWav } from './dsp';
import { prepare, type Plan } from './text/prepare';
import type { Lang } from './text/common';
import { type Gender, voiceById, voiceFor } from './voices';

export type PlayStatus = 'idle' | 'buffering' | 'playing' | 'paused' | 'ended';

export interface PlayerState {
  status: PlayStatus;
  title: string;
  docId: string | null;
  plan: Plan | null;
  chunk: number;
  sentence: number;
  word: number;
  progress: number;
  /** Seconds of audio buffered ahead of the playhead. */
  ahead: number;
  previewing: string | null;
  /** 0–1 while pre-buffering on devices that synthesize slower than real time. */
  preparing?: number;
  error?: string;
}

export interface PlayerSettings {
  speed: number;
  pause: number;
  gender: Gender;
}

export const playerState = createStore<PlayerState>({
  status: 'idle', title: '', docId: null, plan: null, chunk: 0, sentence: 0, word: 0, progress: 0, ahead: 0, previewing: null,
});

interface Scheduled { chunk: number; start: number; dur: number; src: AudioBufferSourceNode }
interface BufferEntry { key: string; job: number; promise: Promise<AudioBuffer>; done: boolean }

const PREFETCH = 4;

class Narrator {
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private gen = 0;
  private buffers = new Map<number, BufferEntry>();
  private scheduled: Scheduled[] = [];
  private raf = 0;
  private cursor = 0;
  settings: PlayerSettings = { speed: 1, pause: 1, gender: 'female' };
  onSentenceDone?: (docId: string, sentence: number) => void;

  private audio(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'playback' });
      this.gain = ctx.createGain();
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.7;
      this.gain.connect(this.analyser).connect(ctx.destination);
      this.ctx = ctx;
    }
    return this.ctx;
  }

  private get plan() {
    return playerState.get().plan;
  }

  private voiceFor(i: number) {
    const lang: Lang = this.plan!.chunks[i].lang;
    return voiceFor(lang, this.settings.gender);
  }

  private key(i: number) {
    return `${i}|${this.voiceFor(i).id}|${this.settings.speed}`;
  }

  private request(i: number): BufferEntry {
    const k = this.key(i);
    const cur = this.buffers.get(i);
    if (cur && cur.key === k) return cur;
    if (cur && !cur.done) cancel([cur.job]);
    const chunk = this.plan!.chunks[i];
    const job = synthesize(this.voiceFor(i).id, chunk.spoken, this.settings.speed);
    const ctx = this.audio();
    const entry: BufferEntry = {
      key: k,
      job: job.id,
      done: false,
      promise: job.promise.then(({ samples, sampleRate }) => {
        const b = ctx.createBuffer(1, samples.length, sampleRate);
        b.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
        entry.done = true;
        return b;
      }),
    };
    entry.promise.catch(() => {});
    this.buffers.set(i, entry);
    return entry;
  }

  /** Slow devices keep the synthesizer busy further ahead. */
  private window(from: number) {
    const rtf = measuredRtf(this.voiceFor(from).id) ?? 0.5;
    return rtf > 0.7 ? 16 : PREFETCH;
  }

  private prefetch(from: number) {
    const plan = this.plan!;
    const win = this.window(from);
    for (let i = from; i < Math.min(plan.chunks.length, from + win); i++) this.request(i);
    // Drop far-away pending work so seeking stays snappy.
    const stale: number[] = [];
    this.buffers.forEach((b, i) => {
      if (!b.done && (i < from || i >= from + win)) { stale.push(b.job); this.buffers.delete(i); }
    });
    cancel(stale);
  }

  /**
   * If this device synthesizes slower than real time (RTF > 1), buffer just enough audio before
   * starting that playback never has to stop: B ≥ D·(rtf−1)/rtf for D seconds of remaining audio.
   */
  private async preRoll(gen: number, from: number) {
    const plan = this.plan!;
    const rtf = measuredRtf(this.voiceFor(from).id);
    if (!rtf || rtf <= 1.02) return;
    let remaining = 0;
    for (let j = from; j < plan.chunks.length; j++) remaining += plan.chunks[j].spoken.length / 15 / this.settings.speed + this.pauseAfter(j);
    const lead = Math.min(25, (remaining * (rtf - 1)) / rtf);
    if (lead < 1.5) return;
    let acc = 0;
    for (let j = from; j < plan.chunks.length && acc < lead; j++) {
      const b = await this.request(j).promise.catch(() => null);
      if (gen !== this.gen) return;
      if (b) acc += b.duration + this.pauseAfter(j);
      playerState.set((s) => ({ ...s, preparing: Math.min(1, acc / lead) }));
    }
    playerState.set((s) => ({ ...s, preparing: undefined }));
  }

  private pauseAfter(i: number) {
    return (this.plan!.chunks[i].pauseAfter * this.settings.pause) / 1000 / Math.max(0.6, this.settings.speed);
  }

  private stopSources() {
    for (const s of this.scheduled) {
      try { s.src.stop(); } catch { /* not started */ }
      s.src.disconnect();
    }
    this.scheduled = [];
  }

  private async waitUntil(gen: number, time: number) {
    while (gen === this.gen && this.ctx && this.ctx.currentTime < time) {
      await new Promise((r) => setTimeout(r, 40));
    }
  }

  private async run(gen: number, from: number) {
    const ctx = this.audio();
    const plan = this.plan!;
    this.prefetch(from);
    await this.preRoll(gen, from);
    if (gen !== this.gen) return;
    let t = ctx.currentTime + 0.06;
    for (let i = from; i < plan.chunks.length; i++) {
      if (gen !== this.gen) return;
      this.prefetch(i);
      const entry = this.request(i);
      if (!entry.done && ctx.currentTime >= t - 0.05) {
        // Playback caught up with synthesis: rebuffer once, properly, instead of stuttering
        // at every following sentence.
        playerState.set((s) => ({ ...s, status: 'buffering' }));
        if (i > from) {
          await this.preRoll(gen, i);
          if (gen !== this.gen) return;
          t = ctx.currentTime + 0.05;
        }
      }
      let buf: AudioBuffer;
      try {
        buf = await entry.promise;
      } catch (e) {
        if (gen !== this.gen) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'cancelled') { i--; continue; }
        playerState.set((s) => ({ ...s, status: 'paused', error: msg }));
        return;
      }
      if (gen !== this.gen) return;
      const start = Math.max(t, ctx.currentTime + 0.03);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.gain!);
      src.start(start);
      this.scheduled.push({ chunk: i, start, dur: buf.duration, src });
      if (this.scheduled.length > 6) this.scheduled.shift();
      if (playerState.get().status !== 'playing' && playerState.get().status !== 'paused') {
        playerState.set((s) => ({ ...s, status: 'playing', error: undefined }));
      }
      t = start + buf.duration + this.pauseAfter(i);
      await this.waitUntil(gen, start + buf.duration - 0.5);
    }
    await this.waitUntil(gen, t);
    if (gen === this.gen) {
      this.stopTicker();
      playerState.set((s) => ({ ...s, status: 'ended', progress: 1 }));
    }
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    const ctx = this.ctx;
    const plan = this.plan;
    if (!ctx || !plan) return;
    const now = ctx.currentTime;
    const cur = [...this.scheduled].reverse().find((s) => s.start <= now);
    const s = playerState.get();
    if (!cur || cur.chunk < 0) return;
    const chunk = plan.chunks[cur.chunk];
    const frac = Math.min(1, Math.max(0, (now - cur.start) / cur.dur));
    let word = 0;
    const total = chunk.words.reduce((a, w) => a + w.weight, 0);
    let acc = 0;
    for (let w = 0; w < chunk.words.length; w++) {
      acc += chunk.words[w].weight;
      if (acc / total >= frac) { word = w; break; }
      word = w;
    }
    const last = this.scheduled.at(-1)!;
    const ahead = Math.max(0, last.start + last.dur - now);
    const progress = (chunk.start + frac * (chunk.end - chunk.start)) / Math.max(1, plan.text.length);
    if (s.chunk !== cur.chunk || s.word !== word || Math.abs(s.progress - progress) > 0.002) {
      const sentenceChanged = s.sentence !== chunk.sentence;
      playerState.set({ ...s, chunk: cur.chunk, sentence: chunk.sentence, word, progress, ahead,
        status: s.status === 'buffering' && now < cur.start + cur.dur ? 'playing' : s.status });
      this.cursor = cur.chunk;
      if (sentenceChanged && s.docId) this.onSentenceDone?.(s.docId, chunk.sentence);
    }
  };

  private startTicker() {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  private stopTicker() {
    cancelAnimationFrame(this.raf);
  }

  /** Loads a document. Does not start playback. */
  open(text: string, opts: { title: string; docId: string | null; lang: Lang | 'auto'; startSentence?: number }) {
    this.stop();
    const plan = prepare(text, { lang: opts.lang });
    const sentence = Math.min(opts.startSentence ?? 0, Math.max(0, plan.sentences.length - 1));
    const chunk = plan.sentences[sentence]?.firstChunk ?? 0;
    this.buffers.clear();
    this.cursor = chunk;
    playerState.set((s) => ({
      ...s, status: 'idle', plan, title: opts.title, docId: opts.docId, chunk, sentence, word: 0,
      progress: plan.chunks[chunk] ? plan.chunks[chunk].start / Math.max(1, text.length) : 0, error: undefined,
    }));
    this.updateMediaSession();
    // Start synthesizing the first sentences right away so playback starts instantly.
    if (plan.chunks.length) this.prefetch(chunk);
  }

  async play() {
    const plan = this.plan;
    if (!plan || !plan.chunks.length) return;
    const ctx = this.audio();
    const s = playerState.get();
    if (s.status === 'paused' && this.scheduled.length) {
      await ctx.resume();
      playerState.set((p) => ({ ...p, status: 'playing' }));
      this.startTicker();
      return;
    }
    await ctx.resume();
    const from = s.status === 'ended' ? 0 : this.cursor;
    this.gen++;
    this.stopSources();
    playerState.set((p) => ({ ...p, status: 'buffering', previewing: null }));
    this.startTicker();
    void this.run(this.gen, from);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  }

  async pause() {
    if (!this.ctx) return;
    const s = playerState.get();
    if (s.status !== 'playing' && s.status !== 'buffering') return;
    await this.ctx.suspend();
    this.stopTicker();
    playerState.set((p) => ({ ...p, status: 'paused' }));
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }

  toggle() {
    const st = playerState.get().status;
    if (st === 'playing' || st === 'buffering') void this.pause();
    else void this.play();
  }

  stop() {
    this.gen++;
    this.stopSources();
    this.stopTicker();
    playerState.set((s) => ({ ...s, status: s.plan ? 'idle' : 'idle' }));
  }

  /** Jump to a chunk; keeps playing if we were playing. */
  async seekChunk(i: number) {
    const plan = this.plan;
    if (!plan) return;
    i = Math.max(0, Math.min(plan.chunks.length - 1, i));
    const st = playerState.get().status;
    const wasPlaying = st === 'playing' || st === 'buffering';
    this.gen++;
    this.stopSources();
    this.cursor = i;
    const c = plan.chunks[i];
    playerState.set((s) => ({ ...s, chunk: i, sentence: c.sentence, word: 0, progress: c.start / Math.max(1, plan.text.length),
      status: wasPlaying ? 'buffering' : st === 'ended' ? 'paused' : st }));
    this.prefetch(i);
    // When paused there are now no scheduled sources, so the next play() restarts from the cursor.
    if (wasPlaying) {
      await this.ctx?.resume();
      this.startTicker();
      void this.run(this.gen, i);
    }
  }

  seekSentence(n: number) {
    const plan = this.plan;
    if (!plan || !plan.sentences.length) return;
    const s = plan.sentences[Math.max(0, Math.min(plan.sentences.length - 1, n))];
    void this.seekChunk(s.firstChunk);
  }

  seekProgress(p: number) {
    const plan = this.plan;
    if (!plan) return;
    const pos = p * plan.text.length;
    let idx = 0;
    for (let i = 0; i < plan.sentences.length; i++) if (plan.sentences[i].start <= pos) idx = i;
    this.seekSentence(idx);
  }

  next() { this.seekSentence(playerState.get().sentence + 1); }
  prev() {
    const s = playerState.get();
    const plan = this.plan;
    // Like a music player: first press restarts the sentence, second goes back.
    const sent = plan?.sentences[s.sentence];
    if (sent && s.chunk !== sent.firstChunk) this.seekSentence(s.sentence);
    else this.seekSentence(s.sentence - 1);
  }

  /** Changing speed or voice invalidates buffered audio; restart at the current chunk. */
  configure(next: Partial<PlayerSettings>) {
    const before = { ...this.settings };
    this.settings = { ...this.settings, ...next };
    const audible = before.speed !== this.settings.speed || before.gender !== this.settings.gender;
    if (!audible || !this.plan) return;
    const st = playerState.get().status;
    if (st === 'playing' || st === 'buffering') void this.seekChunk(this.cursor);
    else if (this.plan.chunks.length) this.prefetch(this.cursor);
    this.updateMediaSession();
  }

  level(): number {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);
    let s = 0;
    for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; s += v * v; }
    return Math.min(1, Math.sqrt(s / data.length) * 4);
  }

  /** Plays a voice's sample sentence on its own, independent of the open document. */
  async preview(voiceId: string) {
    const v = voiceById(voiceId);
    await this.pause();
    const ctx = this.audio();
    await ctx.resume();
    const myGen = ++this.gen;
    this.stopSources();
    playerState.set((s) => ({ ...s, previewing: voiceId, status: s.plan ? 'paused' : 'idle' }));
    const plan = prepare(v.sample, { lang: v.lang });
    const jobs = plan.chunks.map((c) => synthesize(voiceId, c.spoken, this.settings.speed));
    let t = ctx.currentTime + 0.05;
    try {
      for (let i = 0; i < jobs.length; i++) {
        const { samples, sampleRate } = await jobs[i].promise;
        if (myGen !== this.gen) { cancel(jobs.map((j) => j.id)); return; }
        const b = ctx.createBuffer(1, samples.length, sampleRate);
        b.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
        const src = ctx.createBufferSource();
        src.buffer = b;
        src.connect(this.gain!);
        const start = Math.max(t, ctx.currentTime + 0.02);
        src.start(start);
        this.scheduled.push({ chunk: -1, start, dur: b.duration, src });
        t = start + b.duration + plan.chunks[i].pauseAfter / 1000;
      }
      await this.waitUntil(myGen, t);
    } catch (e) {
      console.warn('preview failed', e);
    }
    if (myGen === this.gen) {
      this.scheduled = [];
      playerState.set((s) => ({ ...s, previewing: null }));
    }
  }

  stopPreview() {
    if (!playerState.get().previewing) return;
    this.gen++;
    this.stopSources();
    playerState.set((s) => ({ ...s, previewing: null }));
  }

  /** Renders the whole document to a WAV file. */
  async exportWav(onProgress: (p: number) => void): Promise<Blob> {
    const plan = this.plan;
    if (!plan) throw new Error('Nothing to export');
    const rate = 24000;
    const parts: { buf: Float32Array; sr: number; pause: number }[] = [];
    for (let i = 0; i < plan.chunks.length; i++) {
      const c = plan.chunks[i];
      const { samples, sampleRate } = await synthesize(voiceFor(c.lang, this.settings.gender).id, c.spoken, this.settings.speed).promise;
      parts.push({ buf: samples, sr: sampleRate, pause: this.pauseAfter(i) });
      onProgress((i + 1) / plan.chunks.length);
    }
    const total = parts.reduce((a, p) => a + p.buf.length / p.sr + p.pause, 0);
    const off = new OfflineAudioContext(1, Math.ceil(total * rate) + rate, rate);
    let t = 0.1;
    for (const p of parts) {
      const b = off.createBuffer(1, p.buf.length, p.sr);
      b.copyToChannel(p.buf as Float32Array<ArrayBuffer>, 0);
      const src = off.createBufferSource();
      src.buffer = b;
      src.connect(off.destination);
      src.start(t);
      t += b.duration + p.pause;
    }
    const rendered = await off.startRendering();
    return encodeWav(rendered.getChannelData(0), rate);
  }

  private updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const s = playerState.get();
    const lang = s.plan?.langs[0] ?? 'en';
    const v = voiceFor(lang, this.settings.gender);
    navigator.mediaSession.metadata = new MediaMetadata({ title: s.title || 'Narrator', artist: `${v.name} · Narrator`, album: 'Narrator' });
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => void this.play());
    ms.setActionHandler('pause', () => void this.pause());
    ms.setActionHandler('nexttrack', () => this.next());
    ms.setActionHandler('previoustrack', () => this.prev());
    try {
      ms.setActionHandler('seekforward', () => this.next());
      ms.setActionHandler('seekbackward', () => this.prev());
    } catch { /* unsupported */ }
  }
}

export const narrator = new Narrator();
