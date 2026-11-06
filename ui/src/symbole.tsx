/* Kleine Symbole (Linien, 24er-Raster) für Sportarten, Kennzahlen, Körperdaten und die Navigation */
import type { CSSProperties } from "react";
import type { Kat } from "./util";

const PFADE: Record<string, JSX.Element> = {
  rad: <><circle cx="5.5" cy="16.5" r="3.5" /><circle cx="18.5" cy="16.5" r="3.5" /><path d="M5.5 16.5L9 9h6.5l3 7.5M9 9l3.5 7.5H9M14 6h2.5l-1 3" /></>,
  lauf: <><circle cx="14.5" cy="4.5" r="2" /><path d="M7 21l3.5-5.5 3 2.5v3M6 11.5l3.5-3.5 4 .5 2.5 3.5 3 .5M9.5 8l1 7.5" /></>,
  schwimmen: <><circle cx="16.5" cy="6" r="2" /><path d="M6 11.5l5-4 3.5 3.5M3 15c2 0 2-1.5 4.5-1.5S10 15 12 15s2-1.5 4.5-1.5S19 15 21 15M3 19.5c2 0 2-1.5 4.5-1.5s2.5 1.5 4.5 1.5 2-1.5 4.5-1.5 2.5 1.5 4.5 1.5" /></>,
  kraft: <path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11" />,
  uhr: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  strecke: <><path d="M5 18.5c4 0 4-6.5 7-6.5s3-6.5 7-6.5" /><circle cx="5" cy="18.5" r="1.8" /><circle cx="19" cy="5.5" r="1.8" /></>,
  berg: <path d="M3 20l6.5-11 4 6.5 2.5-3.5 5 8z" />,
  liste: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  flamme: <path d="M12 3c1 4 5.5 5 5.5 10.5a5.5 5.5 0 0 1-11 0c0-3 2-4.5 2-6.5 1 1.2 2 2 3 2 .5-2-.5-4 .5-6z" />,
  herz: <path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />,
  puls: <path d="M3 12h4l2-5 4 10 2-5h6" />,
  mond: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  batterie: <><rect x="3" y="7" width="16" height="10" rx="2.5" /><path d="M21 11v2M6.5 10v4M10 10v4" /></>,
  tacho: <><path d="M4 17a8 8 0 1 1 16 0" /><path d="M12 17l4-5" /></>,
  pokal: <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3.2 4M16 6h3a3 3 0 0 1-3.2 4M12 13v4M8.5 20h7" />,
  flagge: <path d="M5.5 21V4M5.5 4h11l-2.2 4 2.2 4h-11" />,
  sonne: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  wolke: <path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z" />,
  uhrband: <><rect x="6.5" y="6" width="11" height="12" rx="3" /><path d="M9 6V3h6v3M9 18v3h6v-3M12 10v2.2l1.5 1" /></>,
  kette: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  haken: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  kalender: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>,
  karte: <><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></>,
  start: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>,
  teilen: <><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></>,
  zahnrad: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  sync: <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M4 3v5h5M20 21v-5h-5" /></>,
  pfeil: <path d="M9 6l6 6-6 6" />,
  sterne: <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />,
  auge: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  augezu: <path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17.6 17.6 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" />,
  rueck: <path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />,
  vor: <path d="M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" />,
  kopieren: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
  download: <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />,
  zauber: <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5" />,
  play: <path d="M7 4v16l13-8z" />,
  stift: <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />,
  links: <path d="M15 6l-6 6 6 6" />,
  extern: <><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>,
};

/** Ein Symbol in Textfarbe */
export function Sym({ n, gross }: { n: string; gross?: boolean }) {
  return <svg className={`sym${gross ? " gross" : ""}`} viewBox="0 0 24 24" aria-hidden="true">{PFADE[n] ?? null}</svg>;
}

/** Symbol auf leicht getöntem Feld (Farbe über --c) */
export function SymFeld({ n, farbe, klein }: { n: string; farbe?: string; klein?: boolean }) {
  return <span className={`symfeld${klein ? " klein" : ""}`} style={farbe ? ({ "--c": farbe } as CSSProperties) : undefined}><Sym n={n} /></span>;
}

export const KAT_SYM: Record<Kat, string> = { Ride: "rad", Run: "lauf", Swim: "schwimmen", Other: "kraft" };
export const KAT_FARBE: Record<Kat, string> = { Ride: "var(--c-ride)", Run: "var(--c-run)", Swim: "var(--c-swim)", Other: "var(--c-other)" };

/** Sportart als Symbol in ihrer Farbe */
export function SportSym({ k, klein }: { k: Kat; klein?: boolean }) {
  return <SymFeld n={KAT_SYM[k]} farbe={KAT_FARBE[k]} klein={klein} />;
}
