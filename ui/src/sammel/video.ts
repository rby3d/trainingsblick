/* Videos aus dem Sammelbild: wenn möglich Bild für Bild gerechnet (WebCodecs + Mediabunny, MP4 mit fester Bildrate, unten),
   sonst mit MediaRecorder in Echtzeit aufgenommen. Dieselbe Tonplanung spielt die Vorschau ab.
   Töne: liegt im Ton-Ordner (config/strava_dashboard.json "ton_ordner", sonst .cache\ton) eine Datei <name>.mp3, wird sie
   genommen (z. B. die eigene Sound-Sammlung); sonst werden die Effekte hier erzeugt, damit es ohne lizenzierte Dateien geht.
   Musik gibt es nur als Datei (musik_lofi.mp3, musik_daytona.mp3).
   Übernommen aus Formkurve (frontend/src/lib/video.ts); bei Änderungen beide pflegen. */

import { AudioBufferSource, BufferTarget, CanvasSource, canEncodeAudio, canEncodeVideo, Mp4OutputFormat, Output } from "mediabunny";
import { rpc, token } from "../api";
import type { Musik, TonEreignis, TonName } from "./logik";

/** Grundlautstärke je Sound (Dateien und erzeugte Töne liegen bei etwa -1 dBFS Spitze) */
const LAUT: Record<TonName, number> = { klick: 0.45, blop: 0.4, woosh: 0.3, riser: 0.45, impact: 0.65, bling: 0.35 };
const MUSIK_LAUT = 0.22;

export interface Tonspur { toene: TonEreignis[]; musik: Musik; laut: number; dauer: number }

/* ---------- AudioContext: beim Fingertipp/Klick anlegen bzw. fortsetzen (sonst bleibt er stumm) ---------- */

let audio: AudioContext | null = null;
function tonFreigeben(): void {
  try {
    if (!audio) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      audio = new Ctx();
    }
    if (audio.state !== "running") void audio.resume();
  } catch { /* kein Ton möglich */ }
}
if (typeof window !== "undefined") for (const art of ["pointerdown", "keydown"]) window.addEventListener(art, tonFreigeben, { capture: true, passive: true });

async function bereit(): Promise<AudioContext | null> {
  tonFreigeben();
  if (!audio) return null;
  if (audio.state !== "running") await Promise.race([audio.resume().catch(() => undefined), new Promise((ok) => setTimeout(ok, 400))]);
  return audio.state === "running" ? audio : null;
}

/* ---------- Erzeugte Effekte ---------- */

function erzeugen(ctx: BaseAudioContext, name: TonName): AudioBuffer {
  const sr = ctx.sampleRate;
  const dauer: Record<TonName, number> = { klick: 0.05, blop: 0.16, woosh: 0.7, riser: 1.3, impact: 1.1, bling: 1.1 };
  const n = Math.round(dauer[name] * sr);
  const b = ctx.createBuffer(1, n, sr);
  const d = b.getChannelData(0);
  let phase = 0, phase2 = 0, tief = 0, rauschAlt = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, x = i / n;
    const rausch = Math.random() * 2 - 1;
    let v = 0;
    if (name === "klick") {
      v = (rausch * 0.6 + Math.sin(2 * Math.PI * 2400 * t) * 0.6) * Math.exp(-t * 140);
    } else if (name === "blop") {
      const f = 180 + 520 * Math.exp(-t * 28);
      phase += (2 * Math.PI * f) / sr;
      v = Math.sin(phase) * Math.exp(-t * 22) * Math.min(1, t * 400);
    } else if (name === "woosh") {
      // Rauschen durch einen Tiefpass, dessen Grenze an- und wieder absteigt; Lautstärke als weicher Bogen
      const grenze = 0.04 + 0.35 * Math.sin(Math.PI * x);
      tief += grenze * (rausch - tief);
      v = tief * 2.2 * Math.pow(Math.sin(Math.PI * x), 2);
    } else if (name === "riser") {
      const f = 180 * Math.pow(7, x);
      phase += (2 * Math.PI * f) / sr;
      tief += (0.05 + 0.5 * x) * (rausch - tief);
      v = (Math.sin(phase) * 0.45 + tief * 0.9) * Math.pow(x, 2.2);
    } else if (name === "impact") {
      const f = 38 + 70 * Math.exp(-t * 18);
      phase += (2 * Math.PI * f) / sr;
      rauschAlt += 0.12 * (rausch - rauschAlt);
      v = Math.sin(phase) * Math.exp(-t * 3.2) + rauschAlt * 1.4 * Math.exp(-t * 14);
    } else {
      phase += (2 * Math.PI * 1318.5) / sr;
      phase2 += (2 * Math.PI * 1975.5) / sr;
      const einsatz2 = t > 0.09 ? Math.exp(-(t - 0.09) * 4.5) : 0;
      v = (Math.sin(phase) * Math.exp(-t * 4.5) + Math.sin(phase2) * einsatz2 * 0.8) * Math.min(1, t * 300);
    }
    d[i] = v;
  }
  let spitze = 0;
  for (let i = 0; i < n; i++) spitze = Math.max(spitze, Math.abs(d[i]));
  if (spitze > 0) for (let i = 0; i < n; i++) d[i] *= 0.89 / spitze;
  return b;
}

/** Namen der Sounds, die als Datei im Ton-Ordner liegen (einmal je Sitzung gefragt) */
let dateien: Promise<Set<string>> | null = null;
const vorhanden = () => (dateien ??= rpc<{ namen: string[] }>("ton_liste").then((r) => new Set(r.namen)).catch(() => new Set<string>()));

const puffer = new Map<string, Promise<AudioBuffer | null>>();
/** Datei aus dem Ton-Ordner, sonst (bei Effekten) erzeugt; Musik ohne Datei: null */
function laden(ctx: BaseAudioContext, name: string): Promise<AudioBuffer | null> {
  let p = puffer.get(name);
  if (!p) {
    p = vorhanden()
      .then((da) => (da.has(name) ? fetch(`/datei?art=ton&name=${encodeURIComponent(name)}&t=${encodeURIComponent(token())}`) : null))
      .then((r) => (r?.ok ? r.arrayBuffer() : null))
      .then((b) => (b ? ctx.decodeAudioData(b) : null))
      .catch(() => null)
      .then((b) => b ?? (name.startsWith("musik_") ? null : erzeugen(ctx, name as TonName)));
    puffer.set(name, p);
  }
  return p;
}

/** Welche Musikstücke als Datei da sind (für die Auswahl) */
export async function musikDa(): Promise<Musik[]> {
  const da = await vorhanden();
  return (["lofi", "daytona"] as const).filter((m) => da.has("musik_" + m));
}

/** Töne und Musik ab `start` (AudioContext-Zeit) auf `ziel` legen */
async function tonPlanen(ctx: BaseAudioContext, ziel: AudioNode, spur: Tonspur, start: () => number): Promise<{ start: number; stopp: () => void }> {
  const namen = [...new Set(spur.toene.map((e) => e.ton as string))];
  if (spur.musik !== "aus") namen.push("musik_" + spur.musik);
  const buf = new Map(await Promise.all(namen.map(async (n) => [n, await laden(ctx, n)] as const)));
  const t0 = start();
  const quellen: AudioBufferSourceNode[] = [];
  const gesamt = ctx.createGain();
  gesamt.gain.value = spur.laut;
  gesamt.connect(ziel);
  const spiele = (b: AudioBuffer, wann: number, lautst: number | ((g: GainNode) => void), bis?: number) => {
    const q = ctx.createBufferSource();
    q.buffer = b;
    const g = ctx.createGain();
    if (typeof lautst === "number") g.gain.value = lautst; else lautst(g);
    q.connect(g).connect(gesamt);
    q.start(Math.max(ctx.currentTime, wann));
    if (bis) q.stop(bis);
    quellen.push(q);
  };
  const musik = spur.musik !== "aus" ? buf.get("musik_" + spur.musik) : null;
  if (musik) {
    const ende = t0 + spur.dauer;
    spiele(musik, t0, (g) => {
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(MUSIK_LAUT, t0 + 0.6);
      g.gain.setValueAtTime(MUSIK_LAUT, Math.max(t0 + 0.6, ende - 1.4));
      g.gain.linearRampToValueAtTime(0, ende);
    }, ende + 0.05);
  }
  for (const e of spur.toene) {
    const b = buf.get(e.ton);
    if (b) spiele(b, t0 + e.t, LAUT[e.ton] * e.v);
  }
  return { start: t0, stopp: () => { for (const q of quellen) { try { q.stop(); } catch { /* schon zu Ende */ } } gesamt.disconnect(); } };
}

/** Vorschau abspielen: `malen(t)` je Bild, Ton über die Lautsprecher. Gibt eine Funktion zum Anhalten zurück. */
export async function abspielen(malen: (t: number) => void, spur: Tonspur, onEnde: () => void): Promise<() => void> {
  const ctx = await bereit();
  let uhr: () => number, stoppTon = () => {};
  if (ctx) {
    const p = await tonPlanen(ctx, ctx.destination, spur, () => ctx.currentTime + 0.08);
    stoppTon = p.stopp;
    uhr = () => ctx.currentTime - p.start;
  } else {
    const s0 = performance.now();
    uhr = () => (performance.now() - s0) / 1000;
  }
  let aus = false, raf = 0;
  const schritt = () => {
    if (aus) return;
    const t = uhr();
    malen(Math.max(0, t));
    if (t >= spur.dauer) { aus = true; onEnde(); return; }
    raf = requestAnimationFrame(schritt);
  };
  raf = requestAnimationFrame(schritt);
  return () => { aus = true; cancelAnimationFrame(raf); stoppTon(); };
}

/** Das beste Videoformat, das der Browser aufnehmen kann (null: gar keins) */
export function videoFormat(): { mime: string; endung: "mp4" | "webm" } | null {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement.prototype.captureStream !== "function") return null;
  for (const mime of ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, endung: mime.startsWith("video/mp4") ? "mp4" : "webm" };
  }
  return null;
}

/** Video in Echtzeit aufnehmen (Rückfall ohne WebCodecs, dauert so lange wie das Video). `malen(ctx, t)` zeichnet das Bild zum Zeitpunkt t in W×H. */
async function liveAufnehmen(malen: (g: CanvasRenderingContext2D, t: number) => void, W: number, H: number, spur: Tonspur,
  fortschritt: (anteil: number) => void, signal: AbortSignal): Promise<{ blob: Blob; endung: string }> {
  const format = videoFormat();
  if (!format) throw new Error("Videos aufnehmen geht in diesem Browser nicht");
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  // im Dokument, aber unsichtbar: manche Browser liefern sonst keine Bilder aus dem Canvas
  Object.assign(c.style, { position: "fixed", left: "0", top: "0", width: "2px", height: "2px", opacity: "0", pointerEvents: "none" });
  document.body.appendChild(c);
  const g = c.getContext("2d")!;
  malen(g, 0);
  const stream = c.captureStream(30);
  const ctx = await bereit();
  let uhr: () => number, stoppTon = () => {};
  if (ctx && (spur.musik !== "aus" || spur.toene.length)) {
    const ziel = ctx.createMediaStreamDestination();
    const p = await tonPlanen(ctx, ziel, spur, () => ctx.currentTime + 0.35);
    stoppTon = p.stopp;
    for (const tr of ziel.stream.getAudioTracks()) stream.addTrack(tr);
    uhr = () => ctx.currentTime - p.start;
  } else {
    const s0 = performance.now() + 350;
    uhr = () => (performance.now() - s0) / 1000;
  }
  const rec = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 160_000 });
  const teile: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) teile.push(e.data); };
  const gestoppt = new Promise<void>((ok) => { rec.onstop = () => ok(); });
  let fehler: Error | null = null;
  try {
    rec.start(250);
    await new Promise<void>((ok) => {
      const schritt = () => {
        if (signal.aborted) { fehler = new DOMException("Abgebrochen", "AbortError"); ok(); return; }
        if (document.hidden) { fehler = new Error("Während der Aufnahme muss das Fenster sichtbar bleiben"); ok(); return; }
        const t = uhr();
        malen(g, Math.max(0, t));
        fortschritt(Math.min(1, Math.max(0, t) / spur.dauer));
        if (t >= spur.dauer + 0.15) { ok(); return; }
        requestAnimationFrame(schritt);
      };
      requestAnimationFrame(schritt);
    });
    rec.stop();
    await gestoppt;
  } finally {
    stoppTon();
    for (const tr of stream.getTracks()) tr.stop();
    c.remove();
  }
  if (fehler) throw fehler;
  return { blob: new Blob(teile, { type: format.mime.split(";")[0] }), endung: format.endung };
}

/* ---------- Bild für Bild rechnen (WebCodecs, MP4 mit fester Bildrate) ----------
   MediaRecorder schreibt ein fragmentiertes MP4 mit schwankender Bildrate; Schnittprogramme wie DaVinci Resolve kommen damit
   nicht zurecht. Hier entsteht jedes Bild einzeln zum festen Zeitpunkt i/30 s, der Ton vorab in einem OfflineAudioContext,
   Mediabunny packt beides in ein normales MP4 (moov vorn). Geht schneller als Echtzeit und ruckelt nicht, wenn das Fenster hängt. */

const FPS = 30;

/** Kann der Browser das Video Bild für Bild als MP4 (H.264, mit Ton AAC) rechnen? */
async function kannRechnen(W: number, H: number, mitTon: boolean): Promise<boolean> {
  if (typeof VideoEncoder === "undefined" || typeof OfflineAudioContext === "undefined") return false;
  try {
    if (!(await canEncodeVideo("avc", { width: W, height: H }))) return false;
    return !mitTon || (await canEncodeAudio("aac", { numberOfChannels: 2, sampleRate: 48000 }));
  } catch { return false; }
}

/** Ton der ganzen Länge vorab rechnen */
async function tonRechnen(spur: Tonspur, sekunden: number): Promise<AudioBuffer> {
  const sr = 48000;
  const off = new OfflineAudioContext(2, Math.ceil(sekunden * sr), sr);
  await tonPlanen(off, off.destination, spur, () => 0);
  return off.startRendering();
}

async function videoRechnen(malen: (g: CanvasRenderingContext2D, t: number) => void, W: number, H: number, spur: Tonspur,
  fortschritt: (anteil: number) => void, signal: AbortSignal): Promise<{ blob: Blob; endung: string }> {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const n = Math.ceil((spur.dauer + 0.15) * FPS);
  const mitTon = spur.musik !== "aus" || spur.toene.length > 0;
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const bild = new CanvasSource(c, { codec: "avc", bitrate: 10_000_000, keyFrameInterval: 2 });
  output.addVideoTrack(bild, { frameRate: FPS });
  const ton = mitTon ? new AudioBufferSource({ codec: "aac", bitrate: 192_000 }) : null;
  if (ton) output.addAudioTrack(ton);
  await output.start();
  try {
    if (ton) await ton.add(await tonRechnen(spur, n / FPS));
    for (let i = 0; i < n; i++) {
      if (signal.aborted) throw new DOMException("Abgebrochen", "AbortError");
      malen(g, i / FPS);
      await bild.add(i / FPS, 1 / FPS);
      fortschritt((i + 1) / n);
      if (i % 8 === 7) await new Promise((ok) => setTimeout(ok, 0));       // Oberfläche zwischendurch zeichnen lassen
    }
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => undefined);
    throw e;
  }
  return { blob: new Blob([output.target.buffer!], { type: "video/mp4" }), endung: "mp4" };
}

/** Kann dieser Browser überhaupt Videos erzeugen (gerechnet oder aufgenommen)? */
export const videoMoeglich = (): boolean => typeof VideoEncoder !== "undefined" || videoFormat() !== null;

/** Video erzeugen: wenn möglich Bild für Bild gerechnet (MP4, feste 30 Bilder/s), sonst in Echtzeit aufgenommen */
export async function videoAufnehmen(malen: (g: CanvasRenderingContext2D, t: number) => void, W: number, H: number, spur: Tonspur,
  fortschritt: (anteil: number) => void, signal: AbortSignal): Promise<{ blob: Blob; endung: string }> {
  if (await kannRechnen(W, H, spur.musik !== "aus" || spur.toene.length > 0)) return videoRechnen(malen, W, H, spur, fortschritt, signal);
  return liveAufnehmen(malen, W, H, spur, fortschritt, signal);
}