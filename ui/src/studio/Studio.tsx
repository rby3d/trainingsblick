/* Share Studio im Dashboard, aufgebaut wie in Formkurve (frontend/src/ui/Teilen.tsx): eine Einheit gestalten (Einzeln),
   mehrere auf einem Bild (Sammelbild) oder als Video. Dazu die Schnellvorschau an der einzelnen Einheit.
   Gezeichnet wird im Fenster (studio/teilenBild.ts, Kopie aus Formkurve); das Script legt die Dateien nur ab. */

import { useEffect, useMemo, useRef, useState } from "react";
import { rpc, token } from "../api";
import { Seg } from "../komp";
import { Auswahl } from "../auswahl";
import { Modal } from "../ui";
import { Sym } from "../symbole";
import { Akt, Kat } from "../util";
import {
  AKZENTE, ausrichten, elementeVon, elementName, FORMATE, formatVon, friereAnker, friereBox, friereStats, grafikVon, katVon, klon, normalisieren,
  r5, rasten, SCHRIFTEN, SPORT_WAHL, standardElement, standardState, statWert, trefferReihe, verschoben,
} from "./teilen";
import type { Box, El, Fuehrung, Grafik, Hintergrund, Info, Schatten, TeilDaten, TeilState } from "./teilen";
import { alsPng, schriftenLaden, zeichne } from "./teilenBild";
import { rundenDaten } from "./intervalle";
import type { Lap } from "./intervalle";
import { autoTitel, polylinePunkte, sammelNormalisieren } from "../sammel/logik";
import type { Musik, SammelEinheit, SammelState } from "../sammel/logik";
import { sammelGroesse, sammelName, sammelPng, sammelSchriften, zeichneSammel } from "../sammel/bild";
import { musikDa, videoAufnehmen, videoMoeglich } from "../sammel/video";
import { EinheitenKurz, EinheitenWahl, Gruppe, SammelFlaeche, SammelPanel, Schalter, tonspur, videoStand } from "./Mehr";

export type StudioModus = "einzeln" | "sammel" | "video";
/** Womit das Studio öffnet: Einheiten, im Modus Einzeln die aktive, und ein Entwurf aus der Schnellvorschau */
export type StudioStart = { ids: string[]; aktiv?: string; modus?: StudioModus; entwurf?: TeilState };

/* ---------- Daten ---------- */

export function teilDatenVon(a: Akt, punkte: [number, number][], lp: Lap[] = []): TeilDaten {
  return {
    art: "ausdauer", name: a.n, sport: a.s, kat: a.k as TeilDaten["kat"], datum: a.d.slice(0, 16), distanz: a.m, zeit: a.t, hoehe: a.e, puls: a.hr,
    watt: a.k === "Ride" ? a.nw ?? a.w : a.w, punkte, ...rundenDaten(a.k, lp),
  };
}
/** Route und Runden einer Einheit; `holen`: fehlende Runden gleich bei Strava abrufen (ein Abruf je Einheit) */
async function datenVon(a: Akt, holen: boolean): Promise<TeilDaten> {
  const [punkte, lp] = await Promise.all([
    a.r ? rpc<{ punkte: [number, number][] }>("route", { id: a.id }).then((r) => r.punkte).catch(() => [] as [number, number][]) : Promise.resolve([] as [number, number][]),
    rpc<{ lp: Lap[] }>("runden", { id: a.id, holen }).then((r) => r.lp).catch(() => [] as Lap[]),
  ]);
  return teilDatenVon(a, punkte, lp);
}
function useTeilDaten(a: Akt | undefined): TeilDaten | null {
  const [d, setD] = useState<{ id: string; d: TeilDaten } | null>(null);
  useEffect(() => {
    if (!a) return;
    let weg = false;
    void datenVon(a, true).then((x) => { if (!weg) setD({ id: a.id, d: x }); });
    return () => { weg = true; };
  }, [a]);
  return a && d?.id === a.id ? d.d : null;
}

/** Standard-Design für Einzelbilder (Dashboard-Einstellung, sonst das aktuelle Design aus dem Share Studio) */
let basisCache: TeilState | null = null;
function useEinzelBasis(): [TeilState | null, (s: TeilState) => void] {
  const [b, setB] = useState<TeilState | null>(basisCache);
  useEffect(() => {
    if (basisCache) return;
    rpc<{ design: unknown }>("einzel_design").then((r) => { basisCache = normalisieren(r.design, "ausdauer"); setB(basisCache); })
      .catch(() => { basisCache = standardState("ausdauer"); setB(basisCache); });
  }, []);
  return [b, (s) => { basisCache = klon(s); setB(basisCache); }];
}

/* ---------- Ausgabe ---------- */

const dateiname = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "").trim();
const bildName = (d: TeilDaten, s: TeilState) => dateiname(d.datum.slice(0, 10) + " " + (s.texts.title.trim() || d.name)) + ".png";
async function hochladen(gruppe: string, blob: Blob, name: string) {
  const r = await fetch(`/hochladen?gruppe=${gruppe}&name=${encodeURIComponent(name)}&t=${encodeURIComponent(token())}`, { method: "POST", body: blob });
  if (!r.ok) throw new Error("Datei konnte nicht übergeben werden");
}
/** Datei an das Script schicken und dort per Speichern-Dialog ablegen; liefert den Pfad (null = abgebrochen) */
async function ablegen(blob: Blob, name: string): Promise<string | null> {
  const gruppe = "teilen" + Date.now().toString(36);
  await hochladen(gruppe, blob, name);
  const res = await rpc<{ abgebrochen: boolean; pfad?: string }>("teilen_ablegen", { gruppe, name });
  return res.abgebrochen ? null : res.pfad ?? null;
}
/** PNG in die Zwischenablage (als Promise, damit der Klick als Nutzeraktion zählt) */
async function kopieren(png: Promise<Blob>) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Kopieren von Bildern geht in diesem Fenster nicht");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

/* ---------- Vorschau mit Verschieben ---------- */

type MutVon<T> = (f: (s: T) => void, schritt?: boolean) => void;
type Mut = MutVon<TeilState>;
type Zug = { modus: "move" | "resize"; eid: string; x: number; y: number; anker: [number, number] | null; box: Box; start: TeilState; bewegt: boolean };

/** Elemente, die es für diese Daten gibt (ausgeblendete Werte ohne Daten zählen nicht) */
function vorhanden(eid: string, d: TeilDaten, s: TeilState): boolean {
  if (eid.startsWith("stat_")) return !!statWert(eid.slice(5), d, katVon(d, s));
  if (eid === "route") return !!grafikVon(s, d);
  if (eid === "intervall") return grafikVon(s, d) === "runden" && !!d.intervallText;
  if (eid === "liste") return !!d.gym?.uebungen.length;
  if (eid === "brand") return !!s.brand.trim();
  return true;
}

/** `merken`: Stand vor einem Verschieben als einen Schritt fürs Rückgängigmachen ablegen */
function TeilFlaeche({ d, st, mut, merken, sel, setSel }: { d: TeilDaten; st: TeilState; mut: Mut; merken: (alt: TeilState) => void; sel: string | null; setSel: (e: string | null) => void }) {
  const huelle = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ov = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const [info, setInfo] = useState<Info | null>(null);
  const [fuehrung, setFuehrung] = useState<Fuehrung[]>([]);
  const [zugBox, setZugBox] = useState<{ eid: string; box: Box } | null>(null);
  const zug = useRef<Zug | null>(null);
  const fmt = formatVon(st.format);
  const W = fmt.w, H = fmt.h;

  useEffect(() => {
    const el = huelle.current;
    if (!el) return;
    const mess = () => { const r = el.getBoundingClientRect(); setDim({ w: r.width, h: r.height }); };
    mess();
    const ro = new ResizeObserver(mess);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const f = Math.max(0.05, Math.min((dim.w - 8) / W, (dim.h - 8) / H));
  const cssW = Math.floor(W * f), cssH = Math.floor(H * f);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

  useEffect(() => {
    const c = canvas.current;
    if (!c || cssW < 20) return;
    let weg = false;
    void schriftenLaden(st).then(() => {
      if (weg) return;
      c.width = Math.round(cssW * dpr); c.height = Math.round(cssH * dpr);
      setInfo(zeichne(c.getContext("2d")!, d, st, { W, H, px: c.width / W }));
    });
    return () => { weg = true; };
  }, [d, st, cssW, cssH, dpr, W, H]);

  const rel = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = ov.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / f, (e.clientY - r.top) / f];
  };
  const tol = 6 / f;
  const treffer = (x: number, y: number) => {
    if (!info) return null;
    for (const eid of trefferReihe(d.art)) {
      const b = info.boxes[eid];
      if (b && b[0] - tol <= x && x <= b[2] + tol && b[1] - tol <= y && y <= b[3] + tol) return eid;
    }
    return null;
  };
  const amGriff = (x: number, y: number) => { const b = info?.boxes.route; return !!b && Math.abs(x - b[2]) <= 14 / f && Math.abs(y - b[3]) <= 14 / f; };

  const runter = (e: React.PointerEvent) => {
    if (!info || e.button !== 0) return;
    ov.current?.focus();
    const [x, y] = rel(e);
    if (sel === "route" && amGriff(x, y)) {
      mut((s) => friereBox(s, info), false);
      zug.current = { modus: "resize", eid: "route", x, y, anker: null, box: [...info.boxes.route] as Box, start: st, bewegt: false };
      ov.current?.setPointerCapture(e.pointerId);
      return;
    }
    const eid = treffer(x, y);
    setSel(eid);
    if (!eid) return;
    mut((s) => {
      if (eid.startsWith("stat_")) friereStats(s, info, d.art);
      if (eid === "route") friereBox(s, info);
    }, false);
    const an = info.anchors[eid], bx = info.boxes[eid];
    if (!an || !bx) return;
    zug.current = { modus: "move", eid, x, y, anker: [...an] as [number, number], box: [...bx] as Box, start: st, bewegt: false };
    ov.current?.setPointerCapture(e.pointerId);
  };
  const bewegen = (e: React.PointerEvent) => {
    const z = zug.current;
    if (!z) return;
    const [x, y] = rel(e);
    z.bewegt = true;
    if (z.modus === "move" && z.anker) {
      // Einrasten in Bildschirmpixeln rechnen (gleich stark bei jeder Größe)
      const [dxc, dyc, g] = rasten(z.box.map((v) => v * f) as Box, (x - z.x) * f, (y - z.y) * f, cssW, cssH, e.shiftKey);
      const dx = dxc / f, dy = dyc / f;
      const ax = z.anker[0] + dx, ay = z.anker[1] + dy;
      mut((s) => { s.elements[z.eid].pos[formatVon(s.format).key] = [r5(ax / W), r5(ay / H)]; }, false);
      setZugBox({ eid: z.eid, box: [z.box[0] + dx, z.box[1] + dy, z.box[2] + dx, z.box[3] + dy] });
      setFuehrung(g.map(([a, v]) => [a, v / f]));
    } else {
      const b = z.box;
      const x1 = Math.max(b[0] + 0.06 * W, Math.min(W, x)), y1 = Math.max(b[1] + 0.04 * H, Math.min(H, y));
      mut((s) => {
        const el = s.elements.route, fk = formatVon(s.format).key;
        el.pos[fk] = [r5((b[0] + x1) / 2 / W), r5((b[1] + y1) / 2 / H)];
        el.box[fk] = [r5((x1 - b[0]) / W), r5((y1 - b[1]) / H)];
      }, false);
      setZugBox({ eid: "route", box: [b[0], b[1], x1, y1] });
    }
  };
  const hoch = () => {
    if (!zug.current) return;
    if (zug.current.bewegt) merken(zug.current.start);
    zug.current = null;
    setFuehrung([]); setZugBox(null);
  };
  const taste = (e: React.KeyboardEvent) => {
    if (!sel || !info) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); mut((s) => { s.elements[sel].visible = false; }); setSel(null); return; }
    const schritt = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
    if (!schritt || !info.anchors[sel]) return;
    e.preventDefault();
    const n = (e.shiftKey ? 10 : 1) / f;
    mut((s) => {
      if (sel.startsWith("stat_")) friereStats(s, info, d.art);
      else if (sel === "route") friereBox(s, info);
      else friereAnker(s, info, sel);
      const fk = formatVon(s.format).key;
      const cur = s.elements[sel].pos[fk];
      const [ax, ay] = cur ? [cur[0] * W, cur[1] * H] : info.anchors[sel];
      s.elements[sel].pos[fk] = [r5((ax + schritt[0] * n) / W), r5((ay + schritt[1] * n) / H)];
    });
  };

  const selBox = sel && info ? (zugBox?.eid === sel ? zugBox.box : info.boxes[sel] ?? null) : null;
  const css = (b: Box) => ({ left: b[0] * f, top: b[1] * f, width: (b[2] - b[0]) * f, height: (b[3] - b[1]) * f });
  return (
    <div className="tf-huelle" ref={huelle}>
      <div className={"tf-bild" + (st.bg === "Transparent" ? " schach" : "")} style={{ width: cssW, height: cssH }}>
        <canvas ref={canvas} style={{ width: cssW, height: cssH }} aria-label="Vorschau" />
        <div ref={ov} className="tf-ov" tabIndex={0} onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch} onKeyDown={taste}>
          {info && Object.entries(info.boxes).map(([eid, b]) => eid === sel ? null : <div key={eid} className="tf-box" style={css(b)} />)}
          {selBox && sel && (
            <>
              <div className="tf-sel" style={css(selBox)} />
              {sel === "route" && <div className="tf-griff" style={{ left: selBox[2] * f - 8, top: selBox[3] * f - 8 }} />}
              {!zugBox && (
                <button type="button" className="tf-x" aria-label={elementName(sel, d.art) + " ausblenden"} data-tipp="Ausblenden"
                  style={{ left: Math.max(2, Math.min(cssW - 28, selBox[2] * f - 13)), top: Math.max(2, Math.min(cssH - 28, selBox[1] * f - 13)) }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { const eid = sel; setSel(null); mut((s) => { s.elements[eid].visible = false; }); }}>×</button>
              )}
            </>
          )}
          {fuehrung.map(([a, v], i) => <div key={i} className={"tf-linie " + a} style={a === "v" ? { left: v * f } : { top: v * f }} />)}
        </div>
      </div>
    </div>
  );
}

/** Ausgeblendete Elemente als Chips zum Wiedereinblenden */
function Ausgeblendet({ d, st, mut }: { d: TeilDaten; st: TeilState; mut: Mut }) {
  const weg = elementeVon(d.art).filter((eid) => !st.elements[eid]?.visible && vorhanden(eid, d, { ...st, elements: { ...st.elements, [eid]: { ...st.elements[eid], visible: true } } }));
  if (!weg.length) return null;
  return <div className="tf-weg">{weg.map((eid) => <button key={eid} className="chip" onClick={() => mut((s) => { s.elements[eid].visible = true; })}>+ {elementName(eid, d.art)}</button>)}</div>;
}

const rundenName = (d: TeilDaten) => (d.kat === "Swim" ? "Bahnen" : "Runden");
const FORMAT_OPT = FORMATE.map((f) => [f.name, f.kurz] as [string, string]);
const BG_OPT: [Hintergrund, string][] = [["Transparent", "Transparent"], ["Dunkel", "Dunkel"], ["Hell", "Hell"]];

/** Stand mit Verlauf. Der aktuelle Stand liegt zusätzlich in einer Ref, damit Rückgängig und Wiederholen keine Nebenwirkungen
    im State-Updater brauchen (der läuft im StrictMode doppelt). */
function useMut<T>(start: () => T) {
  const [st, setSt] = useState<T>(start);
  const akt = useRef(st);
  const verlauf = useRef<{ zurueck: T[]; vor: T[] }>({ zurueck: [], vor: [] });
  const [, neuZeichnen] = useState(0);
  const setze = (s: T) => { akt.current = s; setSt(s); neuZeichnen((n) => n + 1); };
  const merken = (alt: T) => {
    verlauf.current.zurueck = [...verlauf.current.zurueck, alt].slice(-80);
    verlauf.current.vor = [];
    neuZeichnen((n) => n + 1);
  };
  const mut: MutVon<T> = (fn, schritt = true) => {
    const alt = akt.current, neu = klon(alt);
    fn(neu);
    if (JSON.stringify(neu) === JSON.stringify(alt)) return;
    if (schritt) merken(alt);
    setze(neu);
  };
  const zurueck = () => { const v = verlauf.current.zurueck.pop(); if (!v) return; verlauf.current.vor.push(akt.current); setze(v); };
  const vor = () => { const v = verlauf.current.vor.pop(); if (!v) return; verlauf.current.zurueck.push(akt.current); setze(v); };
  /** Neuer Stand von außen (Vorlage, Standard geladen), als ein Schritt */
  const setzen = (s: T) => { merken(akt.current); setze(s); };
  /** Ohne Verlauf ersetzen (erstes Laden) */
  const ersetzen = (s: T) => { verlauf.current = { zurueck: [], vor: [] }; setze(s); };
  return { st, mut, zurueck, vor, setzen, ersetzen, merken, verlauf };
}

/** Strg+Z / Strg+Umschalt+Z / Strg+Y (nicht in Eingabefeldern) */
function useRueckgaengig(zurueck: () => void, vor: () => void) {
  const r = useRef({ zurueck, vor });
  r.current = { zurueck, vor };
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      const ziel = e.target as HTMLElement | null;
      if (ziel && (ziel.tagName === "INPUT" || ziel.tagName === "TEXTAREA")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.stopPropagation(); (e.shiftKey ? r.current.vor : r.current.zurueck)(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); e.stopPropagation(); r.current.vor(); }
    };
    window.addEventListener("keydown", t, true);
    return () => window.removeEventListener("keydown", t, true);
  }, []);
}

/* ---------- Bausteine des Panels ---------- */

function Regler({ label, wert, min, max, schritt, onChange, format }: { label: string; wert: number; min: number; max: number; schritt: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="st-regler">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={schritt} value={wert} onChange={(e) => onChange(Number(e.target.value))} />
      <b>{format ? format(wert) : wert}</b>
    </label>
  );
}
function Farbwahl({ wert, onChange, auto }: { wert: string | null; onChange: (v: string | null) => void; auto?: boolean }) {
  const [text, setText] = useState(wert ?? "");
  useEffect(() => setText(wert ?? ""), [wert]);
  return (
    <div className="st-farben">
      {auto && <button className={"st-farbe auto" + (wert === null ? " an" : "")} aria-pressed={wert === null} onClick={() => onChange(null)}>Auto</button>}
      {[...AKZENTE, "#101114"].map((c) => (
        <button key={c} className={"st-farbe" + (wert?.toLowerCase() === c ? " an" : "")} style={{ background: c }} aria-label={c} aria-pressed={wert?.toLowerCase() === c} onClick={() => onChange(c)} />
      ))}
      <input className="inp st-hex" value={text} placeholder="#hex" maxLength={7} onChange={(e) => { setText(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase()); }} />
    </div>
  );
}

function BildPanel({ d, st, mut, setSel, setzen }: { d: TeilDaten; st: TeilState; mut: Mut; setSel: (e: string) => void; setzen: (s: TeilState) => void }) {
  return (
    <>
      <Gruppe titel="Bild">
        <Seg klein wert={st.format} optionen={FORMAT_OPT} onChange={(v) => mut((s) => { s.format = v; })} />
        <Seg klein wert={st.bg} optionen={BG_OPT} onChange={(v) => mut((s) => { s.bg = v; })} />
        <div className="st-zeile"><span>Schatten</span>
          <Seg klein wert={st.shadow} optionen={[["Auto", "Auto"], ["Ein", "Ein"], ["Aus", "Aus"]] as [Schatten, string][]} onChange={(v) => mut((s) => { s.shadow = v; })} />
        </div>
        {d.punkte.length >= 2 && d.runden.length >= 2 && (
          <div className="st-zeile"><span>Grafik</span>
            <Seg klein wert={st.grafik ?? "auto"} optionen={[["auto", "Auto"], ["route", "Route"], ["runden", rundenName(d)]] as [Grafik, string][]} onChange={(v) => mut((s) => { s.grafik = v; })} />
          </div>
        )}
        <div className="st-zeile"><span>Akzent</span></div>
        <Farbwahl wert={st.accent} onChange={(v) => v && mut((s) => { s.accent = v; })} />
        <label className="st-feld"><span>Titel</span><input className="inp" value={st.texts.title} placeholder={d.name} onChange={(e) => mut((s) => { s.texts.title = e.target.value; }, false)} /></label>
        <label className="st-feld"><span>Branding</span><input className="inp" value={st.brand} placeholder="z. B. dein Name" onChange={(e) => { const v = e.target.value; mut((s) => { s.brand = v; if (v.trim()) s.elements.brand.visible = true; }, false); }} /></label>
        <div className="st-feld"><span>Sportart</span>
          <Auswahl label="Sportart" value={st.texts.sport} onChange={(v) => mut((s) => { s.texts.sport = v; })} options={SPORT_WAHL.map((x) => ({ value: x, label: x === "Auto" ? "Aus der Aktivität" : x }))} />
        </div>
      </Gruppe>
      <Gruppe titel="Elemente">
        <ul className="st-elemente">
          {elementeVon(d.art).map((eid) => {
            const da = vorhanden(eid, d, { ...st, elements: { ...st.elements, [eid]: { ...st.elements[eid], visible: true } } });
            const an = st.elements[eid]?.visible;
            return (
              <li key={eid} className={da ? "" : "leer"}>
                <button className="st-auge" aria-pressed={an} aria-label={an ? "Ausblenden" : "Einblenden"} data-tipp={an ? "Ausblenden" : "Einblenden"} onClick={() => mut((s) => { s.elements[eid].visible = !an; })}>
                  <Sym n={an ? "auge" : "augezu"} />
                </button>
                <button className="st-name" onClick={() => setSel(eid)}>{elementName(eid, d.art)}<Sym n="pfeil" /></button>
              </li>
            );
          })}
        </ul>
        <div className="st-reihe">
          <button className="btn ghost small" disabled={!verschoben(st)} onClick={() => mut(ausrichten)}><Sym n="zauber" />Automatisch ausrichten</button>
          <button className="btn ghost small" onClick={() => setzen({ ...standardState(d.art), texts: st.texts })}>Alles zurücksetzen</button>
        </div>
      </Gruppe>
      <Vorlagen st={st} setzen={setzen} />
    </>
  );
}

function ElementPanel({ d, st, mut, eid, onZu }: { d: TeilDaten; st: TeilState; mut: Mut; eid: string; onZu: () => void }) {
  const e = st.elements[eid];
  const set = (p: Partial<El>, schritt = true) => mut((s) => { Object.assign(s.elements[eid], p); }, schritt);
  const istGrafik = eid === "route";
  const grafik = grafikVon(st, d);
  const zweiFarben = eid.startsWith("stat_") || eid === "liste";
  return (
    <Gruppe titel={elementName(eid, d.art)} aktion={<button className="btn ghost small" onClick={onZu}><Sym n="links" />Alle</button>}>
      <Schalter an={e.visible} onChange={(v) => set({ visible: v })} label="Sichtbar" />
      {!istGrafik && (
        <>
          <div className="st-feld"><span>Schrift</span>
            <Auswahl label="Schrift" value={e.font ?? ""} onChange={(v) => set({ font: v || null })} options={SCHRIFTEN.map((x) => ({ value: x.wert ?? "", label: x.label }))} />
          </div>
          <Schalter an={e.bold} onChange={(v) => set({ bold: v })} label="Fett" />
          <div className="st-zeile"><span>Ausrichtung</span>
            <Seg klein wert={e.align} optionen={[["left", "Links"], ["center", "Mitte"], ["right", "Rechts"]] as [El["align"], string][]} onChange={(v) => set({ align: v })} />
          </div>
          <Regler label="Kontur" wert={e.stroke} min={0} max={3} schritt={0.25} onChange={(v) => set({ stroke: v }, false)} format={(v) => v.toLocaleString("de-DE")} />
        </>
      )}
      {(!istGrafik || grafik === "runden") && <Regler label={istGrafik ? "Schrift der Werte" : "Größe"} wert={e.size} min={0.5} max={2.5} schritt={0.05} onChange={(v) => set({ size: v }, false)} format={(v) => Math.round(v * 100) + " %"} />}
      <Regler label="Deckkraft" wert={e.alpha} min={10} max={100} schritt={5} onChange={(v) => set({ alpha: v }, false)} format={(v) => v + " %"} />
      <div className="st-zeile"><span>{zweiFarben ? "Farbe (Wert)" : "Farbe"}</span></div>
      <Farbwahl wert={e.color} onChange={(v) => set({ color: v })} auto />
      {zweiFarben && <><div className="st-zeile"><span>Farbe (Beschriftung)</span></div><Farbwahl wert={e.color2} onChange={(v) => set({ color2: v })} auto /></>}
      {istGrafik && grafik === "route" && (
        <>
          <Regler label="Linienbreite" wert={e.line_w} min={0.4} max={3} schritt={0.05} onChange={(v) => set({ line_w: v }, false)} format={(v) => Math.round(v * 100) + " %"} />
          <Regler label="Leuchten" wert={e.glow} min={0} max={1.6} schritt={0.05} onChange={(v) => set({ glow: v }, false)} format={(v) => Math.round(v * 100) + " %"} />
          <Schalter an={e.markers} onChange={(v) => set({ markers: v })} label="Start und Ziel markieren" />
        </>
      )}
      {istGrafik && grafik === "runden" && <Schalter an={e.werte !== false} onChange={(v) => set({ werte: v })} label="Werte an den Balken" />}
      <div className="st-reihe">
        <button className="btn ghost small" onClick={() => mut((s) => { const fk = formatVon(s.format).key; delete s.elements[eid].pos[fk]; delete s.elements[eid].box[fk]; })}>Position zurücksetzen</button>
        <button className="btn ghost small" onClick={() => mut((s) => { const v = s.elements[eid].visible; s.elements[eid] = { ...standardElement(eid), visible: v }; })}>Element zurücksetzen</button>
      </div>
    </Gruppe>
  );
}

/** Eigene Vorlagen (in den Einstellungen des Dashboards) und die Presets aus dem Share Studio */
function Vorlagen({ st, setzen }: { st: TeilState; setzen: (s: TeilState) => void }) {
  const [v, setV] = useState<{ eigen: Record<string, unknown>; presets: string[] }>({ eigen: {}, presets: [] });
  const [name, setName] = useState("");
  const [fehler, setFehler] = useState("");
  const laden = () => rpc<{ eigen: Record<string, unknown>; presets: string[] }>("vorlagen").then(setV).catch(() => undefined);
  useEffect(() => { void laden(); }, []);
  const anwenden = (roh: unknown) => setzen({ ...normalisieren(roh, "ausdauer"), texts: st.texts });
  const speichern = async () => {
    const n = name.trim();
    if (!n) return;
    const { texts: _t, ...ohneTexte } = st;
    void _t;
    try { await rpc("vorlage_speichern", { name: n, design: ohneTexte }); setName(""); setFehler(""); void laden(); } catch (e) { setFehler((e as Error).message); }
  };
  const eigen = Object.keys(v.eigen).sort((a, b) => a.localeCompare(b, "de"));
  return (
    <Gruppe titel="Vorlagen">
      {eigen.length > 0 && (
        <div className="st-vorlagen">
          {eigen.map((n) => (
            <span key={n} className="st-vorlage">
              <button className="chip" onClick={() => anwenden(v.eigen[n])}>{n}</button>
              <button className="btn ghost sq klein" aria-label={n + " löschen"} data-tipp="Löschen" onClick={() => void rpc("vorlage_loeschen", { name: n }).then(laden)}>×</button>
            </span>
          ))}
        </div>
      )}
      {v.presets.length > 0 && (
        <>
          <span className="muted small">Aus dem Share Studio</span>
          <div className="st-vorlagen">
            {v.presets.map((n) => <button key={n} className="chip" onClick={() => void rpc<{ design: unknown }>("vorlage_laden", { preset: n }).then((r) => anwenden(r.design)).catch((e) => setFehler((e as Error).message))}>{n}</button>)}
          </div>
        </>
      )}
      <div className="st-reihe">
        <input className="inp" value={name} placeholder="Name der Vorlage" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void speichern(); }} />
        <button className="btn small" disabled={!name.trim()} onClick={() => void speichern()}>Speichern</button>
      </div>
      {fehler && <div className="small bad">{fehler}</div>}
    </Gruppe>
  );
}

/** Fortschritt einer längeren Arbeit (Video, viele Bilder) */
function Arbeit({ titel, anteil, text, onAbbrechen }: { titel: string; anteil: number; text: string; onAbbrechen?: () => void }) {
  return (
    <Modal titel={titel} size="schmal" foot={onAbbrechen ? <button className="btn" onClick={onAbbrechen}>Abbrechen</button> : undefined}>
      <div className="st-arbeit">
        <div className="balken"><i style={{ width: `${Math.round(anteil * 100)}%`, background: "var(--accent)" }} /></div>
        <span className="muted">{text}</span>
      </div>
    </Modal>
  );
}

/* ---------- Schnellvorschau an der Einheit ---------- */

export function TeilenSchnell({ a, onClose, onStudio }: { a: Akt; onClose: () => void; onStudio: (st: TeilState) => void }) {
  const d = useTeilDaten(a);
  const [basis, setBasis] = useEinzelBasis();
  const { st, mut, zurueck, vor, merken, ersetzen, verlauf } = useMut<TeilState>(() => klon(basis ?? standardState("ausdauer")));
  const geladen = useRef(!!basis);
  useEffect(() => { if (basis && !geladen.current) { geladen.current = true; ersetzen(klon(basis)); } }, [basis]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; fehler?: boolean } | null>(null);
  useRueckgaengig(zurueck, vor);
  const geaendert = !!basis && JSON.stringify(st) !== JSON.stringify(basis);
  const alsStandard = async () => {
    try { await rpc("einzel_speichern", { design: st }); setBasis(st); setMeldung({ text: "Als Standard gespeichert" }); } catch (e) { setMeldung({ text: (e as Error).message, fehler: true }); }
  };
  const raus = async (art: "speichern" | "kopieren") => {
    if (!d) return;
    setLaeuft(true); setMeldung(null);
    try {
      if (art === "kopieren") { await kopieren(alsPng(d, st)); setMeldung({ text: "Bild kopiert" }); }
      else { const p = await ablegen(await alsPng(d, st), bildName(d, st)); if (p) setMeldung({ text: "Gespeichert: " + p }); }
    } catch (e) { setMeldung({ text: (e as Error).message, fehler: true }); } finally { setLaeuft(false); }
  };
  return (
    <Modal titel="Teilen" onClose={onClose}
      foot={<>
        <button className="btn" onClick={() => onStudio(st)}><Sym n="stift" />Studio …</button>
        <span className="grow" />
        {meldung && <span className={`small ${meldung.fehler ? "bad" : "muted"} ts-meldung`}>{meldung.text}</span>}
        {geaendert && <button className="btn ghost" onClick={() => void alsStandard()}>Als Standard</button>}
        <button className="btn sq" disabled={laeuft || !d} onClick={() => void raus("kopieren")} aria-label="In die Zwischenablage" data-tipp="In die Zwischenablage"><Sym n="kopieren" /></button>
        <button className="btn primary" disabled={laeuft || !d} onClick={() => void raus("speichern")}><Sym n="download" />PNG speichern …</button>
      </>}>
      <div className="teilen-schnell">
        {d ? <TeilFlaeche d={d} st={st} mut={mut} merken={merken} sel={sel} setSel={setSel} /> : <div className="tf-huelle"><span className="muted">Lädt …</span></div>}
        <div className="ts-seite">
          <div className="ts-werkzeug">
            <button className="btn sq" disabled={!verlauf.current.zurueck.length} onClick={() => { setSel(null); zurueck(); }} aria-label="Rückgängig" data-tipp="Rückgängig"><Sym n="rueck" /></button>
            <button className="btn sq" disabled={!verlauf.current.vor.length} onClick={() => { setSel(null); vor(); }} aria-label="Wiederholen" data-tipp="Wiederholen"><Sym n="vor" /></button>
            <button className="btn small grow" disabled={!verschoben(st)} onClick={() => { setSel(null); mut(ausrichten); }}><Sym n="zauber" />Automatisch ausrichten</button>
          </div>
          <Seg klein wert={st.format} optionen={FORMAT_OPT} onChange={(v) => mut((s) => { s.format = v; })} />
          <Seg klein wert={st.bg} optionen={BG_OPT} onChange={(v) => mut((s) => { s.bg = v; })} />
          {d && d.punkte.length >= 2 && d.runden.length >= 2 && (
            <Seg klein wert={grafikVon(st, d) === "runden" ? "runden" : "route"} optionen={[["route", "Route"], ["runden", rundenName(d)]] as ["route" | "runden", string][]} onChange={(v) => mut((s) => { s.grafik = v; })} />
          )}
          <div className="st-feld"><span>Akzent</span><Farbwahl wert={st.accent} onChange={(v) => v && mut((s) => { s.accent = v; })} /></div>
          <label className="st-feld"><span>Branding</span>
            <input className="inp" value={st.brand} placeholder="z. B. dein Name" onChange={(e) => { const v = e.target.value; mut((s) => { s.brand = v; if (v.trim()) s.elements.brand.visible = true; }, false); }} />
          </label>
          {sel && d && (
            <div className="ts-auswahl">
              <b>{elementName(sel, d.art)}</b>
              <span className="grow" />
              <button className="btn small" onClick={() => { mut((s) => { s.elements[sel].visible = false; }); setSel(null); }}><Sym n="augezu" />Ausblenden</button>
            </div>
          )}
          {d && <Ausgeblendet d={d} st={st} mut={mut} />}
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Studio ---------- */

export function Studio({ akts, start, onClose }: { akts: Akt[]; start: StudioStart; onClose: () => void }) {
  // nur Einheiten, die es im Studio gibt (ohne Krafttraining)
  const [auswahl, setAuswahl] = useState<string[]>(() => start.ids.filter((id) => akts.some((a) => a.id === id)));
  const [modus, setModus] = useState<StudioModus>(start.modus ?? (start.ids.length === 1 ? "einzeln" : "sammel"));
  const [aktivId, setAktivId] = useState(start.aktiv ?? start.ids[0] ?? "");
  const [wahl, setWahl] = useState(false);
  const einzeln = modus === "einzeln";
  const aktivAkt = useMemo(() => akts.find((a) => a.id === (auswahl.includes(aktivId) ? aktivId : auswahl[0])), [akts, auswahl, aktivId]);
  const daten = useTeilDaten(aktivAkt);

  const [basis, setBasis] = useEinzelBasis();
  const ein = useMut<TeilState>(() => klon(start.entwurf ?? basis ?? standardState("ausdauer")));
  const geladen = useRef(!!start.entwurf || !!basis);
  useEffect(() => { if (basis && !geladen.current) { geladen.current = true; ein.ersetzen(klon(basis)); } }, [basis]); // eslint-disable-line react-hooks/exhaustive-deps

  const [sammelBasis, setSammelBasis] = useState<SammelState>(() => sammelNormalisieren(null));
  const sm = useMut<SammelState>(() => sammelNormalisieren(null));
  const [routen, setRouten] = useState<Map<string, string> | null>(null);
  const [musik, setMusik] = useState<Musik[]>([]);
  useEffect(() => {
    rpc<{ routen: [string, string, Kat, string, string][] }>("karte", { virtuell: true }).then((r) => setRouten(new Map(r.routen.map((x) => [x[0], x[1]])))).catch(() => setRouten(new Map()));
    rpc<{ design: unknown }>("sammel_design").then((r) => { const s = sammelNormalisieren(r.design); setSammelBasis(s); sm.ersetzen(klon(s)); }).catch(() => undefined);
    void musikDa().then(setMusik);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const E = useMemo<SammelEinheit[] | null>(() => {
    if (!routen) return null;
    const ids = new Set(auswahl);
    return akts.filter((a) => ids.has(a.id)).map((a) => ({
      id: a.id, datum: a.d.slice(0, 16), kat: a.k, name: a.n, distanz: a.m, zeit: a.t, hoehe: a.e, punkte: polylinePunkte(routen.get(a.id)),
    })).sort((x, y) => x.datum.localeCompare(y.datum));
  }, [auswahl, akts, routen]);

  const [sel, setSel] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [arbeit, setArbeit] = useState<{ titel: string; anteil: number; text: string; ab?: AbortController } | null>(null);
  const [ergebnis, setErgebnis] = useState<{ text: string; ordner?: string; fehler?: boolean } | null>(null);
  const [fragen, setFragen] = useState(false);
  const einzelGeaendert = !!basis && JSON.stringify(ein.st) !== JSON.stringify(basis);
  const sammelGeaendert = JSON.stringify(sm.st) !== JSON.stringify(sammelBasis);
  const geaendert = einzelGeaendert || sammelGeaendert;
  const kannVideo = videoMoeglich();

  const stand = useRef({ modus });
  stand.current = { modus };
  // Rückgängig gilt für das, was gerade zu sehen ist
  useRueckgaengig(() => (stand.current.modus === "einzeln" ? ein.zurueck() : sm.zurueck()), () => (stand.current.modus === "einzeln" ? ein.vor() : sm.vor()));
  const zurueckGehen = () => (geaendert ? setFragen(true) : onClose());
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !wahl && !arbeit && !fragen) { e.stopPropagation(); zurueckGehen(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  });

  const speichern = async () => {
    try {
      if (einzelGeaendert) { await rpc("einzel_speichern", { design: ein.st }); setBasis(ein.st); }
      if (sammelGeaendert) { await rpc("sammel_speichern", { design: sm.st }); setSammelBasis(klon(sm.st)); }
      setErgebnis({ text: "Als Standard gespeichert" });
      return true;
    } catch (e) { setErgebnis({ text: (e as Error).message, fehler: true }); return false; }
  };
  const ordnerVon = (p: string) => p.replace(/[\\/][^\\/]*$/, "");
  const raus = async (art: "speichern" | "kopieren") => {
    setLaeuft(true); setErgebnis(null);
    try {
      if (einzeln) {
        if (!daten) return;
        if (art === "kopieren") { await kopieren(alsPng(daten, ein.st)); setErgebnis({ text: "Bild kopiert" }); }
        else { const p = await ablegen(await alsPng(daten, ein.st), bildName(daten, ein.st)); if (p) setErgebnis({ text: "Gespeichert: " + p, ordner: ordnerVon(p) }); }
      } else if (E) {
        if (art === "kopieren") { await kopieren(sammelPng(E, sm.st)); setErgebnis({ text: "Bild kopiert" }); }
        else { const p = await ablegen(await sammelPng(E, sm.st), sammelName(E, sm.st, "png")); if (p) setErgebnis({ text: "Gespeichert: " + p, ordner: ordnerVon(p) }); }
      }
    } catch (e) { setErgebnis({ text: (e as Error).message, fehler: true }); } finally { setLaeuft(false); }
  };
  /** Alle gewählten Einheiten als Einzelbilder mit dem Design im Studio (Titel und Sportart je Einheit automatisch) in einen Ordner */
  const alleAlsBilder = async () => {
    const ab = new AbortController();
    const liste = akts.filter((a) => auswahl.includes(a.id)).sort((x, y) => (x.d < y.d ? -1 : 1));
    setErgebnis(null);
    setArbeit({ titel: "Bilder werden erstellt", anteil: 0, text: "0 von " + liste.length, ab });
    try {
      const s: TeilState = { ...ein.st, texts: { ...ein.st.texts, title: "", sport: "Auto" } };
      const gruppe = "bilder" + Date.now().toString(36);
      const namen: string[] = [];
      for (const [i, a] of liste.entries()) {
        if (ab.signal.aborted) return;
        const d = await datenVon(a, s.grafik === "runden");
        let name = bildName(d, s);
        for (let k = 2; namen.includes(name); k++) name = bildName(d, s).replace(/\.png$/, ` (${k}).png`);
        await hochladen(gruppe, await alsPng(d, s), name);
        namen.push(name);
        setArbeit((x) => (x ? { ...x, anteil: (i + 1) / liste.length, text: i + 1 + " von " + liste.length } : x));
      }
      setArbeit(null);
      const r = await rpc<{ abgebrochen: boolean; ordner?: string; anzahl?: number }>("teilen_ablegen_ordner", { gruppe, namen });
      if (!r.abgebrochen) setErgebnis({ text: `${r.anzahl} Bilder gespeichert: ${r.ordner}`, ordner: r.ordner });
    } catch (e) { setErgebnis({ text: (e as Error).message, fehler: true }); } finally { setArbeit(null); }
  };
  const videoErstellen = async () => {
    if (!E) return;
    const ab = new AbortController();
    setErgebnis(null);
    setArbeit({ titel: "Video wird aufgenommen", anteil: 0, text: "Fenster bitte offen lassen", ab });
    try {
      await sammelSchriften();
      const s = videoStand(sm.st);
      const { W, H } = sammelGroesse(s);
      const { plan, spur } = tonspur(E, s);
      const { blob, endung } = await videoAufnehmen((g, t) => zeichneSammel(g, E, s, { W, H }, t, plan), W, H, spur,
        (x) => setArbeit((y) => (y ? { ...y, anteil: x } : y)), ab.signal);
      setArbeit(null);
      const p = await ablegen(blob, sammelName(E, s, endung));
      if (p) setErgebnis({ text: "Gespeichert: " + p, ordner: ordnerVon(p) });
    } catch (e) { if ((e as Error).name !== "AbortError") setErgebnis({ text: (e as Error).message, fehler: true }); } finally { setArbeit(null); }
  };

  const untertitel = einzeln ? (daten ? daten.name : auswahl.length ? "Lädt …" : "Keine Einheit gewählt")
    : E ? (sm.st.titel.trim() || autoTitel(E.map((e) => e.datum)) || "Keine Einheit") + " · " + E.length + (E.length === 1 ? " Einheit" : " Einheiten") : "Lädt …";
  const hatBild = einzeln ? !!daten : !!E?.length;
  const zur = einzeln ? ein : sm;

  return (
    <div className="studio">
      <header className="studio-kopf">
        <button className="btn ghost sq" onClick={zurueckGehen} aria-label="Zurück" data-tipp="Zurück"><Sym n="links" /></button>
        <div className="grow"><b>Share Studio</b><span className="muted">{untertitel}</span></div>
        <button className="btn ghost sq" disabled={!zur.verlauf.current.zurueck.length} onClick={() => { setSel(null); zur.zurueck(); }} aria-label="Rückgängig" data-tipp="Rückgängig"><Sym n="rueck" /></button>
        <button className="btn ghost sq" disabled={!zur.verlauf.current.vor.length} onClick={() => { setSel(null); zur.vor(); }} aria-label="Wiederholen" data-tipp="Wiederholen"><Sym n="vor" /></button>
        <button className="btn" disabled={!geaendert} onClick={() => void speichern()}>Als Standard</button>
        {hatBild && modus !== "video" && <button className="btn sq" disabled={laeuft} onClick={() => void raus("kopieren")} aria-label="In die Zwischenablage" data-tipp="In die Zwischenablage"><Sym n="kopieren" /></button>}
        {modus !== "video" && <button className="btn primary" disabled={!hatBild || laeuft} onClick={() => void raus("speichern")}><Sym n="download" />PNG speichern …</button>}
        {modus === "video" && <button className="btn primary" disabled={!hatBild || !!arbeit || !kannVideo} onClick={() => void videoErstellen()}><Sym n="play" />Video erstellen …</button>}
      </header>
      <div className="studio-inhalt">
        <div className="studio-buehne">
          {einzeln ? (daten ? <TeilFlaeche d={daten} st={ein.st} mut={ein.mut} merken={ein.merken} sel={sel} setSel={setSel} /> : <div className="tf-huelle"><span className="muted">{auswahl.length ? "Lädt …" : "Keine Einheit gewählt"}</span></div>)
            : E ? <SammelFlaeche E={E} st={sm.st} video={modus === "video"} ruhe={!!arbeit} /> : <div className="tf-huelle"><span className="muted">Lädt …</span></div>}
        </div>
        <aside className="studio-panel">
          <Seg wert={modus} optionen={[["einzeln", "Einzeln"], ["sammel", "Sammelbild"], ["video", "Video"]]} onChange={(v) => { setSel(null); setModus(v); }} />
          <EinheitenKurz akts={akts} auswahl={auswahl} aktiv={einzeln ? aktivAkt?.id : undefined} onAktiv={einzeln ? (x) => { setSel(null); setAktivId(x); } : undefined}
            onWeg={(x) => setAuswahl(auswahl.filter((y) => y !== x))} onWaehlen={() => setWahl(true)}
            aktion={einzeln && auswahl.length > 1 && <button className="btn small" disabled={!!arbeit} onClick={() => void alleAlsBilder()}><Sym n="download" />Alle {auswahl.length} als Bilder …</button>} />
          {ergebnis && (
            <div className={`st-ergebnis${ergebnis.fehler ? " fehler" : ""}`}>
              <span className="grow">{ergebnis.text}</span>
              {ergebnis.ordner && <button className="btn small" onClick={() => void rpc("teilen_ordner", { pfad: ergebnis.ordner })}>Ordner</button>}
            </div>
          )}
          {einzeln ? daten && (sel ? <ElementPanel d={daten} st={ein.st} mut={ein.mut} eid={sel} onZu={() => setSel(null)} /> : <BildPanel d={daten} st={ein.st} mut={ein.mut} setSel={setSel} setzen={ein.setzen} />)
            : E && <SammelPanel st={sm.st} mut={sm.mut} video={modus === "video"} E={E} musik={musik} kannVideo={kannVideo} farbwahl={(w, f) => <Farbwahl wert={w} onChange={(v) => v && f(v)} />} />}
        </aside>
      </div>
      {wahl && <EinheitenWahl akts={akts} auswahl={auswahl} onUebernehmen={(x) => { setAuswahl(x); setSel(null); }} onClose={() => setWahl(false)} />}
      {arbeit && <Arbeit titel={arbeit.titel} anteil={arbeit.anteil} text={arbeit.text} onAbbrechen={arbeit.ab ? () => arbeit.ab!.abort() : undefined} />}
      {fragen && (
        <Modal titel="Design als Standard behalten?" size="schmal" onClose={() => setFragen(false)}
          foot={<>
            <button className="btn ghost" onClick={onClose}>Verwerfen</button><span className="grow" />
            <button className="btn" onClick={() => setFragen(false)}>Abbrechen</button>
            <button className="btn primary" onClick={() => void speichern().then((ok) => { if (ok) onClose(); })}>Als Standard speichern</button>
          </>}>
          Du hast das Design geändert. Soll es künftig der Standard sein?
        </Modal>
      )}
    </div>
  );
}
