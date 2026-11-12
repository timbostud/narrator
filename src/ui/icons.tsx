// SF-Symbols-style line icons (hand-drawn paths, 24×24, currentColor).
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...p });

export const Play = (p: P) => (<svg {...base(p)} fill="currentColor" stroke="none"><path d="M7.5 4.8c0-1.1 1.2-1.8 2.2-1.2l10 6.2c.9.6.9 1.9 0 2.4l-10 6.2c-1 .6-2.2-.1-2.2-1.2z" /></svg>);
export const Pause = (p: P) => (<svg {...base(p)} fill="currentColor" stroke="none"><rect x="5.5" y="4" width="4.6" height="16" rx="1.6" /><rect x="13.9" y="4" width="4.6" height="16" rx="1.6" /></svg>);
export const Forward = (p: P) => (<svg {...base(p)} fill="currentColor" stroke="none"><path d="M3.5 6.2c0-.9 1-1.4 1.7-.9l6.6 4.9c.6.5.6 1.4 0 1.9l-6.6 4.9c-.7.5-1.7 0-1.7-.9z" /><path d="M12 6.2c0-.9 1-1.4 1.7-.9l6.6 4.9c.6.5.6 1.4 0 1.9l-6.6 4.9c-.7.5-1.7 0-1.7-.9z" /></svg>);
export const Backward = (p: P) => (<svg {...base(p)} fill="currentColor" stroke="none"><path d="M20.5 6.2c0-.9-1-1.4-1.7-.9l-6.6 4.9c-.6.5-.6 1.4 0 1.9l6.6 4.9c.7.5 1.7 0 1.7-.9z" /><path d="M12 6.2c0-.9-1-1.4-1.7-.9l-6.6 4.9c-.6.5-.6 1.4 0 1.9l6.6 4.9c.7.5 1.7 0 1.7-.9z" /></svg>);
export const Plus = (p: P) => (<svg {...base(p)} strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>);
export const Trash = (p: P) => (<svg {...base(p)}><path d="M4 7h16M9.5 7V5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V7M6.5 7l.8 11.6c.1 1 .9 1.4 1.8 1.4h5.8c.9 0 1.7-.4 1.8-1.4L17.5 7M10 11v5.5M14 11v5.5" /></svg>);
export const Pin = (p: P) => (<svg {...base(p)} fill="currentColor" stroke="none"><path d="M15.6 3.3l5.1 5.1c.4.4.3 1.1-.2 1.3l-3 1.4-3 3 .4 3.3c.1.6-.6 1-1.1.6L4.9 9.1c-.4-.5 0-1.2.6-1.1l3.3.4 3-3 1.4-3c.2-.5.9-.6 1.3-.2zM3.3 20.7l4.4-4.4" /><path d="M3.3 20.7l4.4-4.4" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" /></svg>);
export const Book = (p: P) => (<svg {...base(p)}><path d="M12 6.5C10.3 5 7.8 4.3 4.5 4.5v14c3.3-.2 5.8.5 7.5 2 1.7-1.5 4.2-2.2 7.5-2v-14c-3.3-.2-5.8.5-7.5 2zM12 6.5v14" /></svg>);
export const Wave = (p: P) => (<svg {...base(p)} strokeWidth={2.1}><path d="M3.5 10.5v3M7.5 7v10M11.75 4v16M16 8v8M20.25 10.5v3" /></svg>);
export const Person = (p: P) => (<svg {...base(p)}><circle cx="10" cy="8" r="3.6" /><path d="M3.8 19.5c.7-3.4 3.2-5.3 6.2-5.3s5.5 1.9 6.2 5.3" /><path d="M17.5 7.2c.9.9.9 2.6 0 3.6M19.8 5.2c2 2 2 5.6 0 7.6" /></svg>);
export const Gear = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8l1.6 2.3 2.8-.6.7 2.7 2.6 1.2-.9 2.6 1.6 2.3-2.3 1.6.4 2.8-2.8.4-1.2 2.6-2.5-1.1-2.5 1.1-1.2-2.6-2.8-.4.4-2.8L3.5 13l1.6-2.3-.9-2.6 2.6-1.2.7-2.7 2.8.6z" /></svg>);
export const Close = (p: P) => (<svg {...base(p)} strokeWidth={2.3}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>);
export const ChevronDown = (p: P) => (<svg {...base(p)} strokeWidth={2.4}><path d="M5.5 9l6.5 6.5L18.5 9" /></svg>);
export const Download = (p: P) => (<svg {...base(p)}><path d="M12 4v11M7.2 10.5L12 15.3l4.8-4.8M5 19.5h14" /></svg>);
export const Check = (p: P) => (<svg {...base(p)} strokeWidth={2.6}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>);
export const Share = (p: P) => (<svg {...base(p)}><path d="M12 15V3.8M7.8 7.6L12 3.4l4.2 4.2M7 10.5H5.8c-.7 0-1.3.6-1.3 1.3v7.4c0 .7.6 1.3 1.3 1.3h12.4c.7 0 1.3-.6 1.3-1.3v-7.4c0-.7-.6-1.3-1.3-1.3H17" /></svg>);
export const Doc = (p: P) => (<svg {...base(p)}><path d="M14 3.5H7.2c-.9 0-1.7.8-1.7 1.7v13.6c0 .9.8 1.7 1.7 1.7h9.6c.9 0 1.7-.8 1.7-1.7V8L14 3.5z" /><path d="M14 3.5V8h4.5M9 12.5h6M9 16h4" /></svg>);
export const Search = (p: P) => (<svg {...base(p)} strokeWidth={2.2}><circle cx="10.8" cy="10.8" r="6.3" /><path d="M15.5 15.5l4.5 4.5" /></svg>);
export const Pencil = (p: P) => (<svg {...base(p)}><path d="M14.5 5.5l4 4M4 20l1-4.5L15.8 4.7c.8-.8 2-.8 2.8 0l.7.7c.8.8.8 2 0 2.8L8.5 19 4 20z" /></svg>);
export const Speaker = (p: P) => (<svg {...base(p)}><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" /><path d="M15.5 9c1.3 1.6 1.3 4.4 0 6M18.3 6.5c2.5 3 2.5 8 0 11" /></svg>);
export const Stop = (p: P) => (<svg {...base(p)} fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>);
export const Sparkle = (p: P) => (<svg {...base(p)} fill="currentColor" stroke="none"><path d="M12 2.5c.5 4.3 2.9 6.8 7.4 7.5-4.5.7-6.9 3.2-7.4 7.5-.5-4.3-2.9-6.8-7.4-7.5 4.5-.7 6.9-3.2 7.4-7.5zM19 15c.2 1.8 1.2 2.8 3 3-1.8.2-2.8 1.2-3 3-.2-1.8-1.2-2.8-3-3 1.8-.2 2.8-1.2 3-3z" /></svg>);
export const Bolt = (p: P) => (<svg {...base(p)} fill="currentColor" stroke="none"><path d="M13.2 2.8L5 13.4h6l-1.2 7.8 8.2-10.6h-6z" /></svg>);
