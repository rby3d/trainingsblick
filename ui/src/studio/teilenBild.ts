/* Zeichnet die Share-Grafik auf ein Canvas (Nachbau von render_share aus dem Strava Share Studio, erweitert um Runden, Gym-Werte,
   Übungsliste und Muskelkarte). Alle Maße relativ zur Bildbreite W, damit Vorschau und Export gleich aussehen. */

import type { Muskel } from "./teilen";
import { HINTEN, UMRISS, VORNE } from "./koerper";
import {
  anchorDx, elementeVon, fmtMs, formatVon, grafikVon, katVon, SPORT_LABEL, STANDARD_SCHRIFT, STATS, statWert,
} from "./teilen";
import type { Box, El, FormatKey, Info, TeilDaten, TeilState } from "./teilen";

type RGB = [number, number, number];
type Ctx = CanvasRenderingContext2D;

function hexRgb(h: string | null | undefined): RGB {
  let x = (h ?? "").replace("#", "");
  if (x.length === 3) x = x.split("").map((c) => c + c).join("");
  const n = parseInt(x.slice(0, 6), 16);
  return Number.isFinite(n) && x.length >= 6 ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [252, 76, 2];
}
/** Schatten (shadowBlur/-Offset) gelten in Gerätepixeln, die Zeichnung in Bildpixeln */
const skala = (ctx: Ctx) => ctx.getTransform().a || 1;
const rgba = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export function themaFarben(s: TeilState): { bg: string | null; text: RGB; muted: RGB; accent: RGB } {
  const accent = hexRgb(s.accent);
  if (s.bg === "Dunkel") return { bg: "#101114", text: [255, 255, 255], muted: [154, 160, 166], accent };
  if (s.bg === "Hell") return { bg: "#f4f4f2", text: [24, 24, 24], muted: [107, 107, 107], accent };
  return { bg: null, text: [255, 255, 255], muted: [226, 226, 226], accent };
}
const ROLLE: Record<string, "accent" | "text" | "muted"> = { sport: "accent", title: "text", date: "muted", brand: "muted", route: "accent", intervall: "text", liste: "text" };
function farbeVon(s: TeilState, eid: string, zweite = false): RGB {
  const th = themaFarben(s);
  const el = s.elements[eid];
  const c = zweite ? el?.color2 : el?.color;
  if (c) return hexRgb(c);
  if (eid.startsWith("stat_") || eid === "liste") return zweite ? th.muted : th.text;
  return th[ROLLE[eid] ?? "text"];
}
const mitSchatten = (s: TeilState) => (s.shadow === "Auto" ? s.bg === "Transparent" : s.shadow === "Ein");

/* ---------- Schriften ---------- */

// Designs aus Formkurve nennen die Schriften "… Variable"; hier gelten die installierten Namen
const fontText = (fam: string | null, bold: boolean, px: number) =>
  `${bold ? 700 : 400} ${Math.max(1, px).toFixed(2)}px "${(fam ?? STANDARD_SCHRIFT).replace(/ Variable$/, "")}", "${STANDARD_SCHRIFT}", "Segoe UI", system-ui, sans-serif`;

/** Alle Schriften des Designs laden, bevor gezeichnet wird (sonst misst das Canvas mit der Ersatzschrift) */
export async function schriftenLaden(s: TeilState): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const fams = new Set<string>([STANDARD_SCHRIFT]);
  for (const e of Object.values(s.elements)) if (e.font) fams.add(e.font.replace(/ Variable$/, ""));
  await Promise.all([...fams].flatMap((f) => [400, 700].map((w) => document.fonts.load(`${w} 40px "${f}"`).catch(() => [])))).catch(() => undefined);
}

function masse(ctx: Ctx): { asc: number; desc: number } {
  const m = ctx.measureText("Hg");
  const px = parseFloat(/([\d.]+)px/.exec(ctx.font)?.[1] ?? "16");
  return { asc: m.fontBoundingBoxAscent ?? px * 0.92, desc: m.fontBoundingBoxDescent ?? px * 0.24 };
}

/* ---------- Text ---------- */

interface Maler { ctx: Ctx; W: number; schatten: boolean; sd: number }
function text(P: Maler, x: number, y: number, t: string, rgb: RGB, alpha: number, anker: "la" | "ls" | "mm" = "la", stroke = 0) {
  const { ctx } = P;
  const a = Math.max(0, Math.min(100, alpha)) / 100;
  const { asc } = masse(ctx);
  ctx.textAlign = anker === "mm" ? "center" : "left";
  ctx.textBaseline = anker === "mm" ? "middle" : "alphabetic";
  const yy = anker === "la" ? y + asc : y;
  const zeichne = (farbe: string, dx: number, dy: number) => {
    if (stroke > 0) { ctx.lineJoin = "round"; ctx.lineWidth = stroke * 2; ctx.strokeStyle = farbe; ctx.strokeText(t, x + dx, yy + dy); }
    ctx.fillStyle = farbe;
    ctx.fillText(t, x + dx, yy + dy);
  };
  if (P.schatten) zeichne(`rgba(0,0,0,${a * 0.47})`, P.sd, P.sd * 1.5);
  zeichne(rgba(rgb, a), 0, 0);
}

function umbrechen(ctx: Ctx, t: string, maxw: number, maxZeilen = 2): string[] {
  const zeilen: string[] = [];
  let cur = "";
  for (const w of t.split(/\s+/).filter(Boolean)) {
    const n = (cur + " " + w).trim();
    if (ctx.measureText(n).width <= maxw) cur = n;
    else { if (cur) zeilen.push(cur); cur = w; }
  }
  if (cur) zeilen.push(cur);
  if (zeilen.length > maxZeilen) { zeilen.length = maxZeilen; zeilen[maxZeilen - 1] += "…"; }
  return (zeilen.length ? zeilen : [""]).map((l) => { let x = l; while (ctx.measureText(x).width > maxw && x.length > 1) x = x.slice(0, -2).trimEnd() + "…"; return x; });
}

function textBlock(P: Maler, zeilen: string[], x: number, y: number, align: El["align"], rgb: RGB, alpha: number, stroke: number): Box {
  const { ctx } = P;
  const breiten = zeilen.map((l) => ctx.measureText(l).width);
  const bw = Math.max(0, ...breiten);
  const { asc, desc } = masse(ctx);
  const lh = (asc + desc) * 1.08;
  const left = align === "left" ? x : align === "center" ? x - bw / 2 : x - bw;
  zeilen.forEach((l, i) => {
    const off = align === "left" ? 0 : align === "center" ? (bw - breiten[i]) / 2 : bw - breiten[i];
    text(P, left + off, y + i * lh, l, rgb, alpha, "la", stroke);
  });
  return [left, y, left + bw, y + lh * zeilen.length];
}

/* ---------- Raster der Werte ---------- */

function statRaster(keys: string[], W: number, H: number, brandH: number, kompakt: boolean): [Record<string, [number, number, number]>, number] {
  const n = keys.length;
  if (!n) return [{}, 0];
  const m = 0.08 * W;
  const cols = H / W > 1.6 ? 2 : n <= 4 ? Math.min(n, 4) : 3;
  const rows = Math.ceil(n / cols);
  const rowh = (kompakt ? 0.15 : 0.19) * W;
  const top = H - 0.05 * W - brandH - rows * rowh;
  const cw = (W - 2 * m) / cols;
  const pos: Record<string, [number, number, number]> = {};
  keys.forEach((k, i) => { const r = Math.floor(i / cols), c = i % cols; pos[k] = [m + c * cw, top + r * rowh + 0.02 * W, cw]; });
  return [pos, cw];
}

/* ---------- Route ---------- */

/** Weiche Linie: nur der Schatten einer weit verschobenen Linie wird sichtbar (funktioniert in allen Browsern, auch ohne ctx.filter) */
function weichLinie(ctx: Ctx, P: [number, number][], farbe: string, breite: number, blur: number) {
  const weg = 100000, k = skala(ctx);
  ctx.save();
  ctx.shadowColor = farbe; ctx.shadowBlur = blur * k; ctx.shadowOffsetX = weg * k; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = "#000"; ctx.lineWidth = breite; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  P.forEach(([x, y], i) => (i ? ctx.lineTo(x - weg, y) : ctx.moveTo(x - weg, y)));
  ctx.stroke();
  ctx.restore();
}

function zeichneRoute(ctx: Ctx, pts: [number, number][], box: Box, rgb: RGB, W: number, schatten: boolean, el: El): boolean {
  const [x0, y0, x1, y1] = box;
  const bw = x1 - x0, bh = y1 - y0;
  if (pts.length < 2 || bw < 20 || bh < 20) return false;
  const lat0 = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = pts.map((p) => [p[1] * k, -p[0]] as [number, number]);
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const w = maxx - minx || 1e-9, h = maxy - miny || 1e-9;
  const pad = Math.min(0.035 * W, Math.min(bw, bh) * 0.2);
  const sc = Math.min((bw - 2 * pad) / w, (bh - 2 * pad) / h);
  const ox = (bw - w * sc) / 2, oy = (bh - h * sc) / 2;
  const P = xy.map(([x, y]) => [x0 + (x - minx) * sc + ox, y0 + (y - miny) * sc + oy] as [number, number]);
  const lw = Math.max(2, 0.011 * W * el.line_w);

  // auf eigener Ebene zeichnen, damit die Deckkraft wie im Studio für die ganze Route gilt
  const ebene = document.createElement("canvas");
  ebene.width = ctx.canvas.width; ebene.height = ctx.canvas.height;
  const e = ebene.getContext("2d")!;
  e.setTransform(ctx.getTransform());
  if (schatten) weichLinie(e, P, "rgba(0,0,0,0.47)", lw * 1.9, (W / 1080) * 6);
  if (el.glow > 0.01) weichLinie(e, P, rgba(rgb, (75 * Math.min(el.glow, 1.6)) / 255), lw * (1.5 + 0.9 * el.glow), lw * 1.3 * 2);
  e.strokeStyle = rgba(rgb); e.lineWidth = lw; e.lineCap = "round"; e.lineJoin = "round";
  e.beginPath();
  P.forEach(([x, y], i) => (i ? e.lineTo(x, y) : e.moveTo(x, y)));
  e.stroke();
  if (el.markers) {
    const r = lw * 0.95;
    const punkt = ([x, y]: [number, number], rr: number, f: string) => { e.beginPath(); e.arc(x, y, rr, 0, Math.PI * 2); e.fillStyle = f; e.fill(); };
    punkt(P[0], r, "#fff"); punkt(P[0], r * 0.55, "#282828");
    punkt(P[P.length - 1], r, "#fff"); punkt(P[P.length - 1], r * 0.6, rgba(rgb));
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = Math.max(0, Math.min(100, el.alpha)) / 100;
  ctx.drawImage(ebene, 0, 0);
  ctx.restore();
  return true;
}

/* ---------- Runden / Intervalle ---------- */

function rundenWert(d: TeilDaten, kat: TeilDaten["kat"], t: number, m: number, wert: number): string {
  if (d.mass === "watt") return String(Math.round(wert));
  if (d.mass === "puls") return String(Math.round(wert));
  if (m <= 0 || t <= 0) return "";
  if (kat === "Swim") return fmtMs(t / (m / 100));
  if (kat === "Run") return fmtMs(t / (m / 1000));
  return ((m / t) * 3.6).toFixed(1).replace(".", ",");
}

/** Runden als Balken: Breite = Dauer, Höhe = Tempo/Leistung; harte Runden voll, lockere blass. Werte darüber, beim Schwimmen die Strecke darunter. */
function zeichneRunden(P: Maler, d: TeilDaten, kat: TeilDaten["kat"], box: Box, rgb: RGB, txt: RGB, el: El, fam: string | null): boolean {
  const { ctx, W } = P;
  const runden = d.runden.filter((r) => r.t > 0 && (kat !== "Swim" || r.m >= 25));
  if (runden.length < 2) return false;
  const [x0, y0, x1, y1] = box;
  const bw = x1 - x0, bh = y1 - y0;
  if (bw < 40 || bh < 30) return false;
  const n = runden.length;
  const gap = Math.max(1.5, Math.min(W * 0.008, (bw * 0.25) / n));
  const summe = runden.reduce((a, r) => a + r.t, 0);
  const verfuegbar = bw - gap * (n - 1);
  const werte = runden.map((r) => r.wert).filter((v) => v > 0);
  const vmax = Math.max(...werte, 1e-9), vmin = Math.min(...werte, vmax);
  const boden = vmin - (vmax - vmin) * 0.6;
  const mitHart = runden.some((r) => r.hart);
  const zeigen = el.werte !== false;
  const lpx = Math.min(0.03 * W, Math.max(0.018 * W, (bw / n) * 0.42)) * el.size;
  ctx.font = fontText(fam, true, lpx);
  const { asc: la, desc: ld } = masse(ctx);
  const obenRaum = zeigen ? (la + ld) * 1.25 : 0;
  const untenRaum = zeigen && kat === "Swim" ? (la + ld) * 1.15 : 0;
  const hoehe = bh - obenRaum - untenRaum;
  const basis = y1 - untenRaum;
  const a = Math.max(0, Math.min(100, el.alpha)) / 100;
  const radius = (bwid: number) => Math.min(bwid * 0.3, W * 0.008);
  let x = x0;
  const balken: { x: number; w: number; top: number; r: (typeof runden)[number] }[] = [];
  for (const r of runden) {
    const w = Math.max(1.5, (verfuegbar * r.t) / summe);
    const anteil = r.wert > 0 ? (vmax === vmin ? 0.7 : (r.wert - boden) / (vmax - boden)) : 0.06;
    const h = Math.max(hoehe * 0.05, hoehe * anteil);
    balken.push({ x, w, top: basis - h, r });
    x += w + gap;
  }
  ctx.save();
  if (P.schatten) { ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = W * 0.006 * skala(ctx); ctx.shadowOffsetY = W * 0.002 * skala(ctx); }
  for (const b of balken) {
    const voll = !mitHart || b.r.hart;
    ctx.fillStyle = rgba(rgb, a * (voll ? 1 : 0.38));
    const rr = radius(b.w);
    ctx.beginPath();
    ctx.moveTo(b.x, basis);
    ctx.lineTo(b.x, b.top + rr);
    ctx.quadraticCurveTo(b.x, b.top, b.x + rr, b.top);
    ctx.lineTo(b.x + b.w - rr, b.top);
    ctx.quadraticCurveTo(b.x + b.w, b.top, b.x + b.w, b.top + rr);
    ctx.lineTo(b.x + b.w, basis);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  if (zeigen) {
    // Werte: bei Intervallen nur an den harten Runden, sonst an allen, solange sie nebeneinander passen
    // je Balken nur, wenn der Text über ihn passt (dann stößt er auch nicht an die Nachbarn)
    for (const b of balken) {
      if (mitHart && !b.r.hart) continue;
      const t = rundenWert(d, kat, b.r.t, b.r.m, b.r.wert);
      const tw = ctx.measureText(t).width;
      if (t && tw <= b.w + gap * 0.8) text(P, b.x + (b.w - tw) / 2, b.top - (la + ld) * 1.12, t, txt, el.alpha);
    }
    if (kat === "Swim") {
      ctx.font = fontText(fam, false, lpx * 0.8);
      for (const b of balken) {
        const t = String(Math.round(b.r.m / 25) * 25);
        const tw = ctx.measureText(t).width;
        if (tw <= b.w + gap * 0.8) text(P, b.x + (b.w - tw) / 2, basis + lpx * 0.25, t, txt, el.alpha * 0.75);
      }
    }
  }
  return true;
}

/* ---------- Muskelkarte ---------- */

const PFADE = new Map<string, Path2D>();
const pfad = (d: string) => { let p = PFADE.get(d); if (!p) { p = new Path2D(d); PFADE.set(d, p); } return p; };

function zeichneMuskeln(P: Maler, werte: Partial<Record<Muskel, number>>, box: Box, rgb: RGB, txt: RGB, el: El): boolean {
  const { ctx, W } = P;
  const [x0, y0, x1, y1] = box;
  const bw = x1 - x0, bh = y1 - y0;
  if (bw < 40 || bh < 40) return false;
  const max = Math.max(...Object.values(werte).map((v) => v ?? 0), 0);
  if (max <= 0) return false;
  const sc = Math.min(bw / 420, bh / 442);
  const ox = x0 + (bw - 420 * sc) / 2, oy = y0 + (bh - 442 * sc) / 2;
  const a = Math.max(0, Math.min(100, el.alpha)) / 100;
  ctx.save();
  ctx.globalAlpha = a;
  if (P.schatten) { ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = W * 0.008 * skala(ctx); }
  const figur = (formen: [Muskel, string][], dx: number) => {
    for (const spiegel of [false, true]) {
      ctx.save();
      ctx.translate(ox + dx * sc, oy);
      ctx.scale(sc, sc);
      if (spiegel) { ctx.translate(200, 0); ctx.scale(-1, 1); }
      ctx.fillStyle = rgba(txt, 0.12);
      ctx.fill(pfad(UMRISS));
      if (!spiegel) { ctx.beginPath(); ctx.ellipse(100, 35, 20, 25, 0, 0, Math.PI * 2); ctx.fill(); }
      for (const [m, d] of formen) {
        const w = (werte[m] ?? 0) / max;
        ctx.fillStyle = w > 0 ? rgba(rgb, 0.25 + 0.75 * Math.min(1, w)) : rgba(txt, 0.16);
        ctx.fill(pfad(d));
      }
      ctx.restore();
    }
  };
  figur(VORNE, 0);
  ctx.shadowColor = "transparent";
  figur(HINTEN, 220);
  ctx.restore();
  return true;
}

/* ---------- Gesamtbild ---------- */

export interface ZeichneOpt { W: number; H: number; /** Skalierung des Canvas gegenüber W×H (Vorschau in Gerätepixeln) */ px?: number }

/** Zeichnet das Bild in `ctx` (Größe W×H in Bildpixeln) und gibt Boxen und Anker für die Bearbeitung zurück */
export function zeichne(ctx: Ctx, d: TeilDaten, s: TeilState, opt: ZeichneOpt): Info {
  const { W, H } = opt;
  const fmt = formatVon(s.format);
  const fkey: FormatKey = fmt.key;
  const th = themaFarben(s);
  const schatten = mitSchatten(s);
  const art = d.art;
  const els = s.elements;
  const kat = katVon(d, s);
  const kompakt = H / W <= 1.1;
  const m = 0.08 * W;
  const P: Maler = { ctx, W, schatten, sd: Math.max(1, Math.round(W * 0.002)) };
  const px = opt.px ?? 1;
  ctx.setTransform(px, 0, 0, px, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (th.bg) { ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H); }

  const fam = (eid: string) => els[eid]?.font ?? null;
  const strokePx = (eid: string) => Math.round((els[eid]?.stroke ?? 0) * 0.0035 * W);
  const override = (eid: string): [number, number] | null => { const p = els[eid]?.pos[fkey]; return p ? [p[0] * W, p[1] * H] : null; };
  const boxes: Record<string, Box> = {}, anchors: Record<string, [number, number]> = {};

  // --- Werte ---
  const keys = STATS[art];
  const sichtbar = keys.filter((k) => els["stat_" + k]?.visible && statWert(k, d, kat));
  const brandText = (s.brand ?? "").trim();
  const brandAn = !!els.brand?.visible && !!brandText;
  const brandH = brandAn ? 0.07 * W : 0;
  const auto = s.auto_stats[fkey] ?? true;
  const [raster, zellW] = statRaster(sichtbar, W, H, brandH, kompakt);
  const basisVs = (kompakt ? 0.075 : 0.09) * W;
  const items: Record<string, [string, string, string]> = {};
  for (const k of sichtbar) items[k] = statWert(k, d, kat)!;
  let kFit = 1;
  if (auto && sichtbar.length) {
    let breit = 0;
    for (const k of sichtbar) {
      const e = els["stat_" + k];
      const [val, unit] = items[k];
      ctx.font = fontText(fam("stat_" + k), e.bold, basisVs * e.size);
      let w = ctx.measureText(val).width;
      if (unit) { ctx.font = fontText(fam("stat_" + k), true, basisVs * e.size * 0.42); w += ctx.measureText(" " + unit).width; }
      breit = Math.max(breit, w);
    }
    if (breit > 0) kFit = Math.max(0.5, Math.min(1, (zellW * 0.84) / breit));
  }
  const [rasterAlle] = statRaster(keys, W, H, brandH, kompakt);
  const statPos: Record<string, [number, number]> = {};
  for (const k of sichtbar) {
    const eid = "stat_" + k;
    const ov = auto ? null : override(eid);
    if (ov) { statPos[k] = ov; continue; }
    const q = auto ? raster : rasterAlle;
    if (q[k]) { const [x0, y0, cw] = q[k]; statPos[k] = [x0 + anchorDx(els[eid].align, cw), y0]; }
    else statPos[k] = [m, H * 0.7];
  }

  // --- große Fläche: Route, Runden oder Muskelkarte (+ Intervall-Text bzw. Übungsliste) ---
  const grafik = grafikVon(s, d);
  const r = els.route;
  const unten = Object.keys(statPos).length ? Math.min(...Object.values(statPos).map((v) => v[1])) - 0.03 * W - 0.02 * W : H - 0.05 * W - brandH - 0.03 * W;
  const oben = 0.33 * W;
  const flaecheUnten = Math.max(oben + 0.2 * W, unten);
  const iv = els.intervall, li = els.liste;
  const ivText = art === "ausdauer" && grafik === "runden" && iv?.visible ? d.intervallText : "";
  const ivH = ivText ? 0.034 * W * (iv?.size ?? 1) * 1.7 : 0;
  const listeAn = art === "gym" && !!li?.visible && !!d.gym?.uebungen.length;
  let listeAnker: [number, number] | null = null;
  let listeMaxH = Infinity;
  const listeRand = 0.05 * W;
  /** Platz nach unten ab y: bis kurz über den nächsten Wert darunter (auch wenn Werte oder Liste von Hand verschoben sind), sonst bis zum Rand */
  const platzBisUnten = (y: number) => {
    const darunter = Object.values(statPos).map((v) => v[1]).filter((v) => v > y + 1);
    return (darunter.length ? Math.min(...darunter) - 0.03 * W : H - 0.05 * W - brandH) - y;
  };

  // Übungsliste vorab planen, damit Muskelkarte und Liste sich den Platz teilen
  interface ListePlan { px2: number; gestapelt: boolean; asc: number; desc: number; lh: number; eintragH: number; zeilen: { name: string; text: string }[]; breiten: [number, number][]; bw: number; h: number }
  const listePlan = (px2: number, gestapelt: boolean, maxZ = Infinity): ListePlan => {
    const f = fam("liste");
    ctx.font = fontText(f, true, px2);
    const { asc, desc } = masse(ctx);
    const lh = (asc + desc) * (gestapelt ? 1.12 : 1.38);
    const eintragH = gestapelt ? lh * 2 + (asc + desc) * 0.35 : lh;
    const alle = d.gym?.uebungen ?? [];
    const zeigen = Math.max(1, maxZ - 1);
    const zeilen = alle.length > maxZ ? [...alle.slice(0, zeigen), { name: "+" + (alle.length - zeigen) + " weitere", text: "" }] : alle;
    const breiten = zeilen.map((z) => {
      ctx.font = fontText(f, true, px2); const a = ctx.measureText(z.name).width;
      ctx.font = fontText(f, false, px2 * (gestapelt ? 0.86 : 1)); const t = z.text ? ctx.measureText(z.text).width : 0;
      return [a, t] as [number, number];
    });
    const bw = Math.max(0, ...breiten.map(([a, t]) => (gestapelt ? Math.max(a, t) : a + (t ? t + px2 * 0.6 : 0))));
    const letzte = zeilen.length - 1;
    const h = letzte * eintragH + (gestapelt && zeilen[letzte]?.text ? lh : 0) + asc + desc;
    return { px2, gestapelt, asc, desc, lh, eintragH, zeilen, breiten, bw, h };
  };
  /** Größte Schrift (bis 70 %), bei der alle Übungen in Breite und Höhe passen: erst in einer Zeile, sonst Sätze darunter.
      Passt es auch so nicht, die kleinste Schrift mit so vielen Übungen wie möglich und „+n weitere“. */
  const listeWaehlen = (platz: number, maxH: number): ListePlan => {
    const basis = 0.032 * W * (li?.size ?? 1);
    for (const k of [1, 0.92, 0.84, 0.76, 0.7]) {
      for (const gestapelt of [false, true]) {
        const L = listePlan(basis * k, gestapelt);
        if (L.bw <= platz && L.h <= maxH) return L;
      }
    }
    let px2 = basis * 0.7;
    const gestapelt = listePlan(px2, false).bw > platz;
    let L = listePlan(px2, gestapelt);
    if (L.bw > platz) { px2 *= Math.max(0.65, platz / L.bw); L = listePlan(px2, gestapelt); }
    if (L.h > maxH) L = listePlan(px2, gestapelt, Math.max(1, Math.floor((maxH - L.asc - L.desc) / L.eintragH) + 1));
    return L;
  };
  if (r?.visible && grafik) {
    const pov = override("route"), bov = r.box[fkey];
    let box: Box;
    if (pov || bov) {
      const bw = bov ? bov[0] * W : W - 2 * m, bh = bov ? bov[1] * H : 0.3 * H;
      const [cx, cy] = pov ?? [W / 2, H / 2];
      box = [cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2];
    } else if (listeAn && !li.pos[fkey]) {
      // Gym: Muskelkarte und darunter (quadratisch: daneben) die Übungsliste
      if (H / W < 1.5) {
        box = [m, oben, W / 2, flaecheUnten];
        listeAnker = [W / 2 + 0.03 * W, oben + 0.02 * W];
        listeMaxH = flaecheUnten - oben;
      } else {
        // Karte so groß wie möglich (höchstens 62 %), aber mindestens 38 %; den Rest bekommt die Liste
        const hoch = flaecheUnten - oben;
        const braucht = listeWaehlen(W - listeRand - m, Infinity).h + 0.04 * W;
        const kh = Math.min((W - 2 * m) * (442 / 420), Math.max(hoch * 0.38, Math.min(hoch * 0.62, hoch - braucht)));
        box = [m, oben, W - m, oben + kh];
        listeAnker = [m, oben + kh + 0.04 * W];
        listeMaxH = flaecheUnten - listeAnker[1];
      }
    } else box = [m, oben, W - m, flaecheUnten - (ivText && !iv.pos[fkey] ? ivH : 0)];
    box = box.map((v) => Math.round(v)) as Box;
    boxes.route = box;
    anchors.route = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
    const farbe = farbeVon(s, "route");
    if (grafik === "route") zeichneRoute(ctx, d.punkte, box, farbe, W, schatten, r);
    else if (grafik === "runden") zeichneRunden(P, d, kat, box, farbe, th.text, r, fam("route"));
    else if (grafik === "muskeln" && d.gym) zeichneMuskeln(P, d.gym.muskeln, box, farbe, th.text, r);
  }
  if (!listeAnker && listeAn) {
    listeAnker = boxes.route && !els.route.pos[fkey] ? [m, boxes.route[3] + 0.04 * W] : [m, oben];
    listeMaxH = flaecheUnten - listeAnker[1];
  }

  const setzeText = (eid: string, zeilen: (x: number) => string[], basis: number, std: [number, number]) => {
    const e = els[eid];
    if (!e?.visible) return;
    ctx.font = fontText(fam(eid), e.bold, basis * W * e.size);
    const [x, y] = override(eid) ?? std;
    const z = zeilen(x);
    if (!z.length || !z.some(Boolean)) return;
    boxes[eid] = textBlock(P, z, x, y, e.align, farbeVon(s, eid), e.alpha, strokePx(eid)).map((v) => Math.round(v)) as Box;
    anchors[eid] = [x, y];
  };

  // --- Kopf ---
  const wahl = s.texts.sport ?? "Auto";
  const sportLabel = wahl !== "Auto" ? wahl.toUpperCase() : SPORT_LABEL[d.sport] ?? d.sport.toUpperCase();
  setzeText("sport", () => [sportLabel], 0.032, [m, m]);
  const titel = (s.texts.title ?? "").trim() || d.name;
  setzeText("title", (x) => {
    const al = els.title.align;
    const avail = al === "left" ? W - x - 0.04 * W : al === "right" ? x - 0.04 * W : 2 * Math.min(x, W - x) - 0.08 * W;
    return umbrechen(ctx, titel, Math.max(avail, 0.25 * W), 2);
  }, 0.068, [m, m + 0.056 * W]);
  const [dd, uhr] = d.datum.split("T");
  const [jj, mm, tt] = dd.split("-");
  setzeText("date", () => [`${tt}.${mm}.${jj}${uhr ? " · " + uhr.slice(0, 5) : ""}`], 0.034, [W - m, m]);
  setzeText("brand", () => [brandText], 0.03, [W / 2, H - 0.085 * W]);

  // --- Intervall-Text unter den Runden ---
  if (ivText) {
    const al = iv.align;
    const b = boxes.route;
    const std: [number, number] = b ? [al === "left" ? b[0] : al === "right" ? b[2] : (b[0] + b[2]) / 2, b[3] + 0.02 * W] : [W / 2, oben];
    setzeText("intervall", () => umbrechen(ctx, ivText, W - 2 * m, 2), 0.034, std);
  }

  // --- Übungsliste (Gym): Name und Sätze in einer Zeile; wird es zu breit, die Sätze darunter (gestapelt), notfalls kleiner ---
  if (listeAn && listeAnker) {
    const e = li;
    const [x, y] = override("liste") ?? listeAnker;
    const f = fam("liste");
    const platz = e.align === "left" ? W - listeRand - x : e.align === "right" ? x - listeRand : 2 * Math.min(x, W - x) - 2 * listeRand;
    const c1 = farbeVon(s, "liste"), c2 = farbeVon(s, "liste", true);
    // nie in die Werte hinein, auch wenn die Liste von Hand verschoben wurde
    const L = listeWaehlen(Math.max(platz, 0.2 * W), Math.min(e.pos[fkey] ? Infinity : listeMaxH, platzBisUnten(y)));
    const left = e.align === "left" ? x : e.align === "center" ? x - L.bw / 2 : x - L.bw;
    L.zeilen.forEach((z, i) => {
      const [a, t] = L.breiten[i];
      const yy = y + i * L.eintragH;
      const zeile = (breite: number) => (e.align === "left" ? 0 : e.align === "center" ? (L.bw - breite) / 2 : L.bw - breite);
      ctx.font = fontText(f, true, L.px2);
      if (L.gestapelt) {
        text(P, left + zeile(a), yy, z.name, c1, e.alpha, "la", strokePx("liste"));
        if (z.text) { ctx.font = fontText(f, false, L.px2 * 0.86); text(P, left + zeile(t), yy + L.lh, z.text, c2, e.alpha); }
      } else {
        const off = zeile(a + (t ? t + L.px2 * 0.6 : 0));
        text(P, left + off, yy, z.name, c1, e.alpha, "la", strokePx("liste"));
        if (z.text) { ctx.font = fontText(f, false, L.px2); text(P, left + off + a + L.px2 * 0.6, yy, z.text, c2, e.alpha); }
      }
    });
    boxes.liste = [Math.round(left), Math.round(y), Math.round(left + L.bw), Math.round(y + L.h)];
    anchors.liste = [x, y];
  }

  // --- Werte ---
  for (const k of sichtbar) {
    const eid = "stat_" + k;
    const e = els[eid];
    const [val, unit, label0] = items[k];
    const label = label0.toUpperCase();
    const vpx = basisVs * e.size * (auto ? kFit : 1);
    ctx.font = fontText(fam(eid), e.bold, vpx);
    const wv = ctx.measureText(val).width;
    const { asc, desc } = masse(ctx);
    const gap = 0.012 * W;
    ctx.font = fontText(fam(eid), true, vpx * 0.42);
    const wu = unit ? ctx.measureText(unit).width : 0;
    const vw = wv + (unit ? gap + wu : 0);
    ctx.font = fontText(fam(eid), false, 0.027 * W * e.size);
    const wl = ctx.measureText(label).width;
    const { asc: la, desc: ld } = masse(ctx);
    const bw = Math.max(vw, wl);
    const [x, y] = statPos[k];
    const al = e.align;
    const left = al === "left" ? x : al === "center" ? x - bw / 2 : x - bw;
    const voff = al === "left" ? 0 : al === "center" ? (bw - vw) / 2 : bw - vw;
    const loff = al === "left" ? 0 : al === "center" ? (bw - wl) / 2 : bw - wl;
    const sp = strokePx(eid);
    const c1 = farbeVon(s, eid), c2 = farbeVon(s, eid, true);
    ctx.font = fontText(fam(eid), e.bold, vpx);
    text(P, left + voff, y, val, c1, e.alpha, "la", sp);
    if (unit) { ctx.font = fontText(fam(eid), true, vpx * 0.42); text(P, left + voff + wv + gap, y + asc, unit, c2, e.alpha, "ls"); }
    const ly = y + (asc + desc) * 0.98 + 0.004 * W;
    ctx.font = fontText(fam(eid), false, 0.027 * W * e.size);
    text(P, left + loff, ly, label, c2, e.alpha);
    boxes[eid] = [Math.round(left), Math.round(y), Math.round(left + bw), Math.round(ly + la + ld)];
    anchors[eid] = [x, y];
  }

  const [slotsRoh] = statRaster(keys, W, H, 0.07 * W, kompakt);
  void elementeVon;
  return { boxes, anchors, size: [W, H], fkey, stat_keys: sichtbar, auto_stats: auto, slots: slotsRoh };
}

/** Fertiges PNG in voller Größe */
export async function alsPng(d: TeilDaten, s: TeilState): Promise<Blob> {
  await schriftenLaden(s);
  const f = formatVon(s.format);
  const c = document.createElement("canvas");
  c.width = f.w; c.height = f.h;
  zeichne(c.getContext("2d")!, d, s, { W: f.w, H: f.h });
  return new Promise((ok, fehler) => c.toBlob((b) => (b ? ok(b) : fehler(new Error("Bild konnte nicht erzeugt werden"))), "image/png"));
}
