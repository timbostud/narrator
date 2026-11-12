import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/app.css';

const root = document.getElementById('root')!;

if (import.meta.env.DEV && location.search.includes('kbench')) {
  void import('./bench').then((m) => m.kokoroBench(root));
} else {
  createRoot(root).render(<App />);
}

if (import.meta.env.DEV || location.search.includes('debug')) {
  void Promise.all([import('./tts/player'), import('./tts/engine')]).then(([p, e]) =>
    Object.assign(window, { __narrator: p.narrator, __player: p.playerState, __engine: e }));
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    // First visit on a host without COOP/COEP headers: once the worker controls the page,
    // reload so it can serve the page cross-origin isolated (enables multi-threaded synthesis).
    if (!crossOriginIsolated && !sessionStorage.getItem('narrator.coi')) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        sessionStorage.setItem('narrator.coi', '1');
        location.reload();
      });
    }
  });
}
