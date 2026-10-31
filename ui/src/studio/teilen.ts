/* Teilen: Share-Grafiken aus Aktivitäten (Kopie aus Formkurve frontend/src/lib/teilen.ts, beide gleich halten).
   Der Zustand (Design) ist mit dem Strava Share Studio auf dem PC verträglich: gleiche Felder, gleiche Element-IDs,
   Positionen relativ zum Bild je Format. Formkurve kennt zusätzlich Runden, Gym-Werte, die Übungsliste und die Muskelkarte. */

/** Muskelgruppen der Gym-Karte (im Dashboard ungenutzt, die Logik bleibt gleich wie in Formkurve) */
export type Muskel = string;

export type TeilArt = "ausdauer" | "gym";
export type FormatKey = "story" | "portrait" | "square";
export type Hintergrund = "Transparent" | "Dunkel" | "Hell";
export type Schatten = "Auto" | "Ein" | "Aus";
export type Ausrichtung = "left" | "center" | "right";
/** Was in der großen Fläche steht (Ausdauer): GPS-Route, Runden/Intervalle oder automatisch */
export type Grafik = "auto" | "route" | "runden";

export const FORMATE: { key: FormatKey; name: string; kurz: string; w: number; h: number }[] = [
  { key: "story", name: "Story 9:16 (1080×1920)", kurz: "Story", w: 1080, h: 1920 },
  { key: "portrait", name: "Portrait 4:5 (1080×1350)", kurz: "4:5", w: 1080, h: 1350 },
  { key: "square", name: "Quadrat 1:1 (1080×1080)", kurz: "1:1", w: 1080, h: 1080 },
];
export const formatVon = (name: string) => FORMATE.find((f) => f.name === name) ?? FORMATE[0];
export const HINTERGRUENDE: Hintergrund[] = ["Transparent", "Dunkel", "Hell"];
export const SCHATTEN: Schatten[] = ["Auto", "Ein", "Aus"];
export const AKZENTE = ["#fc4c02", "#2d9cdb", "#27ae60", "#e91e8c", "#f5c518", "#ffffff"];

export interface El {
  visible: boolean; font: string | null; bold: boolean; size: number; color: string | null; color2: string | null;
  align: Ausrichtung; alpha: number; stroke: number;
  pos: Partial<Record<FormatKey, [number, number]>>; box: Partial<Record<FormatKey, [number, number]>>;
  line_w: number; glow: number; markers: boolean;
  /** Runden: Werte an den Balken */
  werte?: boolean;
}
export interface TeilState {
  version: number; format: string; bg: Hintergrund; shadow: Schatten; accent: string; brand: string;
  auto_stats: Partial<Record<FormatKey, boolean>>;
  elements: Record<string, El>;
  texts: { title: string; sport: string };
  grafik?: Grafik;
}

/** Werte je Art in der Reihenfolge des Rasters */
export const STATS: Record<TeilArt, string[]> = {
  ausdauer: ["dist", "time", "pace", "elev", "hr", "watts"],
  gym: ["time", "vol", "saetze", "wdh", "hr", "pr"],
};
const STAT_NAMEN: Record<string, string> = {
  dist: "Distanz", time: "Zeit", pace: "Pace / Tempo", elev: "Höhenmeter", hr: "Puls", watts: "Watt",
  vol: "Bewegt", saetze: "Sätze", wdh: "Wiederholungen", pr: "Rekorde",
};
export const elementeVon = (art: TeilArt): string[] =>
  ["sport", "title", "date", "route", ...(art === "ausdauer" ? ["intervall"] : ["liste"]), ...STATS[art].map((k) => "stat_" + k), "brand"];
export function elementName(eid: string, art: TeilArt): string {
  if (eid.startsWith("stat_")) return STAT_NAMEN[eid.slice(5)] ?? eid;
  return ({ sport: "Sportart", title: "Titel", date: "Datum", brand: "Branding", intervall: "Intervalle (Text)", liste: "Übungen",
    route: art === "gym" ? "Muskelkarte" : "Grafik" } as Record<string, string>)[eid] ?? eid;
}
/** Reihenfolge beim Antippen: oben liegende Elemente zuerst */
export const trefferReihe = (art: TeilArt) => ["brand", ...STATS[art].map((k) => "stat_" + k).reverse(), "intervall", "liste", "date", "title", "sport", "route"];

export function standardElement(eid: string): El {
  const el: El = { visible: true, font: null, bold: true, size: 1, color: null, color2: null, align: "left", alpha: 100, stroke: 0, pos: {}, box: {}, line_w: 1, glow: 1, markers: true };
  if (eid === "date") { el.bold = false; el.align = "right"; }
  else if (eid === "brand" || eid === "intervall") el.align = "center";
  else if (eid === "stat_hr" || eid === "stat_watts") el.visible = false;
  if (eid === "intervall" || eid === "liste") el.bold = false;
  if (eid === "route") el.werte = true;
  return el;
}

export function standardState(art: TeilArt): TeilState {
  const elements: Record<string, El> = {};
  for (const e of elementeVon(art)) elements[e] = standardElement(e);
  if (art === "gym") { elements.stat_hr.visible = false; elements.stat_wdh.visible = false; }
  return { version: 2, format: FORMATE[0].name, bg: "Transparent", shadow: "Auto", accent: "#fc4c02", brand: "", auto_stats: {}, elements, texts: { title: "", sport: "Auto" }, grafik: "auto" };
}

/** Gespeichertes (auch aus dem Studio auf dem PC) mit den Standardwerten zusammenführen */
export function normalisieren(d: unknown, art: TeilArt): TeilState {
  const s = standardState(art);
  if (!d || typeof d !== "object") return s;
  const q = d as Partial<TeilState> & Record<string, unknown>;
  if (typeof q.format === "string" && FORMATE.some((f) => f.name === q.format)) s.format = q.format;
  if (HINTERGRUENDE.includes(q.bg as Hintergrund)) s.bg = q.bg as Hintergrund;
  if (SCHATTEN.includes(q.shadow as Schatten)) s.shadow = q.shadow as Schatten;
  if (typeof q.accent === "string" && /^#[0-9a-f]{3,8}$/i.test(q.accent)) s.accent = q.accent;
  if (typeof q.brand === "string") s.brand = q.brand;
  if (q.grafik === "route" || q.grafik === "runden" || q.grafik === "auto") s.grafik = q.grafik;
  if (q.auto_stats && typeof q.auto_stats === "object") for (const [k, v] of Object.entries(q.auto_stats)) s.auto_stats[k as FormatKey] = !!v;
  if (q.texts && typeof q.texts === "object") {
    const t = q.texts as Record<string, unknown>;
    if (typeof t.title === "string") s.texts.title = t.title;
    if (typeof t.sport === "string") s.texts.sport = t.sport;
  }
  for (const [eid, src] of Object.entries((q.elements as Record<string, unknown>) ?? {})) {
    const dst = s.elements[eid];
    if (!dst || !src || typeof src !== "object") continue;
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (!(k in dst) && k !== "werte") continue;
      if (k === "pos" || k === "box") {
        if (v && typeof v === "object") {
          const out: Partial<Record<FormatKey, [number, number]>> = {};
          for (const [fk, val] of Object.entries(v as Record<string, unknown>)) {
            if (Array.isArray(val) && val.length >= 2 && val.every((x) => typeof x === "number")) out[fk as FormatKey] = [val[0], val[1]];
          }
          dst[k] = out;
        }
      } else (dst as unknown as Record<string, unknown>)[k] = v;
    }
  }
  return s;
}

export const klon = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
export const r5 = (v: number) => Math.round(v * 1e5) / 1e5;

/* ---------- Daten für das Bild ---------- */

export interface TeilRunde { t: number; m: number; wert: number; hart: boolean }
export interface TeilDaten {
  art: TeilArt;
  name: string;
  /** Strava-Sportart (sport_type), bei Gym "WeightTraining" */
  sport: string;
  kat: "Run" | "Ride" | "Swim" | "Other";
  /** "YYYY-MM-DDTHH:MM" */
  datum: string;
  distanz: number;
  zeit: number;
  hoehe?: number;
  puls?: number;
  watt?: number;
  /** [Breite, Länge] */
  punkte: [number, number][];
  runden: TeilRunde[];
  /** Art des Rundenwerts: Geschwindigkeit (m/s), Watt oder Puls */
  mass: "tempo" | "watt" | "puls";
  /** Zusammenfassung der Intervalle, z. B. "6 × 1 km · Ø 3:58 /km" */
  intervallText: string;
  gym?: { volumen: number; saetze: number; wdh: number; rekorde: number; muskeln: Partial<Record<Muskel, number>>; uebungen: { name: string; text: string }[] };
}

const de = (s: string) => s.replace(".", ",");
export function fmtZeit(sek: number): string {
  const t = Math.round(sek), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
export const fmtMs = (sek: number) => { const t = Math.round(sek); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); };
const tausend = (n: number) => Math.round(n).toLocaleString("de-DE");

/** Kategorie, wie sie im Bild gilt (Auswahl im Studio vor der Aktivität) */
const SPORT_KAT: Record<string, TeilDaten["kat"]> = { Laufen: "Run", Radfahren: "Ride", Schwimmen: "Swim", Sonstiges: "Other" };
export const SPORT_WAHL = ["Auto", "Laufen", "Radfahren", "Schwimmen", "Sonstiges"];
export const katVon = (d: TeilDaten, s: TeilState): TeilDaten["kat"] => SPORT_KAT[s.texts.sport] ?? d.kat;

/** Wert, Einheit, Beschriftung je Statistik; null, wenn es den Wert nicht gibt */
export function statWert(k: string, d: TeilDaten, kat: TeilDaten["kat"]): [string, string, string] | null {
  const dist = d.distanz || 0, mv = d.zeit || 0, g = d.gym;
  switch (k) {
    case "dist": return dist > 0 ? (kat === "Swim" ? [String(Math.round(dist)), "m", "Distanz"] : [de((dist / 1000).toFixed(2)), "km", "Distanz"]) : null;
    case "time": return mv ? [fmtZeit(mv), "", d.art === "gym" ? "Dauer" : "Zeit"] : null;
    case "pace":
      if (!(dist > 0 && mv)) return null;
      if (kat === "Run") return [fmtMs(mv / (dist / 1000)), "/km", "Pace"];
      if (kat === "Swim") return [fmtMs(mv / (dist / 100)), "/100m", "Pace"];
      return [de(((dist / mv) * 3.6).toFixed(1)), "km/h", "Ø Tempo"];
    case "elev": return d.hoehe != null && d.hoehe > 0 && kat !== "Swim" ? [String(Math.round(d.hoehe)), "m", "Höhenmeter"] : null;
    case "hr": return d.puls ? [String(Math.round(d.puls)), "bpm", "Ø Puls"] : null;
    case "watts": return d.watt ? [String(Math.round(d.watt)), "W", "Ø Leistung"] : null;
    case "vol": return g && g.volumen > 0 ? [tausend(g.volumen), "kg", "Bewegt"] : null;
    case "saetze": return g && g.saetze ? [String(g.saetze), "", "Sätze"] : null;
    case "wdh": return g && g.wdh ? [String(g.wdh), "", "Wiederholungen"] : null;
    case "pr": return g && g.rekorde ? [String(g.rekorde), "", g.rekorde === 1 ? "Rekord" : "Rekorde"] : null;
  }
  return null;
}

export const SPORT_LABEL: Record<string, string> = {
  Run: "LAUFEN", TrailRun: "TRAILRUN", VirtualRun: "LAUFBAND", Walk: "GEHEN", Hike: "WANDERN", Ride: "RADFAHREN", VirtualRide: "INDOOR-RAD",
  MountainBikeRide: "MOUNTAINBIKE", GravelRide: "GRAVEL", EBikeRide: "E-BIKE", Swim: "SCHWIMMEN", WeightTraining: "KRAFT", Workout: "WORKOUT", Yoga: "YOGA",
};

/** Welche Grafik tatsächlich gezeichnet wird */
export function grafikVon(s: TeilState, d: TeilDaten): "route" | "runden" | "muskeln" | null {
  if (d.art === "gym") return d.gym && Object.keys(d.gym.muskeln).length ? "muskeln" : null;
  const route = d.punkte.length >= 2, runden = d.runden.length >= 2;
  const g = s.grafik ?? "auto";
  if (g === "route") return route ? "route" : runden ? "runden" : null;
  if (g === "runden") return runden ? "runden" : route ? "route" : null;
  // automatisch: Route, außer im Becken bzw. bei klaren Intervallen ohne Route
  if (route && !(d.kat === "Swim" && runden)) return "route";
  return runden ? "runden" : null;
}

/* ---------- Ziehen und Einrasten (wie im Studio) ---------- */

export type Box = [number, number, number, number];
export interface Info {
  boxes: Record<string, Box>; anchors: Record<string, [number, number]>; size: [number, number]; fkey: FormatKey;
  stat_keys: string[]; auto_stats: boolean; slots: Record<string, [number, number, number]>;
}
export const anchorDx = (align: Ausrichtung, cw: number) => ({ left: 0, center: cw * 0.45, right: cw * 0.9 }[align]);

/** Vom automatischen Raster zu frei verschiebbaren Werten wechseln */
export function friereStats(s: TeilState, info: Info | null, art: TeilArt) {
  if (!info || !(s.auto_stats[info.fkey] ?? true)) return;
  const [W, H] = info.size;
  for (const k of STATS[art]) {
    const eid = "stat_" + k;
    let ax: number, ay: number;
    const an = info.anchors[eid];
    if (an) [ax, ay] = an;
    else {
      const sl = info.slots[k];
      if (!sl) continue;
      ax = sl[0] + anchorDx(s.elements[eid].align, sl[2]); ay = sl[1];
    }
    s.elements[eid].pos[info.fkey] = [r5(ax / W), r5(ay / H)];
  }
  s.auto_stats[info.fkey] = false;
}
export function friereBox(s: TeilState, info: Info | null, eid = "route") {
  if (!info) return;
  const e = s.elements[eid], fk = info.fkey;
  if (e.pos[fk] && e.box[fk]) return;
  const b = info.boxes[eid];
  if (!b) return;
  const [W, H] = info.size;
  e.pos[fk] = [r5((b[0] + b[2]) / 2 / W), r5((b[1] + b[3]) / 2 / H)];
  e.box[fk] = [r5((b[2] - b[0]) / W), r5((b[3] - b[1]) / H)];
}
/** Text-Elemente frieren, damit eine Stat-Verschiebung sie nicht mitzieht (Liste, Intervalle liegen sonst relativ zur Grafik) */
export function friereAnker(s: TeilState, info: Info | null, eid: string) {
  if (!info) return;
  const an = info.anchors[eid];
  if (!an || s.elements[eid].pos[info.fkey]) return;
  s.elements[eid].pos[info.fkey] = [r5(an[0] / info.size[0]), r5(an[1] / info.size[1])];
}

/** Automatisch ausrichten: im aktuellen Format alle Positionen und Größen auf das automatische Layout zurück (Werte wieder im Raster) */
export function ausrichten(s: TeilState): void {
  const fk = formatVon(s.format).key;
  for (const e of Object.values(s.elements)) { delete e.pos[fk]; delete e.box[fk]; }
  delete s.auto_stats[fk];
}
/** Ist im aktuellen Format etwas von Hand verschoben? */
export function verschoben(s: TeilState): boolean {
  const fk = formatVon(s.format).key;
  return s.auto_stats[fk] === false || Object.values(s.elements).some((e) => e.pos[fk] || e.box[fk]);
}

export type Fuehrung = ["v" | "h", number];
export function rasten(box: Box, dx: number, dy: number, pw: number, ph: number, frei: boolean): [number, number, Fuehrung[]] {
  const guides: Fuehrung[] = [];
  if (frei) return [dx, dy, guides];
  const m = 0.08 * pw, thr = 7;
  const x0 = box[0] + dx, y0 = box[1] + dy, x1 = box[2] + dx, y1 = box[3] + dy;
  let bx: [number, number] | null = null;
  for (const c of [(x0 + x1) / 2, x0, x1]) for (const t of [pw / 2, m, pw - m]) { const d = t - c; if (Math.abs(d) < thr && (!bx || Math.abs(d) < Math.abs(bx[0]))) bx = [d, t]; }
  if (bx) { dx += bx[0]; guides.push(["v", bx[1]]); }
  let by: [number, number] | null = null;
  for (const c of [(y0 + y1) / 2, y0, y1]) for (const t of [ph / 2, m, ph - m]) { const d = t - c; if (Math.abs(d) < thr && (!by || Math.abs(d) < Math.abs(by[0]))) by = [d, t]; }
  if (by) { dy += by[0]; guides.push(["h", by[1]]); }
  return [dx, dy, guides];
}

/* ---------- Schriften ---------- */

// Im Dashboard ohne eingebettete Variable-Schriften: die installierten Namen (Formkurve: "… Variable")
export const STANDARD_SCHRIFT = "IBM Plex Sans";
export const SCHRIFTEN: { wert: string | null; label: string }[] = [
  { wert: null, label: "Standard" },
  { wert: "Bricolage Grotesque", label: "Bricolage Grotesque" },
  { wert: "IBM Plex Sans", label: "IBM Plex Sans" },
  { wert: "IBM Plex Mono", label: "IBM Plex Mono" },
  { wert: "Arial", label: "Arial" },
  { wert: "Helvetica", label: "Helvetica" },
  { wert: "Georgia", label: "Georgia" },
  { wert: "Impact", label: "Impact" },
  { wert: "Verdana", label: "Verdana" },
  { wert: "Segoe UI", label: "Segoe UI" },
  { wert: "Courier New", label: "Courier New" },
];
