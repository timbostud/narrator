import { createStore } from './store';
import type { Gender } from '../tts/voices';
import type { Lang } from '../tts/text/common';

export interface Settings {
  gender: Gender;
  lang: Lang | 'auto';
  speed: number;
  pause: number;
  gpu: boolean;
  glass: 'liquid' | 'frosted' | 'tinted';
  theme: 'auto' | 'dark' | 'light';
}

const DEFAULTS: Settings = { gender: 'female', lang: 'auto', speed: 1, pause: 1, gpu: true, glass: 'liquid', theme: 'auto' };
const KEY = 'narrator.settings';

function read(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

export const settings = createStore<Settings>(read());
settings.subscribe(() => {
  try { localStorage.setItem(KEY, JSON.stringify(settings.get())); } catch { /* private mode */ }
});

export const setSetting = <K extends keyof Settings>(k: K, v: Settings[K]) => settings.set((s) => ({ ...s, [k]: v }));
