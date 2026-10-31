/* Sammelbild und Video aus mehreren Einheiten: Einstellungen, Anordnung der Routen, Titel, Summen und Zeitplan der Animation.
   Reine Logik ohne Canvas (Zeichnen: bild.ts, Ton und Aufnahme: video.ts).
   Übernommen aus Formkurve (frontend/src/lib/sammel.ts); bei Änderungen beide pflegen. */

export type Box = [number, number, number, number];
export type Kat = "Ride" | "Run" | "Swim" | "Other";
export type Effekt = "zeichnen" | "einblenden" | "fliegen";
export type RoutenTon = "aus" | "blop" | "woosh" | "klick";
export type EndTon = "aus" | "bling" | "impact";
export type Musik = "aus" | "lofi" | "daytona";
export type FormatKey = "story" | "portrait" | "square";

export const FORMATE: { key: FormatKey; kurz: string; w: number; h: number }[] = [
  { key: "story", kurz: "Story", w: 1080, h: 1920 },
  { key: "portrait", kurz: "4:5", w: 1080, h: 1350 },
  { key: "square", kurz: "1:1", w: 1080, h: 1080 },
];
export const formatVon = (k: string) => FORMATE.find((f) => f.key === k) ?? FORMATE[0];

export interface VideoState {
  effekt: Effekt;
  /** Sekunden zwischen zwei Routen */
  abstand: number;
  ton: RoutenTon;
  ende: EndTon;
  musik: Musik;
  /** Gesamtlautstärke 0–1 */
  laut: number;
}

export interface SammelState {
  format: FormatKey;
  bg: "Dunkel" | "Hell" | "Transparent";
  /** Routen in der Farbe ihrer Sportart oder alle im Akzent */
  farbe: "sport" | "akzent";
  accent: string;
  /** Titel und Zeitraum oben zeigen */
  titelAn: boolean;
  /** leer: automatisch (KW, Monat, Jahr oder Zeitraum) */
  titel: string;
  beschriftung: boolean;
  /** Einheiten ohne Route (Becken, Rolle, Gym …) als Kachel mit Sport-Symbol zeigen; sonst zählen sie nur in den Summen */
  ohneRoute: boolean;
  summen: boolean;
  brand: string;
  /** Linienbreite (1 = normal) */
  linie: number;
  leuchten: boolean;
  video: VideoState;
}

/** Kleinster Abstand zwischen zwei Routen in s (für sehr viele Routen, z. B. ein ganzes Jahr) */
export const ABSTAND_MIN = 0.01;
/** Töne je Route höchstens so dicht, sonst wird es bei kurzen Abständen nur Rauschen */
const TON_ABSTAND = 0.12;

export const standardSammel = (): SammelState => ({
  format: "story", bg: "Dunkel", farbe: "sport", accent: "#fc4c02", titelAn: true, titel: "", beschriftung: true, ohneRoute: true, summen: true, brand: "", linie: 1, leuchten: true,
  video: { effekt: "zeichnen", abstand: 0.7, ton: "woosh", ende: "bling", musik: "aus", laut: 0.8 },
});

const eins = <T extends string>(x: unknown, erlaubt: readonly T[], std: T): T => (erlaubt.includes(x as T) ? (x as T) : std);
const zahl = (x: unknown, lo: number, hi: number, std: number): number => (typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : std);

/** Gespeicherten Stand lesen; Unbekanntes fällt auf den Standard zurück */
export function sammelNormalisieren(roh: unknown): SammelState {
  const s = standardSammel();
  if (!roh || typeof roh !== "object") return s;
  const r = roh as Omit<Partial<SammelState>, "video"> & { video?: Partial<VideoState> };
  const v: Partial<VideoState> = r.video ?? {};
  return {
    format: eins(r.format, ["story", "portrait", "square"] as const, s.format),
    bg: eins(r.bg, ["Dunkel", "Hell", "Transparent"] as const, s.bg),
    farbe: eins(r.farbe, ["sport", "akzent"] as const, s.farbe),
    accent: typeof r.accent === "string" && /^#[0-9a-f]{6}$/i.test(r.accent) ? r.accent : s.accent,
    titelAn: r.titelAn ?? s.titelAn,
    titel: typeof r.titel === "string" ? r.titel.slice(0, 60) : "",
    beschriftung: r.beschriftung ?? s.beschriftung,
    ohneRoute: r.ohneRoute ?? s.ohneRoute,
    summen: r.summen ?? s.summen,
    brand: typeof r.brand === "string" ? r.brand.slice(0, 60) : "",
    linie: zahl(r.linie, 0.4, 3, 1),
    leuchten: r.leuchten ?? s.leuchten,
    video: {
      effekt: eins(v.effekt, ["zeichnen", "einblenden", "fliegen"] as const, s.video.effekt),
      abstand: zahl(v.abstand, ABSTAND_MIN, 3, s.video.abstand),
      ton: eins(v.ton, ["aus", "blop", "woosh", "klick"] as const, s.video.ton),
      ende: eins(v.ende, ["aus", "bling", "impact"] as const, s.video.ende),
      musik: eins(v.musik, ["aus", "lofi", "daytona"] as const, s.video.musik),
      laut: zahl(v.laut, 0, 1, s.video.laut),
    },
  };
}

/** Eine Einheit im Sammelbild */
export interface SammelEinheit {
  id: string;
  /** "YYYY-MM-DDTHH:MM" */
  datum: string;
  kat: Kat;
  name: string;
  distanz: number;
  zeit: number;
  hoehe: number;
  /** [Breite, Länge] */
  punkte: [number, number][];
}

/* ---------- Datum (YYYY-MM-DD) ---------- */

export const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
export const WT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export const pad = (n: number) => String(n).padStart(2, "0");
export const parse = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)), 12);
export const iso = (d: Date) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export const addTage = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const wochentag = (s: string) => (parse(s).getDay() + 6) % 7;
export const montag = (s: string) => addTage(s, -wochentag(s));
export const kurz = (s: string) => { const d = parse(s); return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "."; };
export function kw(s: string): number {
  const d = parse(s);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4, 12);
  return 1 + Math.round(((d.getTime() - w1.getTime()) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

/** Zellen für n Routen in einem Bereich: so viele Spalten, dass die Zellen möglichst groß und quadratisch werden.
    Die letzte Reihe steht mittig. */
export function raster(n: number, box: Box, luecke: number): Box[] {
  if (n <= 0) return [];
  const [x0, y0, x1, y1] = box;
  const bw = x1 - x0, bh = y1 - y0;
  let best = { sp: 1, wert: -1 };
  for (let sp = 1; sp <= n; sp++) {
    const re = Math.ceil(n / sp);
    const w = (bw - luecke * (sp - 1)) / sp, h = (bh - luecke * (re - 1)) / re;
    // kleinere Kante zählt; leere Zellen kosten ein wenig (im Verhältnis, sonst landen viele Routen in einer Reihe)
    const wert = Math.min(w, h) * Math.pow(n / (sp * re), 0.3);
    if (wert > best.wert) best = { sp, wert };
  }
  const sp = best.sp, re = Math.ceil(n / sp);
  const w = (bw - luecke * (sp - 1)) / sp, h = (bh - luecke * (re - 1)) / re;
  // Zellen nicht unnötig hoch/breit: auf ein Seitenverhältnis bis 1:1,4 begrenzen und den Block mittig setzen
  const cw = Math.min(w, h * 1.4), ch = Math.min(h, w * 1.4);
  const hoehe = re * ch + (re - 1) * luecke;
  const oy = y0 + (bh - hoehe) / 2;
  const out: Box[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / sp), c = i % sp;
    const inReihe = r === re - 1 ? n - r * sp : sp;
    const breite = inReihe * cw + (inReihe - 1) * luecke;
    const ox = x0 + (bw - breite) / 2;
    const x = ox + c * (cw + luecke), y = oy + r * (ch + luecke);
    out.push([x, y, x + cw, y + ch]);
  }
  return out;
}

/** Titel aus den Daten: eine Kalenderwoche, ein Monat, ein Jahr oder der Zeitraum */
export function autoTitel(daten: string[]): string {
  if (!daten.length) return "";
  const tage = daten.map((d) => d.slice(0, 10)).sort();
  const a = tage[0], b = tage[tage.length - 1];
  if (montag(a) === montag(b)) return "KW " + kw(a);
  const da = parse(a), db = parse(b);
  if (da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth()) return MONATE[da.getMonth()] + " " + da.getFullYear();
  // über mehr als ein Quartal innerhalb eines Jahres: das Jahr
  if (da.getFullYear() === db.getFullYear() && db.getMonth() - da.getMonth() >= 3) return String(da.getFullYear());
  const k = (d: Date) => pad(d.getDate()) + "." + pad(d.getMonth() + 1) + ".";
  return k(da) + " – " + k(db) + (da.getFullYear() !== db.getFullYear() ? db.getFullYear() : "");
}

/** Kacheln im Bild: Einheiten mit Route, auf Wunsch auch die ohne (dann ist alles zu sehen, was in den Summen zählt) */
export const kachelnVon = (E: SammelEinheit[], s: Pick<SammelState, "ohneRoute">): SammelEinheit[] => (s.ohneRoute ? E : E.filter((e) => e.punkte.length >= 2));

export interface Summen { distanz: number; zeit: number; hoehe: number; anzahl: number }
export function summen(e: SammelEinheit[]): Summen {
  return e.reduce((s, x) => ({ distanz: s.distanz + x.distanz, zeit: s.zeit + x.zeit, hoehe: s.hoehe + (x.hoehe || 0), anzahl: s.anzahl + 1 }), { distanz: 0, zeit: 0, hoehe: 0, anzahl: 0 });
}

/* ---------- Zeitplan der Animation ---------- */

export type TonName = "klick" | "blop" | "woosh" | "riser" | "impact" | "bling";
export interface TonEreignis { t: number; ton: TonName; v: number }
export interface Zeitplan {
  /** Gesamtdauer in s */
  dauer: number;
  /** Titel blendet in diesem Abschnitt ein */
  titel: [number, number];
  /** je Route: erscheint von … bis (danach fertig) */
  routen: [number, number][];
  /** Summen zählen in diesem Abschnitt hoch */
  summen: [number, number];
  toene: TonEreignis[];
}

const VORLAUF = 0.9;      // Titel blendet ein
const NACHLAUF = 2.6;     // Summen und Stehenbleiben am Ende
/** Dauer, in der eine Route erscheint, je Effekt */
export const ERSCHEINEN: Record<Effekt, number> = { zeichnen: 1.3, einblenden: 0.55, fliegen: 0.6 };
/** Länge des Risers bis zum Einschlag */
const RISER = 1.27;

export function zeitplan(n: number, v: VideoState): Zeitplan {
  const dauerRoute = ERSCHEINEN[v.effekt];
  const routen: [number, number][] = Array.from({ length: n }, (_, i) => [VORLAUF + i * v.abstand, VORLAUF + i * v.abstand + dauerRoute]);
  const letzte = routen.length ? routen[routen.length - 1][1] : VORLAUF;
  const summenAb = letzte + 0.25;
  const toene: TonEreignis[] = [];
  if (v.ton !== "aus") {
    let zuletzt = -Infinity;
    for (const [t] of routen) if (t - zuletzt >= TON_ABSTAND - 1e-9) { toene.push({ t, ton: v.ton, v: 1 }); zuletzt = t; }
  }
  if (v.ende === "bling") toene.push({ t: summenAb + 0.7, ton: "bling", v: 1 });
  if (v.ende === "impact") { toene.push({ t: summenAb + 0.7, ton: "impact", v: 0.9 }); toene.push({ t: Math.max(0, summenAb + 0.7 - RISER), ton: "riser", v: 0.8 }); }
  return { dauer: summenAb + NACHLAUF, titel: [0.1, VORLAUF - 0.1], routen, summen: [summenAb, summenAb + 0.8], toene: toene.sort((a, b) => a.t - b.t) };
}

/** Fortschritt 0–1 eines Abschnitts zum Zeitpunkt t (Infinity = Standbild, alles fertig) */
export const anteil = (t: number, [a, b]: [number, number]): number => (t >= b ? 1 : t <= a ? 0 : (t - a) / (b - a));
/** Weiches Abbremsen am Ende */
export const sanft = (x: number): number => 1 - Math.pow(1 - x, 3);
/** Leichtes Überschwingen (für „Einblenden“) */
export const federnd = (x: number): number => { const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

/** Google-Polyline in [Breite, Länge] */
export function polylinePunkte(s: string | null | undefined): [number, number][] {
  const out: [number, number][] = [];
  if (!s) return out;
  let i = 0, lat = 0, lng = 0;
  while (i < s.length) {
    for (let w = 0; w < 2; w++) {
      let sh = 0, r = 0, b: number;
      do { b = s.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20 && i <= s.length);
      const d = r & 1 ? ~(r >> 1) : r >> 1;
      if (w === 0) lat += d; else lng += d;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}
