/* Sammelbild: mehrere Routen auf einem Bild (Raster), Titel und Summen. Mit Zeitpunkt t und Zeitplan auch als Einzelbild
   eines Videos: Routen erscheinen nacheinander (zeichnen, einblenden oder hereinfliegen), am Ende zählen die Summen hoch.
   Übernommen aus Formkurve (frontend/src/ui/sammelBild.ts); bei Änderungen beide pflegen. */

import { addTage, anteil, autoTitel, federnd, formatVon, kachelnVon, kurz, raster, sanft, summen, WT, wochentag } from "./logik";
import type { Box, Kat, SammelEinheit, SammelState, Zeitplan } from "./logik";

type Ctx = CanvasRenderingContext2D;
type RGB = [number, number, number];

const DISPLAY = `"Bricolage Grotesque", "Segoe UI Variable Display", "Segoe UI", sans-serif`;
const TEXT = `"IBM Plex Sans", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`;
const MONO = `"IBM Plex Mono", Consolas, monospace`;

/** Farben der Sportarten wie im Dashboard */
const KAT_FARBE: Record<Kat, string> = { Ride: "#3987e5", Run: "#eb6834", Swim: "#1baf7a", Other: "#8d8d8a" };

const rgba = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
function hexRgb(h: string): RGB {
  const n = parseInt(h.replace("#", "").slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [252, 76, 2];
}

function thema(s: SammelState): { bg: string | null; text: RGB; muted: RGB; schatten: boolean } {
  if (s.bg === "Dunkel") return { bg: "#101114", text: [255, 255, 255], muted: [154, 160, 166], schatten: false };
  if (s.bg === "Hell") return { bg: "#f4f4f2", text: [24, 24, 24], muted: [107, 107, 107], schatten: false };
  return { bg: null, text: [255, 255, 255], muted: [226, 226, 226], schatten: true };
}

/** Schriften laden, bevor gezeichnet wird (sonst misst das Canvas mit der Ersatzschrift) */
export async function sammelSchriften(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all([`700 40px ${DISPLAY}`, `400 40px ${TEXT}`, `600 40px ${TEXT}`, `500 40px ${MONO}`].map((f) => document.fonts.load(f).catch(() => []))).catch(() => undefined);
}

const km = (m: number) => (m >= 100000 ? Math.round(m / 1000).toLocaleString("de-DE") : (m / 1000).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const stunden = (s: number) => Math.floor(s / 3600) + ":" + String(Math.floor((s % 3600) / 60)).padStart(2, "0");

/** Untertitel: Zeitraum und Anzahl */
function untertitel(E: SammelEinheit[]): string {
  if (!E.length) return "";
  const tage = E.map((e) => e.datum.slice(0, 10)).sort();
  const zeitraum = tage[0] === tage[tage.length - 1] ? kurz(tage[0]) : kurz(tage[0]) + " – " + kurz(tage[tage.length - 1]);
  return zeitraum + " · " + E.length + (E.length === 1 ? " Einheit" : " Einheiten");
}

/** Beschriftung einer Kachel: Wochentag (bzw. Datum, wenn es über eine Woche geht) und Distanz, ohne Distanz die Dauer */
function beschriftung(e: SammelEinheit, langerZeitraum: boolean): string {
  const tag = e.datum.slice(0, 10);
  const wert = e.distanz >= 50 ? km(e.distanz) + " km" : e.zeit >= 3600 ? stunden(e.zeit) + " h" : Math.round(e.zeit / 60) + " min";
  return (langerZeitraum ? kurz(tag) : WT[wochentag(tag)]) + " · " + wert;
}

/** Sport-Symbol für Einheiten ohne Route (Becken, Rolle, Laufband, Gym …): Wellen, Rad, Doppelpfeil, Hantel */
function symbol(ctx: Ctx, kat: Kat, box: Box): void {
  const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, r = Math.min(box[2] - box[0], box[3] - box[1]) * 0.28;
  ctx.beginPath();
  if (kat === "Swim") {
    for (const dy of [-0.5, 0, 0.5]) for (let i = 0; i <= 30; i++) {
      const x = cx - r + (2 * r * i) / 30, y = cy + dy * r + Math.sin((i / 30) * Math.PI * 3) * r * 0.16;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
  } else if (kat === "Ride") {
    const rr = r * 0.42, y = cy + r * 0.2;
    ctx.moveTo(cx - r * 0.55 + rr, y); ctx.arc(cx - r * 0.55, y, rr, 0, Math.PI * 2);
    ctx.moveTo(cx + r * 0.55 + rr, y); ctx.arc(cx + r * 0.55, y, rr, 0, Math.PI * 2);
    ctx.moveTo(cx - r * 0.55, y); ctx.lineTo(cx - r * 0.1, y - r * 0.6); ctx.lineTo(cx + r * 0.35, y - r * 0.6); ctx.lineTo(cx + r * 0.55, y);
    ctx.moveTo(cx - r * 0.55, y); ctx.lineTo(cx, y); ctx.lineTo(cx + r * 0.35, y - r * 0.6);
  } else if (kat === "Run") {
    for (const dx of [-0.35, 0.3]) { ctx.moveTo(cx + (dx - 0.3) * r, cy - 0.55 * r); ctx.lineTo(cx + (dx + 0.25) * r, cy); ctx.lineTo(cx + (dx - 0.3) * r, cy + 0.55 * r); }
  } else {
    ctx.moveTo(cx - r * 0.75, cy); ctx.lineTo(cx + r * 0.75, cy);
    for (const s of [-1, 1]) { ctx.moveTo(cx + s * r * 0.6, cy - r * 0.42); ctx.lineTo(cx + s * r * 0.6, cy + r * 0.42); ctx.moveTo(cx + s * r * 0.85, cy - r * 0.25); ctx.lineTo(cx + s * r * 0.85, cy + r * 0.25); }
  }
  ctx.stroke();
}

/** Route in ihre Box einpassen (Länge mit cos(Breite) gestaucht wie auf der Karte) */
function projizieren(pts: [number, number][], box: Box, rand: number): [number, number][] {
  const [x0, y0, x1, y1] = box;
  const lat0 = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = pts.map((p) => [p[1] * k, -p[0]] as [number, number]);
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const [x, y] of xy) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
  const w = maxx - minx || 1e-9, h = maxy - miny || 1e-9;
  const bw = x1 - x0 - 2 * rand, bh = y1 - y0 - 2 * rand;
  const sc = Math.min(bw / w, bh / h);
  const ox = x0 + rand + (bw - w * sc) / 2, oy = y0 + rand + (bh - h * sc) / 2;
  return xy.map(([x, y]) => [ox + (x - minx) * sc, oy + (y - miny) * sc]);
}

/** Linie bis zum Anteil f ihrer Länge; gibt die Spitze zurück */
function teilLinie(ctx: Ctx, P: [number, number][], f: number): [number, number] {
  let gesamt = 0;
  const seg: number[] = [];
  for (let i = 1; i < P.length; i++) { const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); seg.push(l); gesamt += l; }
  let rest = gesamt * f;
  ctx.beginPath();
  ctx.moveTo(P[0][0], P[0][1]);
  let spitze = P[0];
  for (let i = 1; i < P.length; i++) {
    if (rest >= seg[i - 1]) { ctx.lineTo(P[i][0], P[i][1]); rest -= seg[i - 1]; spitze = P[i]; continue; }
    const q = seg[i - 1] ? rest / seg[i - 1] : 0;
    spitze = [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * q, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * q];
    ctx.lineTo(spitze[0], spitze[1]);
    break;
  }
  ctx.stroke();
  return spitze;
}

export interface SammelOpt { W: number; H: number; px?: number }

/** Zeichnet das Sammelbild zum Zeitpunkt t (Infinity = fertiges Standbild) */
export function zeichneSammel(ctx: Ctx, E: SammelEinheit[], s: SammelState, opt: SammelOpt, t = Infinity, plan?: Zeitplan): void {
  const { W, H } = opt;
  const px = opt.px ?? 1;
  const th = thema(s);
  ctx.setTransform(px, 0, 0, px, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (th.bg) { ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H); }
  const m = 0.07 * W;
  const kompakt = H / W < 1.1;
  const schattenAn = () => { if (th.schatten) { ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 0.008 * W * px; ctx.shadowOffsetY = 0.002 * W * px; } };
  const schattenAus = () => { ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; };

  // --- Titel ---
  const titelA = plan ? sanft(anteil(t, plan.titel)) : 1;
  const titelPx = (kompakt ? 0.072 : 0.088) * W, unterPx = 0.032 * W;
  if (s.titelAn) {
    let y = m + (1 - titelA) * 0.03 * W;
    ctx.globalAlpha = titelA;
    schattenAn();
    ctx.textBaseline = "top"; ctx.textAlign = "left";
    ctx.fillStyle = rgba(th.text);
    ctx.font = `700 ${titelPx}px ${DISPLAY}`;
    ctx.fillText(s.titel.trim() || autoTitel(E.map((e) => e.datum)) || "Training", m, y, W - 2 * m);
    y += titelPx * 1.12;
    ctx.fillStyle = rgba(th.muted);
    ctx.font = `400 ${unterPx}px ${TEXT}`;
    ctx.fillText(untertitel(E), m, y, W - 2 * m);
    schattenAus();
    ctx.globalAlpha = 1;
  }
  const rasterOben = s.titelAn ? m + titelPx * 1.12 + unterPx * 1.4 + 0.05 * W : m;

  // --- Summen unten ---
  const brandPx = 0.026 * W;
  const brandH = s.brand.trim() ? brandPx * 2.2 : 0;
  const wertPx = (kompakt ? 0.058 : 0.068) * W, labelPx = 0.024 * W;
  const summenH = s.summen && E.length ? wertPx * 1.1 + labelPx * 1.6 : 0;
  const unten = H - m - brandH - summenH;
  if (summenH) {
    const k = plan ? sanft(anteil(t, plan.summen)) : 1;
    if (k > 0) {
      const S = summen(E);
      const werte: [string, string][] = [[km(S.distanz * k), "km"], [stunden(S.zeit * k), "Stunden"], [Math.round(S.hoehe * k).toLocaleString("de-DE"), "Höhenmeter"]];
      const spalte = (W - 2 * m) / 3;
      ctx.globalAlpha = Math.min(1, k * 2);
      schattenAn();
      werte.forEach(([w, l], i) => {
        const x = m + i * spalte;
        ctx.textAlign = "left"; ctx.textBaseline = "top";
        ctx.fillStyle = rgba(th.text);
        ctx.font = `700 ${wertPx}px ${DISPLAY}`;
        ctx.fillText(w, x, unten, spalte - 0.02 * W);
        ctx.fillStyle = rgba(th.muted);
        ctx.font = `500 ${labelPx}px ${MONO}`;
        ctx.fillText(l.toUpperCase(), x, unten + wertPx * 1.15, spalte - 0.02 * W);
      });
      schattenAus();
      ctx.globalAlpha = 1;
    }
  }
  if (brandH) {
    ctx.globalAlpha = titelA;
    schattenAn();
    ctx.fillStyle = rgba(th.muted); ctx.font = `500 ${brandPx}px ${MONO}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText(s.brand.trim(), m, H - m, W - 2 * m);
    schattenAus();
    ctx.globalAlpha = 1;
  }

  // --- Routen ---
  const mitRoute = kachelnVon(E, s);
  const bereich: Box = [m, rasterOben, W - m, unten - (summenH ? 0.05 * W : 0)];
  if (!mitRoute.length) {
    ctx.fillStyle = rgba(th.muted); ctx.font = `400 ${0.034 * W}px ${TEXT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Keine Einheit mit Route", W / 2, (bereich[1] + bereich[3]) / 2);
    return;
  }
  const n = mitRoute.length;
  const zellen = raster(n, bereich, (n > 60 ? 0.01 : n > 16 ? 0.022 : 0.035) * W);
  const tage = mitRoute.map((e) => e.datum.slice(0, 10)).sort();
  const langerZeitraum = tage[tage.length - 1] > addTage(tage[0], 6);
  const labelPxR = Math.max(0.022 * W, Math.min(0.03 * W, (zellen[0][2] - zellen[0][0]) * 0.1));
  // bei sehr vielen Routen (z. B. ein ganzes Jahr) wäre die Beschriftung zu klein und zu eng: weglassen
  const mitLabel = s.beschriftung && zellen[0][2] - zellen[0][0] >= 0.13 * W;
  mitRoute.forEach((e, i) => {
    const a = plan ? anteil(t, plan.routen[i] ?? [0, 0]) : 1;
    if (a <= 0) return;
    const [x0, y0, x1, y1] = zellen[i];
    const labelH = mitLabel ? labelPxR * 1.6 : 0;
    const box: Box = [x0, y0, x1, y1 - labelH];
    const kante = Math.min(box[2] - box[0], box[3] - box[1]);
    const hatRoute = e.punkte.length >= 2;
    const P = hatRoute ? projizieren(e.punkte, box, kante * 0.06) : [];
    const farbe = s.farbe === "sport" ? hexRgb(KAT_FARBE[e.kat] ?? KAT_FARBE.Other) : hexRgb(s.accent);
    const lw = Math.max(2, kante * 0.024 * s.linie);
    const effekt = plan?.routen.length ? s.video.effekt : "einblenden";
    let anteilLinie = 1, alpha = 1;
    ctx.save();
    if (effekt === "zeichnen") anteilLinie = sanft(a);
    else if (effekt === "einblenden") {
      alpha = Math.min(1, a * 1.8);
      const sc = 0.55 + 0.45 * federnd(a), cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
      ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
    } else {
      alpha = sanft(a);
      ctx.translate(0, (1 - sanft(a)) * 0.22 * H);
    }
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = lw;
    if (th.schatten) { ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = lw * 1.2 * px; }
    else if (s.leuchten) { ctx.shadowColor = rgba(farbe, 0.55); ctx.shadowBlur = lw * 2.4 * px; }
    ctx.strokeStyle = rgba(farbe);
    if (!hatRoute) {
      // Symbol statt Route; beim Zeichnen-Effekt blendet es ein
      ctx.globalAlpha = alpha * anteilLinie;
      symbol(ctx, e.kat, box);
      anteilLinie = 1;
    }
    const spitze = hatRoute ? teilLinie(ctx, P, anteilLinie) : [0, 0] as [number, number];
    schattenAus();
    if (anteilLinie < 1) {
      ctx.beginPath(); ctx.arc(spitze[0], spitze[1], lw * 1.15, 0, Math.PI * 2);
      ctx.fillStyle = th.bg === "#f4f4f2" ? rgba([24, 24, 24]) : "#fff"; ctx.fill();
    }
    if (labelH) {
      const la = plan ? sanft(anteil(t, [(plan.routen[i]?.[1] ?? 0) - 0.25, (plan.routen[i]?.[1] ?? 0) + 0.25])) : 1;
      ctx.globalAlpha = alpha * la;
      if (th.schatten) schattenAn();
      ctx.fillStyle = rgba(th.muted); ctx.font = `500 ${labelPxR}px ${MONO}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillText(beschriftung(e, langerZeitraum), (x0 + x1) / 2, y1, x1 - x0);
      schattenAus();
    }
    ctx.restore();
  });
  ctx.globalAlpha = 1;
}

export const sammelGroesse = (s: SammelState): { W: number; H: number } => { const f = formatVon(s.format); return { W: f.w, H: f.h }; };

/** Fertiges PNG in voller Größe */
export async function sammelPng(E: SammelEinheit[], s: SammelState): Promise<Blob> {
  await sammelSchriften();
  const { W, H } = sammelGroesse(s);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  zeichneSammel(c.getContext("2d")!, E, s, { W, H });
  return new Promise((ok, fehler) => c.toBlob((b) => (b ? ok(b) : fehler(new Error("Bild konnte nicht erzeugt werden"))), "image/png"));
}

/** Dateiname für Sammelbild bzw. Video */
export function sammelName(E: SammelEinheit[], s: SammelState, endung: string): string {
  const tage = E.map((e) => e.datum.slice(0, 10)).sort();
  const titel = (s.titel.trim() || autoTitel(tage) || "Training").replace(/[\\/:*?"<>|]+/g, "").trim();
  return (tage[0] ? tage[0] + " " : "") + titel + "." + endung;
}
