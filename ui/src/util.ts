// Auswertung des Strava-Dashboards: reine Funktionen, keine Oberflaeche.
export type Ev = { name: string; datum: string; haupt: boolean; von: string };
export type Kat = "Ride" | "Run" | "Swim" | "Other";
export const KATS: Kat[] = ["Ride", "Run", "Swim", "Other"];
export const KAT_NAME: Record<Kat, string> = { Ride: "Rad", Run: "Laufen", Swim: "Schwimmen", Other: "Sonstiges" };
export const KAT_VAR: Record<Kat, string> = { Ride: "var(--c-ride)", Run: "var(--c-run)", Swim: "var(--c-swim)", Other: "var(--c-other)" };

export type Roh = { id: string; n: string; s: string; k: Kat; d: string; m: number; t: number; e: number; hr?: number; mhr?: number;
  w?: number; nw?: number; kud: number; tr: boolean; r: boolean };
export type Akt = Roh & { tag: number; std: number };
/** Krafttraining (wie in Formkurve: WeightTraining, Crossfit, HIIT, Workout); im Share Studio nicht dabei */
const KRAFT = ["WeightTraining", "Crossfit", "HighIntensityIntervalTraining", "Workout"];
export const istGym = (a: { s: string }) => KRAFT.includes(a.s);

export type Metrik = "t" | "m" | "e";
export const METRIK: Record<Metrik, { name: string; einheit: string; f: (v: number) => number; dez: number }> = {
  t: { name: "Zeit", einheit: "h", f: (v) => v / 3600, dez: 1 },
  m: { name: "Distanz", einheit: "km", f: (v) => v / 1000, dez: 0 },
  e: { name: "Höhenmeter", einheit: "m", f: (v) => v, dez: 0 },
};

export const nf = (v: number, d = 0) => v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
export function fmtDauer(s: number): string {
  let h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  if (m === 60) { h += 1; m = 0; }
  return `${h}:${String(m).padStart(2, "0")}`;
}
export function fmtMinSek(s: number): string {
  let m = Math.floor(s / 60), x = Math.round(s % 60);
  if (x === 60) { m += 1; x = 0; }
  return `${m}:${String(x).padStart(2, "0")}`;
}
export const fmtKm = (m: number) => nf(m / 1000, m < 100000 ? 1 : 0);
export function fmtMetrik(mk: Metrik, v: number): string {
  if (mk === "t") return `${fmtDauer(v)} h`;
  if (mk === "m") return `${fmtKm(v)} km`;
  return `${nf(v)} m`;
}

// ---- Tage als fortlaufende Nummer (UTC-Tage seit 1970), Wochen beginnen am Montag
export const tagNr = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 864e5);
export const tagDatum = (n: number) => new Date(n * 864e5);
export const heuteNr = () => { const j = new Date(); return tagNr(j.getFullYear(), j.getMonth() + 1, j.getDate()); };
export const wochentag = (n: number) => (n + 3) % 7;           // 0 = Montag
export const wochenStart = (n: number) => n - wochentag(n);
export function isoKw(n: number): number {
  const don = wochenStart(n) + 3, y = tagDatum(don).getUTCFullYear();
  return Math.floor((don - tagNr(y, 1, 1)) / 7) + 1;
}
const MON = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
export const WT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export const monatKurz = (i: number) => MON[i];
export function fmtTag(n: number, mitJahr = false): string {
  const d = tagDatum(n);
  const t = `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.`;
  return mitJahr ? t + String(d.getUTCFullYear()).slice(2) : t;
}

export function aufbereiten(roh: Roh[]): Akt[] {
  const out: Akt[] = [];
  for (const r of roh) {
    const y = +r.d.slice(0, 4), mo = +r.d.slice(5, 7), da = +r.d.slice(8, 10);
    if (!y || !mo || !da) continue;
    out.push({ ...r, tag: tagNr(y, mo, da), std: +r.d.slice(11, 13) || 0 });
  }
  return out.sort((a, b) => (a.d < b.d ? -1 : 1));
}

// ---- Zeitraeume
export type Zeitraum = "4w" | "12w" | "jahr" | "gesamt";
export const ZEITRAEUME: [Zeitraum, string][] = [["4w", "4 Wochen"], ["12w", "12 Wochen"], ["jahr", "Dieses Jahr"], ["gesamt", "Gesamt"]];
export type Bereich = { von: number; bis: number; vorVon?: number; vorBis?: number };
export function bereich(z: Zeitraum, heute: number, erste: number): Bereich {
  if (z === "4w" || z === "12w") {
    const l = z === "4w" ? 28 : 84;
    return { von: heute - l + 1, bis: heute, vorVon: heute - 2 * l + 1, vorBis: heute - l };
  }
  if (z === "jahr") {
    const d = tagDatum(heute), y = d.getUTCFullYear();
    const von = tagNr(y, 1, 1), vj = tagNr(y - 1, 1, 1);
    return { von, bis: heute, vorVon: vj, vorBis: vj + (heute - von) };
  }
  return { von: Math.min(erste, heute), bis: heute };
}

export type Summe = { m: number; t: number; e: number; n: number; hrT: number; hrS: number };
export function summe(a: Akt[], von: number, bis: number): Summe {
  const s: Summe = { m: 0, t: 0, e: 0, n: 0, hrT: 0, hrS: 0 };
  for (const x of a) {
    if (x.tag < von || x.tag > bis) continue;
    s.m += x.m; s.t += x.t; s.e += x.e; s.n += 1;
    if (x.hr) { s.hrT += x.t; s.hrS += x.hr * x.t; }
  }
  return s;
}

// ---- Wochen-/Monatsbehaelter
export type Behaelter = { von: number; bis: number; label: string; titel: string; w: Record<Kat, Record<Metrik, number>>; gesamt: Record<Metrik, number> };
const leer = (): Record<Kat, Record<Metrik, number>> => ({
  Ride: { t: 0, m: 0, e: 0 }, Run: { t: 0, m: 0, e: 0 }, Swim: { t: 0, m: 0, e: 0 }, Other: { t: 0, m: 0, e: 0 } });
export function behaelter(a: Akt[], von: number, bis: number, monateErzwingen = false): { liste: Behaelter[]; monate: boolean } {
  const monate = monateErzwingen || bis - von > 400;
  const liste: Behaelter[] = [];
  if (!monate) {
    for (let s = wochenStart(von); s <= bis; s += 7) {
      liste.push({ von: s, bis: s + 6, label: fmtTag(s), titel: `KW ${isoKw(s)} · ${fmtTag(s)}–${fmtTag(s + 6, true)}`, w: leer(), gesamt: { t: 0, m: 0, e: 0 } });
    }
  } else {
    const d0 = tagDatum(von);
    let y = d0.getUTCFullYear(), mo = d0.getUTCMonth();
    for (;;) {
      const s = tagNr(y, mo + 1, 1), e = tagNr(mo === 11 ? y + 1 : y, mo === 11 ? 1 : mo + 2, 1) - 1;
      if (s > bis) break;
      liste.push({ von: s, bis: e, label: mo === 0 ? `${MON[mo]} ${String(y).slice(2)}` : MON[mo], titel: `${MON[mo]} ${y}`, w: leer(), gesamt: { t: 0, m: 0, e: 0 } });
      if (mo === 11) { y++; mo = 0; } else mo++;
    }
  }
  if (!liste.length) return { liste, monate };
  const erste = liste[0].von;
  for (const x of a) {
    if (x.tag < Math.max(von, erste) || x.tag > bis) continue;
    let i: number;
    if (!monate) i = Math.floor((x.tag - erste) / 7);
    else { const d = tagDatum(x.tag); i = (d.getUTCFullYear() - tagDatum(erste).getUTCFullYear()) * 12 + d.getUTCMonth() - tagDatum(erste).getUTCMonth(); }
    const b = liste[i];
    if (!b) continue;
    for (const mk of ["t", "m", "e"] as Metrik[]) { b.w[x.k][mk] += x[mk]; b.gesamt[mk] += x[mk]; }
  }
  return { liste, monate };
}

// ---- Fitness / Ermuedung / Form (Banister-TRIMP, geschaetzt)
export type Fitness = { start: number; ctl: number[]; atl: number[]; last: number[] };
const STD_ANTEIL: Record<Kat, number> = { Ride: 0.55, Run: 0.7, Swim: 0.6, Other: 0.5 };
export function maxPulsAuto(alle: Akt[]): number {
  let m = 0;
  for (const x of alle) if (x.mhr && x.mhr > m && x.mhr < 225) m = x.mhr;
  return m >= 150 ? Math.round(m) : 190;
}
export function belastung(x: Akt, ruhe: number, maxp: number): number {
  const min = x.t / 60;
  const f = x.hr ? Math.min(1, Math.max(0.2, (x.hr - ruhe) / Math.max(30, maxp - ruhe))) : STD_ANTEIL[x.k];
  return min * f * 0.64 * Math.exp(1.92 * f);
}
export function fitness(a: Akt[], bis: number, ruhe: number, maxp: number): Fitness | null {
  if (!a.length) return null;
  const start = a[0].tag, n = bis - start + 1;
  if (n < 1) return null;
  const last = new Array<number>(n).fill(0);
  for (const x of a) if (x.tag <= bis) last[x.tag - start] += belastung(x, ruhe, maxp);
  const kc = 1 - Math.exp(-1 / 42), ka = 1 - Math.exp(-1 / 7);
  const ctl: number[] = [], atl: number[] = [];
  let c = 0, t = 0;
  for (let i = 0; i < n; i++) { c += (last[i] - c) * kc; t += (last[i] - t) * ka; ctl.push(c); atl.push(t); }
  return { start, ctl, atl, last };
}

// ---- Kalender-Heatmap
export function tagesZeit(a: Akt[]): Map<number, number> {
  const mp = new Map<number, number>();
  for (const x of a) mp.set(x.tag, (mp.get(x.tag) ?? 0) + x.t);
  return mp;
}

// ---- Jahresvergleich (kumulativ)
export type JahrReihe = { jahr: number; werte: number[]; ende: number };
export function jahresreihen(a: Akt[], mk: Metrik, heute: number): JahrReihe[] {
  const aktuell = tagDatum(heute).getUTCFullYear();
  const jahre = Array.from(new Set(a.map((x) => tagDatum(x.tag).getUTCFullYear()).concat([aktuell]))).sort((x, y) => x - y).slice(-4);
  return jahre.map((j) => {
    const s = tagNr(j, 1, 1), tage = tagNr(j + 1, 1, 1) - s;
    const tw = new Array<number>(tage).fill(0);
    for (const x of a) if (x.tag >= s && x.tag < s + tage) tw[x.tag - s] += x[mk];
    const ende = j === aktuell ? Math.min(tage - 1, heute - s) : tage - 1;
    const werte: number[] = [];
    let c = 0;
    for (let i = 0; i <= ende; i++) { c += tw[i]; werte.push(c); }
    return { jahr: j, werte, ende };
  });
}

// ---- Rekorde
export type Rekord = { label: string; wert: string; sub: string; id?: string };
export function rekorde(a: Akt[]): Rekord[] {
  const out: Rekord[] = [];
  const bester = (f: (x: Akt) => number, l: Akt[]) => l.reduce<Akt | null>((b, x) => (!b || f(x) > f(b) ? x : b), null);
  const sub = (x: Akt) => `${x.n} · ${fmtTag(x.tag, true)}`;
  for (const k of ["Ride", "Run", "Swim"] as Kat[]) {
    const b = bester((x) => x.m, a.filter((x) => x.k === k));
    if (b && b.m > 0) out.push({ label: `Längste Einheit · ${KAT_NAME[k]}`, wert: `${fmtKm(b.m)} km`, sub: sub(b), id: b.id });
  }
  const dauer = bester((x) => x.t, a);
  if (dauer) out.push({ label: "Längste Dauer", wert: `${fmtDauer(dauer.t)} h`, sub: sub(dauer), id: dauer.id });
  const hm = bester((x) => x.e, a);
  if (hm && hm.e > 0) out.push({ label: "Meiste Höhenmeter", wert: `${nf(hm.e)} m`, sub: sub(hm), id: hm.id });
  if (a.length) {
    const w = new Map<number, number>();
    for (const x of a) w.set(wochenStart(x.tag), (w.get(wochenStart(x.tag)) ?? 0) + x.t);
    let bw = 0, bt = 0;
    w.forEach((v, k) => { if (v > bt) { bt = v; bw = k; } });
    out.push({ label: "Stärkste Woche", wert: `${fmtDauer(bt)} h`, sub: `KW ${isoKw(bw)} · ${fmtTag(bw)}–${fmtTag(bw + 6, true)}` });
    const tage = Array.from(new Set(a.map((x) => x.tag))).sort((x, y) => x - y);
    let serie = 1, best = 1, bestEnde = tage[0];
    for (let i = 1; i < tage.length; i++) {
      serie = tage[i] === tage[i - 1] + 1 ? serie + 1 : 1;
      if (serie > best) { best = serie; bestEnde = tage[i]; }
    }
    out.push({ label: "Längste Serie", wert: `${best} ${best === 1 ? "Tag" : "Tage"}`, sub: `bis ${fmtTag(bestEnde, true)}` });
  }
  return out;
}

// ---- Anzeige je Sportart
export function tempo(x: { k: Kat; m: number; t: number }): string {
  if (x.m < 100 || x.t <= 0) return "–";
  if (x.k === "Run") return `${fmtMinSek(x.t / (x.m / 1000))} /km`;
  if (x.k === "Swim") return `${fmtMinSek(x.t / (x.m / 100))} /100 m`;
  return `${nf((x.m / x.t) * 3.6, 1)} km/h`;
}

// ---- Wochenansicht
export function tagesBehaelter(a: Akt[], start: number): Behaelter[] {
  const out: Behaelter[] = Array.from({ length: 7 }, (_, i) => ({ von: start + i, bis: start + i, label: `${WT[i]} ${tagDatum(start + i).getUTCDate()}.`,
    titel: `${WT[i]}, ${fmtTag(start + i, true)}`, w: leer(), gesamt: { t: 0, m: 0, e: 0 } }));
  for (const x of a) {
    if (x.tag < start || x.tag > start + 6) continue;
    const b = out[x.tag - start];
    for (const mk of ["t", "m", "e"] as Metrik[]) { b.w[x.k][mk] += x[mk]; b.gesamt[mk] += x[mk]; }
  }
  return out;
}
export const belastungSumme = (a: Akt[], von: number, bis: number, ruhe: number, maxp: number) =>
  a.reduce((s, x) => (x.tag >= von && x.tag <= bis ? s + belastung(x, ruhe, maxp) : s), 0);

// ---------------------------------------------------------------------------
// Zusatzdaten (Bestzeiten je Lauf, Wetter) und Auswertungen dafuer
// ---------------------------------------------------------------------------
export type Extras = { be: Record<string, Record<string, number>>; wetter: Record<string, number[]> };
export const KEIN_EXTRAS: Extras = { be: {}, wetter: {} };

export function fmtZeit(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.round(s % 60);
  const mm = x === 60 ? m + 1 : m, xx = x === 60 ? 0 : x;
  return h > 0 ? `${h}:${String(mm).padStart(2, "0")}:${String(xx).padStart(2, "0")}` : `${mm}:${String(xx).padStart(2, "0")}`;
}
export const median = (w: number[]) => {
  if (!w.length) return NaN;
  const s = [...w].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---- Bestzeiten
export const LAUF_DIST: [string, string, number][] = [
  ["400m", "400 m", 400], ["1k", "1 km", 1000], ["5k", "5 km", 5000], ["10k", "10 km", 10000], ["15k", "15 km", 15000], ["20k", "20 km", 20000],
  ["Half-Marathon", "Halbmarathon", 21097.5], ["30k", "30 km", 30000], ["Marathon", "Marathon", 42195],
];
export type Versuch = { tag: number; sek: number; id: string; n: string };
export type Best = { name: string; label: string; m: number; versuche: Versuch[]; best?: Versuch; jahr?: Versuch; anzahl: number };
export function laufBestzeiten(a: Akt[], ex: Extras, jahr: number): Best[] {
  const out: Best[] = [];
  for (const [name, label, m] of LAUF_DIST) {
    const v: Versuch[] = [];
    for (const x of a) {
      if (x.k !== "Run") continue;
      const e = ex.be[x.id];
      const s = e ? (e[name] ?? Object.keys(e).map((k) => (k.toLowerCase() === name.toLowerCase() ? e[k] : 0)).find((w) => w)) : 0;   // Strava schreibt "1K", "5K" ... gross
      if (s) v.push({ tag: x.tag, sek: s, id: x.id, n: x.n });
    }
    if (!v.length) continue;
    const bestVon = (l: Versuch[]) => l.reduce<Versuch | undefined>((b, e) => (!b || e.sek < b.sek ? e : b), undefined);
    out.push({ name, label, m, versuche: v, best: bestVon(v), jahr: bestVon(v.filter((e) => tagDatum(e.tag).getUTCFullYear() === jahr)), anzahl: v.length });
  }
  return out;
}
/** Laufende Bestzeit nach jedem Versuch (fuer die Verlaufslinie). */
export function laufendeBest(v: Versuch[]): { tag: number; wert: number }[] {
  let b = Infinity;
  const out: { tag: number; wert: number }[] = [];
  for (const e of [...v].sort((x, y) => x.tag - y.tag)) { if (e.sek < b) { b = e.sek; out.push({ tag: e.tag, wert: b }); } }
  return out;
}
export type Zeile = { label: string; wert: string; sub: string; id?: string };
export function radBestwerte(a: Akt[]): Zeile[] {
  const out: Zeile[] = [];
  const sub = (x: Akt) => `${x.n} · ${fmtTag(x.tag, true)}`;
  for (const km of [30, 60, 100, 150]) {
    const l = a.filter((x) => x.k === "Ride" && !x.tr && x.m >= km * 1000 && x.t > 0);
    const b = l.reduce<Akt | null>((p, x) => (!p || x.m / x.t > p.m / p.t ? x : p), null);
    if (b) out.push({ label: `Schnellstes Ø-Tempo · ab ${km} km`, wert: `${nf((b.m / b.t) * 3.6, 1)} km/h`, sub: sub(b), id: b.id });
  }
  for (const h of [1, 2, 4]) {
    const l = a.filter((x) => x.k === "Ride" && x.t >= h * 3600 && (x.nw || x.w));
    const b = l.reduce<Akt | null>((p, x) => (!p || (x.nw ?? x.w ?? 0) > (p.nw ?? p.w ?? 0) ? x : p), null);
    if (b) out.push({ label: `Beste Leistung · ab ${h} h`, wert: `${nf(b.nw ?? b.w ?? 0)} W`, sub: `${b.nw ? "normalisiert" : "Ø"} · ${sub(b)}`, id: b.id });
  }
  return out;
}
export function schwimmBestwerte(a: Akt[]): Zeile[] {
  const out: Zeile[] = [];
  for (const [m, l] of [[750, "ab 750 m"], [1500, "ab 1,5 km"], [1900, "ab 1,9 km (70.3)"], [3800, "ab 3,8 km (Ironman)"]] as [number, string][]) {
    const b = a.filter((x) => x.k === "Swim" && x.m >= m && x.t > 0).reduce<Akt | null>((p, x) => (!p || x.t / x.m < p.t / p.m ? x : p), null);
    if (b) out.push({ label: `Schnellstes Tempo · ${l}`, wert: `${fmtMinSek(b.t / (b.m / 100))} /100 m`, sub: `${nf(b.m / 1000, 2)} km · ${b.n} · ${fmtTag(b.tag, true)}`, id: b.id });
  }
  return out;
}

// ---- Entwicklung
export type Punkt = { tag: number; wert: number; id: string; n: string };
export type MetrikDef = { id: string; titel: string; sub: string; k: Kat; besserNiedrig: boolean; fmt: (v: number) => string; f: (a: Akt) => number | null };
const lw = (x: Akt) => x.nw ?? x.w ?? null;
export const ENTWICKLUNG: MetrikDef[] = [
  { id: "lpace", titel: "Lauf · Pace", sub: "Läufe ab 3 km", k: "Run", besserNiedrig: true, fmt: (v) => `${fmtMinSek(v)} /km`,
    f: (x) => (x.k === "Run" && !x.tr && x.m >= 3000 && x.t > 0 ? x.t / (x.m / 1000) : null) },
  { id: "lef", titel: "Lauf · Effizienz", sub: "Meter pro Minute je Herzschlag", k: "Run", besserNiedrig: false, fmt: (v) => nf(v, 2),
    f: (x) => (x.k === "Run" && x.hr && x.m >= 3000 && x.t >= 1200 ? x.m / (x.t / 60) / x.hr : null) },
  { id: "rleist", titel: "Rad · Leistung", sub: "Fahrten ab 45 min, normalisiert oder Ø", k: "Ride", besserNiedrig: false, fmt: (v) => `${nf(v)} W`,
    f: (x) => (x.k === "Ride" && x.t >= 2700 ? lw(x) : null) },
  { id: "ref", titel: "Rad · Effizienz", sub: "Watt je Herzschlag", k: "Ride", besserNiedrig: false, fmt: (v) => nf(v, 2),
    f: (x) => (x.k === "Ride" && x.hr && x.t >= 2700 && lw(x) ? (lw(x) as number) / x.hr : null) },
  { id: "rtempo", titel: "Rad · Tempo", sub: "Fahrten ab 30 km im Freien", k: "Ride", besserNiedrig: false, fmt: (v) => `${nf(v, 1)} km/h`,
    f: (x) => (x.k === "Ride" && !x.tr && x.m >= 30000 && x.t > 0 ? (x.m / x.t) * 3.6 : null) },
  { id: "space", titel: "Schwimmen · Pace", sub: "Einheiten ab 750 m", k: "Swim", besserNiedrig: true, fmt: (v) => `${fmtMinSek(v)} /100 m`,
    f: (x) => (x.k === "Swim" && x.m >= 750 && x.t > 0 ? x.t / (x.m / 100) : null) },
];
export function punkte(a: Akt[], f: (x: Akt) => number | null, von: number, bis: number): Punkt[] {
  const out: Punkt[] = [];
  for (const x of a) { if (x.tag < von || x.tag > bis) continue; const v = f(x); if (v !== null && isFinite(v) && v > 0) out.push({ tag: x.tag, wert: v, id: x.id, n: x.n }); }
  return out;
}
/** Gleitender Median (Fenster +-halb Tage), alle 3 Tage ausgewertet. */
export function trendlinie(p: Punkt[], halb = 28): { tag: number; wert: number }[] {
  if (p.length < 3) return [];
  const s = [...p].sort((a, b) => a.tag - b.tag);
  const out: { tag: number; wert: number }[] = [];
  for (let t = s[0].tag; t <= s[s.length - 1].tag; t += 3) {
    const w = s.filter((x) => Math.abs(x.tag - t) <= halb).map((x) => x.wert);
    if (w.length >= 3) out.push({ tag: t, wert: median(w) });
  }
  return out;
}
/** Median der letzten 8 Wochen gegen die 8 Wochen davor. */
export function veraenderung(p: Punkt[], heute: number): { jetzt: number; vor: number } | null {
  const a = p.filter((x) => x.tag > heute - 56).map((x) => x.wert), b = p.filter((x) => x.tag <= heute - 56 && x.tag > heute - 112).map((x) => x.wert);
  if (a.length < 2 || b.length < 2) return null;
  return { jetzt: median(a), vor: median(b) };
}

// ---- Tageszeit und Wetter
export function stundenBehaelter(a: Akt[]): Behaelter[] {
  const out: Behaelter[] = Array.from({ length: 24 }, (_, h) => ({ von: h, bis: h, label: String(h), titel: `${String(h).padStart(2, "0")}–${String((h + 1) % 24).padStart(2, "0")} Uhr`, w: leer(), gesamt: { t: 0, m: 0, e: 0 } }));
  for (const x of a) { const b = out[Math.min(23, x.std)]; for (const mk of ["t", "m", "e"] as Metrik[]) { b.w[x.k][mk] += x[mk]; b.gesamt[mk] += x[mk]; } }
  return out;
}
export const effizienzLauf = ENTWICKLUNG[1].f;
export const effizienzRad = ENTWICKLUNG[3].f;
export type Gruppe = { label: string; n: number; mittel: number; abw: number };
/** Gruppiert Einheiten (Schluessel -> Gruppe) und liefert je Gruppe die Abweichung der mittleren Effizienz vom Gesamtmittel in Prozent. */
export function gruppen(a: Akt[], f: (x: Akt) => number | null, labels: string[], key: (x: Akt) => number | null): { zeilen: Gruppe[]; gesamt: number; n: number } {
  const werte: number[][] = labels.map(() => []);
  const alle: number[] = [];
  for (const x of a) {
    const k = key(x), v = f(x);
    if (k === null || v === null || !isFinite(v)) continue;
    werte[k].push(v); alle.push(v);
  }
  const gesamt = alle.length ? alle.reduce((s, v) => s + v, 0) / alle.length : NaN;
  const zeilen = labels.map((label, i) => {
    const w = werte[i], m = w.length ? w.reduce((s, v) => s + v, 0) / w.length : NaN;
    return { label, n: w.length, mittel: m, abw: w.length ? ((m - gesamt) / gesamt) * 100 : NaN };
  });
  return { zeilen, gesamt, n: alle.length };
}
export const TAGESZEIT_LABELS = ["Früh · vor 8", "Vormittag · 8–12", "Mittag · 12–15", "Nachmittag · 15–18", "Abend · ab 18"];
export const tageszeitKey = (x: Akt) => (x.std < 8 ? 0 : x.std < 12 ? 1 : x.std < 15 ? 2 : x.std < 18 ? 3 : 4);
export const TEMP_LABELS = ["unter 0 °C", "0–5 °C", "5–10 °C", "10–15 °C", "15–20 °C", "20–25 °C", "ab 25 °C"];
export const tempKey = (t: number) => (t < 0 ? 0 : t < 5 ? 1 : t < 10 ? 2 : t < 15 ? 3 : t < 20 ? 4 : t < 25 ? 5 : 6);
export const REGEN_LABELS = ["Trocken", "Leichter Regen", "Regen"];
export const regenKey = (mm: number) => (mm < 0.1 ? 0 : mm < 1 ? 1 : 2);
export const WIND_LABELS = ["unter 10 km/h", "10–20 km/h", "20–30 km/h", "ab 30 km/h"];
export const windKey = (v: number) => (v < 10 ? 0 : v < 20 ? 1 : v < 30 ? 2 : 3);

// ---- Routen (Polyline -> Web-Mercator, 0..1)
export type Strecke = { id: string; k: Kat; tag: number; n: string; xy: Float64Array; bb: [number, number, number, number] };
export function polylineXY(s: string): Float64Array {
  const out: number[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < s.length) {
    for (let w = 0; w < 2; w++) {
      let sh = 0, r = 0, b: number;
      do { b = s.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20 && i <= s.length);
      const d = r & 1 ? ~(r >> 1) : r >> 1;
      if (w === 0) lat += d; else lng += d;
    }
    const la = lat / 1e5, lo = lng / 1e5;
    out.push((lo + 180) / 360, 0.5 - Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360)) / (2 * Math.PI));
  }
  return Float64Array.from(out);
}
export function streckeAus(r: [string, string, Kat, string, string]): Strecke | null {
  const xy = polylineXY(r[1]);
  if (xy.length < 4) return null;
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (let i = 0; i < xy.length; i += 2) { a = Math.min(a, xy[i]); c = Math.max(c, xy[i]); b = Math.min(b, xy[i + 1]); d = Math.max(d, xy[i + 1]); }
  return { id: r[0], k: r[2], tag: tagNr(+r[3].slice(0, 4), +r[3].slice(5, 7), +r[3].slice(8, 10)), n: r[4], xy, bb: [a, b, c, d] };
}
