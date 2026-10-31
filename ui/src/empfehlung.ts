// Tagesempfehlung: Regelwerk aus Garmin-Erholung (HRV, Ruhepuls, Schlaf, Body Battery, Bereitschaft) und Strava-Belastung (Form, harte Tage).
import type { GDaten, GTag } from "./erholung";
import { Akt, belastung, fitness, fmtDauer, nf, tagNr } from "./util";

export type Stufe = "hart" | "normal" | "locker" | "pause" | "erledigt";
export type Status = "gut" | "mittel" | "schlecht";
export type Signal = { id: string; name: string; wert: string; vergleich: string; status: Status; punkte: number; gewicht: number };
export type Empf = {
  stufe: Stufe; titel: string; detail: string; score: number; signale: Signal[]; hinweise: string[];
  datenTag: number | null; veraltet: boolean; ohneGarmin: boolean;
};
export type EventInfo = { tage: number; name: string } | null;

const STUFEN: Stufe[] = ["pause", "locker", "normal", "hart"];
const klemme = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const tagVon = (iso: string) => tagNr(+iso.slice(0, 4), +iso.slice(5, 7), +iso.slice(8, 10));
const vorz = (v: number, dez = 0) => (Math.abs(v) < Math.pow(10, -dez) / 2 ? "±0" : `${v > 0 ? "+" : "−"}${nf(Math.abs(v), dez)}`);

function grundlage(werte: number[]): { n: number; mean: number; sd: number } {
  const n = werte.length;
  if (!n) return { n: 0, mean: NaN, sd: NaN };
  const mean = werte.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(werte.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n);
  return { n, mean, sd };
}

/** Obergrenze der Stufe: der strengste Deckel gewinnt. */
function deckel(aktuell: Stufe, max: Stufe): Stufe {
  return STUFEN.indexOf(aktuell) > STUFEN.indexOf(max) ? max : aktuell;
}

export function tagesempfehlung(g: GDaten | null, akts: Akt[], heute: number, ruhe: number, maxp: number, ev: EventInfo): Empf | null {
  if (!akts.length && !(g && g.tage.length)) return null;
  const tage = new Map<number, GTag>();
  if (g) for (const [iso, t] of g.tage) tage.set(tagVon(iso), t);

  // juengster Tag mit Koerperdaten (heute, sonst bis zu zwei Tage zurueck)
  let ref: number | null = null;
  for (let d = heute; d >= heute - 2; d--) {
    const t = tage.get(d);
    if (t && (t.hrv || t.rhr || t.sl || t.tr || t.bbw)) { ref = d; break; }
  }
  const t0 = ref !== null ? tage.get(ref)! : null;
  const basis = (f: (t: GTag) => number | undefined) => {
    const w: number[] = [];
    if (ref === null) return grundlage(w);
    for (let d = ref - 28; d < ref; d++) { const v = tage.get(d) && f(tage.get(d)!); if (v && isFinite(v) && v > 0) w.push(v); }
    return grundlage(w);
  };

  const signale: Signal[] = [];
  const hinweise: string[] = [];
  const add = (s: Signal) => signale.push(s);

  if (t0) {
    // HRV
    if (t0.hrv) {
      const b = basis((t) => t.hrv);
      if (b.n >= 8) {
        const sd = Math.max(b.sd, b.mean * 0.05), z = (t0.hrv - b.mean) / sd;
        let status: Status = z >= -0.5 ? "gut" : z >= -1.2 ? "mittel" : "schlecht";
        if (t0.hrvs === "POOR") status = "schlecht";
        else if (t0.hrvs === "LOW" && status === "gut") status = "mittel";
        add({ id: "hrv", name: "HRV", wert: `${nf(t0.hrv)} ms`, vergleich: `Ø 28 Tage ${nf(b.mean)} (${vorz(t0.hrv - b.mean)})`, status, punkte: klemme(0.65 + 0.3 * z), gewicht: 30 });
      } else if (t0.hrvs) {
        const m: Record<string, [Status, number]> = { BALANCED: ["gut", 0.8], UNBALANCED: ["mittel", 0.5], LOW: ["schlecht", 0.3], POOR: ["schlecht", 0.15] };
        const [status, p] = m[t0.hrvs] ?? ["mittel", 0.55];
        add({ id: "hrv", name: "HRV", wert: `${nf(t0.hrv)} ms`, vergleich: t0.hrvs.toLowerCase(), status, punkte: p, gewicht: 30 });
      }
    }
    // Ruhepuls
    if (t0.rhr) {
      const b = basis((t) => t.rhr);
      if (b.n >= 8) {
        const diff = t0.rhr - b.mean;
        add({ id: "rhr", name: "Ruhepuls", wert: `${nf(t0.rhr)} bpm`, vergleich: `Ø 28 Tage ${nf(b.mean)} (${vorz(diff)})`, status: diff <= 2 ? "gut" : diff <= 5 ? "mittel" : "schlecht", punkte: klemme(0.8 - 0.1 * diff), gewicht: 15 });
      }
    }
    // Schlaf
    if (t0.sl) {
      const h = t0.sl / 3600;
      const pH = klemme((h - 4.5) / 3.5), p = t0.slscore ? 0.5 * pH + 0.5 * klemme(t0.slscore / 100) : pH;
      const status: Status = h >= 7 && (!t0.slscore || t0.slscore >= 70) ? "gut" : h >= 6 && (!t0.slscore || t0.slscore >= 55) ? "mittel" : "schlecht";
      add({ id: "schlaf", name: "Schlaf", wert: `${fmtDauer(t0.sl)} h`, vergleich: t0.slscore ? `Score ${nf(t0.slscore)}` : "", status, punkte: p, gewicht: 20 });
    }
    // Body Battery
    const bb = t0.bbw ?? t0.bbh;
    if (bb) add({ id: "bb", name: t0.bbw ? "Body Battery · Aufwachen" : "Body Battery · Höchstwert", wert: nf(bb), vergleich: "", status: bb >= 65 ? "gut" : bb >= 45 ? "mittel" : "schlecht", punkte: klemme(bb / 90), gewicht: 10 });
    // Trainingsbereitschaft
    if (t0.tr) add({ id: "tr", name: "Bereitschaft", wert: nf(t0.tr), vergleich: t0.trl ? String(t0.trl).toLowerCase() : "", status: t0.tr >= 70 ? "gut" : t0.tr >= 40 ? "mittel" : "schlecht", punkte: klemme(t0.tr / 85), gewicht: 10 });
  }

  // Form und Belastung aus Strava (Stand: gestern Abend)
  const fit = akts.length ? fitness(akts, heute - 1, ruhe, maxp) : null;
  let ctl = 0, atl = 0, tsb = 0;
  const last = (d: number) => (fit && d >= fit.start && d - fit.start < fit.last.length ? fit.last[d - fit.start] : 0);
  if (fit && fit.ctl.length > 14) {
    ctl = fit.ctl[fit.ctl.length - 1]; atl = fit.atl[fit.atl.length - 1]; tsb = ctl - atl;
    add({ id: "form", name: "Form", wert: `${vorz(tsb)}`, vergleich: `Fitness ${nf(ctl)} · Ermüdung ${nf(atl)}`, status: tsb >= -10 ? "gut" : tsb >= -25 ? "mittel" : "schlecht", punkte: klemme(0.8 + tsb * 0.02), gewicht: 15 });
  }
  // hart = deutlich ueber der typischen Trainingstag-Belastung der letzten 28 Tage
  const tageLast: number[] = [];
  for (let d = heute - 28; d < heute; d++) { const v = last(d); if (v > 0) tageLast.push(v); }
  tageLast.sort((a, b) => a - b);
  const typisch = tageLast.length ? tageLast[Math.floor(tageLast.length / 2)] : 0;
  const schwelle = Math.max(typisch * 1.4, 60);
  const hartGestern = last(heute - 1) >= schwelle, hartVorgestern = last(heute - 2) >= schwelle;

  if (!signale.length) return null;
  const summeG = signale.reduce((s, x) => s + x.gewicht, 0);
  const score = Math.round((signale.reduce((s, x) => s + x.gewicht * x.punkte, 0) / summeG) * 100);

  let stufe: Stufe = score >= 72 ? "hart" : score >= 58 ? "normal" : score >= 40 ? "locker" : "pause";
  const schlecht = signale.filter((s) => s.status === "schlecht");
  const koerper = signale.some((s) => ["hrv", "schlaf", "tr", "rhr"].includes(s.id));
  const veraltet = ref !== null && ref < heute;
  const get = (id: string) => signale.find((s) => s.id === id);

  if (!koerper || signale.length < 3) { stufe = deckel(stufe, "normal"); hinweise.push(koerper ? "wenige Daten" : "ohne Garmin-Daten"); }
  if (schlecht.length >= 3 || (get("hrv")?.status === "schlecht" && get("rhr")?.status === "schlecht")) { stufe = deckel(stufe, "pause"); }
  else if (schlecht.length >= 2) { stufe = deckel(stufe, "locker"); }
  if (get("schlaf")?.status === "schlecht") { stufe = deckel(stufe, "normal"); hinweise.push("kurzer Schlaf"); }
  if (get("hrv")?.status === "schlecht") hinweise.push("HRV niedrig");
  if (get("rhr")?.status === "schlecht") hinweise.push("Ruhepuls erhöht");
  if (fit && tsb < -30) { stufe = deckel(stufe, "locker"); hinweise.push("sehr müde"); }
  if (hartGestern && hartVorgestern) { stufe = deckel(stufe, "normal"); hinweise.push("zwei harte Tage in Folge"); }
  else if (hartGestern) hinweise.push("gestern hart");
  if (veraltet && ref !== null) { stufe = deckel(stufe, "normal"); hinweise.push(`Garmin-Daten von ${String(new Date(ref * 864e5).getUTCDate()).padStart(2, "0")}.${String(new Date(ref * 864e5).getUTCMonth() + 1).padStart(2, "0")}.`); }
  if (ev && ev.tage >= 0) {
    if (ev.tage <= 2) { stufe = deckel(stufe, "locker"); hinweise.push(`${ev.name} in ${ev.tage} ${ev.tage === 1 ? "Tag" : "Tagen"}`); }
    else if (ev.tage <= 7) { stufe = deckel(stufe, "normal"); hinweise.push(`Taper: ${ev.name} in ${ev.tage} Tagen`); }
  }
  if (stufe === "hart" && (hartGestern || schlecht.length > 0 || signale.filter((s) => s.status === "mittel").length > 1)) stufe = "normal";

  // typische Einheit der letzten vier Wochen
  const lang = akts.filter((a) => a.tag >= heute - 28 && a.tag < heute && a.t >= 1200);
  const mittelMin = lang.length ? lang.reduce((s, a) => s + a.t / 60, 0) / lang.length : 60;
  const runde = (v: number) => Math.max(15, Math.round(v / 5) * 5);
  const puls = (f: number) => Math.round(ruhe + f * (maxp - ruhe));

  const titel: Record<Stufe, string> = { hart: "Hartes Training möglich", normal: "Normales Training", locker: "Locker trainieren", pause: "Pause oder Spaziergang", erledigt: "" };
  let detail: string;
  if (stufe === "hart") detail = `Intervalle oder Schwelle, bis ${runde(mittelMin * 1.1)} Min inkl. Aufwärmen · Puls bis ${puls(0.88)}`;
  else if (stufe === "normal") detail = `Grundlage bis Tempo, ${runde(mittelMin * 0.8)}–${runde(mittelMin * 1.1)} Min · Puls meist unter ${puls(0.75)}`;
  else if (stufe === "locker") detail = `Zone 1–2, ${runde(mittelMin * 0.4)}–${runde(mittelMin * 0.7)} Min · Puls unter ${puls(0.62)}`;
  else detail = "Ruhetag oder 20–30 Min Spaziergang, Mobilität";

  // heute schon trainiert?
  const heuteAkts = akts.filter((a) => a.tag === heute);
  const heuteZeit = heuteAkts.reduce((s, a) => s + a.t, 0);
  let tit = titel[stufe];
  if (heuteZeit >= 1200) {
    const bel = heuteAkts.reduce((s, a) => s + belastung(a, ruhe, maxp), 0);
    hinweise.unshift(`morgens: ${{ hart: "hart möglich", normal: "normal", locker: "locker", pause: "Pause", erledigt: "" }[stufe]}`);
    stufe = "erledigt";
    tit = "Heute schon trainiert";
    detail = `${fmtDauer(heuteZeit)} h · Belastung ${nf(bel)}${ctl > 0 ? ` (${nf((bel / Math.max(ctl, 20)) * 100)} % eines Durchschnittstags)` : ""}`;
  }
  return { stufe, titel: tit, detail, score, signale, hinweise: hinweise.slice(0, 4), datenTag: ref, veraltet, ohneGarmin: !koerper };
}
