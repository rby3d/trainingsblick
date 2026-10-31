/* Intervalle aus den Runden (Laps) von Strava erkennen, für die Runden-Grafik im Studio.
   Kopie der Erkennung aus Formkurve (frontend/src/lib/intervalle.ts: analysieren, schwimmText; teilenDaten.ts: ausAktivitaet),
   ohne Schwelle/FTP (die kennt das Dashboard nicht); beide gleich halten. */

import type { Kat } from "../util";
import type { TeilRunde } from "./teilen";

/** [Bewegungszeit s, Distanz m, Ø Puls, Ø Watt] */
export type Lap = [number, number, number, number];
type Mass = "tempo" | "watt" | "puls";
type Runde = TeilRunde & { nr: number };

const median = (w: number[]) => { if (!w.length) return 0; const s = [...w].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const mmss = (sek: number): string => { const s = Math.round(sek); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
function wertText(mass: Mass, v: number): string {
  if (mass === "watt") return Math.round(v) + " W";
  if (mass === "puls") return Math.round(v) + " /min";
  return v > 0 ? mmss(1000 / v) + " /km" : "–";
}
const RUND = [100, 200, 400, 500, 800, 1000, 1200, 1500, 1600, 2000, 3000, 5000];

/** Runden mit Vergleichswert; Intervalle (mindestens drei klar härtere Runden, durch leichtere getrennt) als Text */
export function analysieren(k: Kat, lp: Lap[]): { runden: Runde[]; mass: Mass; text: string } | null {
  if (k !== "Run" && k !== "Ride") return null;
  const mitWatt = k === "Ride" && lp.filter((l) => l[3] > 0).length >= lp.length * 0.7;
  const mitTempo = k === "Run" && lp.filter((l) => l[1] > 20).length >= lp.length * 0.7;
  const mass: Mass = mitWatt ? "watt" : mitTempo ? "tempo" : "puls";
  const runden: Runde[] = lp.map(([t, m, hr, w], i) => ({ nr: i + 1, t, m, wert: mass === "watt" ? w : mass === "tempo" ? (t > 0 ? m / t : 0) : hr, hart: false }));

  const gueltig = runden.filter((r) => r.wert > 0);
  if (gueltig.length >= 5) {
    // zwei Gruppen (leicht/hart) per 2-Means auf dem Logarithmus der Werte; erste und letzte Runde (Ein-/Auslaufen) zählen nicht mit
    const kern = gueltig.length >= 7 ? gueltig.slice(1, -1) : gueltig;
    const lw = kern.map((r) => Math.log(r.wert));
    let lo = Math.min(...lw), hi = Math.max(...lw);
    for (let n = 0; n < 12; n++) {
      const a1 = lw.filter((v) => Math.abs(v - lo) <= Math.abs(v - hi)), a2 = lw.filter((v) => Math.abs(v - lo) > Math.abs(v - hi));
      if (!a1.length || !a2.length) break;
      lo = a1.reduce((x, y) => x + y, 0) / a1.length;
      hi = a2.reduce((x, y) => x + y, 0) / a2.length;
    }
    const faktor = mass === "watt" ? 1.18 : mass === "tempo" ? 1.08 : 1.07;
    const grenze = Math.exp((lo + hi) / 2);
    const deutlich = Math.exp(hi - lo) >= faktor;
    const naheHart = Math.exp(hi) * (mass === "watt" ? 0.88 : 0.92);
    for (const r of runden) r.hart = deutlich && r.wert >= grenze && r.wert >= naheHart && r.t <= 25 * 60 && r.t >= 8;
    const hart = runden.filter((r) => r.hart);
    let wechsel = 0;
    for (let i = 1; i < runden.length; i++) if (runden[i].hart !== runden[i - 1].hart) wechsel++;
    if (hart.length >= 3 && wechsel >= 4 && hart.length <= runden.length - 2) {
      const tMed = median(hart.map((r) => r.t)), mMed = median(hart.map((r) => r.m));
      const hartWert = hart.reduce((s, r) => s + r.wert * r.t, 0) / hart.reduce((s, r) => s + r.t, 0);
      // Länge: runde Distanz, wenn die harten Runden fast gleich lang sind (z. B. 1000 m), sonst Zeit
      const rund = mass === "tempo" ? RUND.find((x) => Math.abs(mMed - x) / x < 0.04 && hart.every((r) => Math.abs(r.m - x) / x < 0.08)) : undefined;
      const laenge = rund ? (rund >= 1000 ? (rund / 1000).toLocaleString("de-DE") + " km" : rund + " m") : mmss(tMed);
      const pausen: number[] = [];
      for (let i = 1; i < runden.length - 1; i++) if (!runden[i].hart && runden[i - 1].hart && runden[i + 1].hart) pausen.push(runden[i].t);
      const teile = [hart.length + " × " + laenge, "Ø " + wertText(mass, hartWert)];
      if (pausen.length) teile.push("Pause " + mmss(median(pausen)));
      return { runden, mass, text: teile.join(" · ") };
    }
    for (const r of runden) r.hart = false;
  }
  return { runden, mass, text: "" };
}

/** Schwimm-Intervalle zusammengefasst: „4 × 400 m · 2 × 100 m · Ø 1:45 /100 m“ */
export function schwimmText(lp: Lap[]): string {
  const l = lp.filter((x) => x[1] >= 25 && x[0] > 0);
  if (l.length < 2) return "";
  const gruppen = new Map<number, number[]>();
  for (const x of l) { const d = Math.round(x[1] / 25) * 25; gruppen.set(d, [...(gruppen.get(d) ?? []), x[0]]); }
  const teile = [...gruppen.entries()].sort((x, y) => y[1].length * y[0] - x[1].length * x[0]);
  const [hd, hz] = teile[0];
  const tempo = hz.length > 1 ? " · Ø " + mmss((hz.reduce((a, b) => a + b, 0) / (hd * hz.length)) * 100) + " /100 m" : "";
  return teile.slice(0, 3).map(([d, ts]) => (ts.length > 1 ? ts.length + " × " : "") + d + " m").join(" · ") + tempo;
}

/** Runden-Teil der Bilddaten (wie ausAktivitaet in Formkurve) */
export function rundenDaten(k: Kat, lp: Lap[]): { runden: TeilRunde[]; mass: "tempo" | "watt" | "puls"; intervallText: string } {
  if (lp.length < 2) return { runden: [], mass: "tempo", intervallText: "" };
  if (k === "Run" || k === "Ride") {
    const an = analysieren(k, lp)!;
    return { runden: an.runden.map((r) => ({ t: r.t, m: r.m, wert: r.wert, hart: r.hart })), mass: an.mass, intervallText: an.text };
  }
  if (k === "Swim") {
    return { runden: lp.filter((l) => l[0] > 0).map(([t, m]) => ({ t, m, wert: m > 0 ? m / t : 0, hart: false })), mass: "tempo", intervallText: schwimmText(lp) };
  }
  const mitPuls = lp.every((l) => l[2] > 0);
  return { runden: lp.filter((l) => l[0] > 0).map(([t, m, hr]) => ({ t, m, wert: mitPuls ? hr : m > 0 ? m / t : 0, hart: false })), mass: mitPuls ? "puls" : "tempo", intervallText: "" };
}
