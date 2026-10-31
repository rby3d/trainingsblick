/* Studio mit mehreren Einheiten (wie Formkurve ui/TeilenMehr.tsx): Einheiten wählen (Woche, Monat, Jahr; Umschalt-Klick für Bereiche),
   Kurzliste im Panel, Sammelbild/Video als Vorschau und das Panel dazu. */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Seg } from "../komp";
import { Modal } from "../ui";
import { SportSym } from "../symbole";
import { Akt, KAT_NAME, KATS, Kat } from "../util";
import { sammelGroesse, sammelSchriften, zeichneSammel } from "../sammel/bild";
import { ABSTAND_MIN, addTage, FORMATE, iso, kachelnVon, kurz, kw, montag, MONATE, parse, WT, wochentag, zeitplan } from "../sammel/logik";
import type { EndTon, Effekt, FormatKey, Musik, RoutenTon, SammelEinheit, SammelState } from "../sammel/logik";
import { abspielen } from "../sammel/video";
import type { Tonspur } from "../sammel/video";

const tagVon = (a: Akt) => a.d.slice(0, 10);
const km = (m: number) => (m / 1000).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " km";
const dauer = (s: number) => (s >= 3600 ? Math.floor(s / 3600) + ":" + String(Math.floor((s % 3600) / 60)).padStart(2, "0") + " h" : Math.round(s / 60) + " min");
export const aktText = (a: Akt) => WT[wochentag(tagVon(a))] + " " + kurz(tagVon(a)) + " · " + (a.m > 0 ? km(a.m) + " · " : "") + dauer(a.t);

/* ---------- Einheiten wählen ---------- */

type Spanne = "woche" | "monat" | "jahr";
function zeitraum(spanne: Spanne, bezug: string): [string, string, string] {
  if (spanne === "woche") { const mo = montag(bezug); return [mo, addTage(mo, 6), "KW " + kw(mo) + " · " + kurz(mo) + "–" + kurz(addTage(mo, 6))]; }
  const d = parse(bezug);
  if (spanne === "jahr") return [d.getFullYear() + "-01-01", d.getFullYear() + "-12-31", String(d.getFullYear())];
  const von = iso(new Date(d.getFullYear(), d.getMonth(), 1));
  return [von, addTage(iso(new Date(d.getFullYear(), d.getMonth() + 1, 1)), -1), MONATE[d.getMonth()] + " " + d.getFullYear()];
}

export function EinheitenWahl({ akts, auswahl, onUebernehmen, onClose }: { akts: Akt[]; auswahl: string[]; onUebernehmen: (ids: string[]) => void; onClose: () => void }) {
  const [sel, setSel] = useState<string[]>(auswahl);
  const [spanne, setSpanne] = useState<Spanne>("woche");
  const [bezug, setBezug] = useState(() => { const neueste = akts.filter((a) => auswahl.includes(a.id)).map(tagVon).sort().pop(); return neueste ?? iso(new Date()); });
  const [sport, setSport] = useState<"alle" | Kat>("alle");
  const [von, bis, label] = zeitraum(spanne, bezug);
  const heute = iso(new Date());
  const sichtbar = akts.filter((a) => tagVon(a) >= von && tagVon(a) <= bis && (sport === "alle" || a.k === sport)).sort((x, y) => (x.d < y.d ? 1 : -1));
  const alleDa = sichtbar.length > 0 && sichtbar.every((a) => sel.includes(a.id));
  const weiter = (n: number) => setBezug(spanne === "woche" ? addTage(bezug, 7 * n)
    : (() => { const d = parse(bezug); return spanne === "jahr" ? iso(new Date(d.getFullYear() + n, 0, 1)) : iso(new Date(d.getFullYear(), d.getMonth() + n, 1)); })());
  // Umschalt-Klick: alles zwischen dem zuletzt angeklickten und diesem Eintrag bekommt denselben Stand wie dieser
  const letzter = useRef<string | null>(null);
  const klick = (a: Akt, umschalt: boolean) => {
    const an = !sel.includes(a.id);
    const i = sichtbar.findIndex((x) => x.id === a.id), j = sichtbar.findIndex((x) => x.id === letzter.current);
    const bereich = umschalt && j >= 0 ? sichtbar.slice(Math.min(i, j), Math.max(i, j) + 1).map((x) => x.id) : [a.id];
    setSel(an ? [...new Set([...sel, ...bereich])] : sel.filter((x) => !bereich.includes(x)));
    letzter.current = a.id;
  };
  return (
    <Modal titel="Einheiten wählen" size="breit" onClose={onClose}
      foot={<>
        <span className="muted small">{sel.length} gewählt</span>
        {sel.length > 0 && <button className="btn ghost small" onClick={() => setSel([])}>Keine</button>}
        <span className="grow" />
        <button className="btn" onClick={onClose}>Abbrechen</button>
        <button className="btn primary" onClick={() => { onUebernehmen(sel); onClose(); }}>Übernehmen</button>
      </>}>
      <div className="sm-wahl-kopf">
        <Seg klein wert={spanne} optionen={[["woche", "Woche"], ["monat", "Monat"], ["jahr", "Jahr"]]} onChange={setSpanne} />
        <span className="grow" />
        <button className="btn sq" aria-label="Früher" onClick={() => weiter(-1)}>‹</button>
        <b className="sm-wahl-titel">{label}</b>
        <button className="btn sq" aria-label="Später" disabled={bis >= heute} onClick={() => weiter(1)}>›</button>
      </div>
      <div className="tl-chips">
        <button className="chip" aria-pressed={sport === "alle"} onClick={() => setSport("alle")}>Alle</button>
        {KATS.map((k) => <button key={k} className="chip" aria-pressed={sport === k} onClick={() => setSport(k)}>{KAT_NAME[k]}</button>)}
        <span className="grow" />
        {sichtbar.length > 0 && (
          <button className="btn ghost small" onClick={() => setSel(alleDa ? sel.filter((x) => !sichtbar.some((a) => a.id === x)) : [...new Set([...sel, ...sichtbar.map((a) => a.id)])])}>
            {alleDa ? "Keine aus diesem Zeitraum" : "Alle aus diesem Zeitraum"}
          </button>
        )}
      </div>
      <div className="sm-wahl-liste">
        {sichtbar.length === 0 && <div className="leer">Keine Einheiten in diesem Zeitraum</div>}
        {sichtbar.map((a) => {
          const an = sel.includes(a.id);
          return (
            <button key={a.id} className={`sm-wahl-zeile${an ? " an" : ""}`} aria-pressed={an} onClick={(e) => klick(a, e.shiftKey)}
              onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); /* kein Markieren von Text beim Umschalt-Klick */ }}>
              <span className="sm-haken">{an ? "✓" : ""}</span>
              <SportSym k={a.k} klein />
              <b className="grow">{a.n}</b>
              <span className="muted small mono">{aktText(a)}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

/** Kurzliste der gewählten Einheiten im Panel; im Modus Einzeln ist eine davon aktiv */
export function EinheitenKurz({ akts, auswahl, aktiv, onAktiv, onWeg, onWaehlen, aktion }: {
  akts: Akt[]; auswahl: string[]; aktiv?: string; onAktiv?: (id: string) => void; onWeg: (id: string) => void; onWaehlen: () => void; aktion?: ReactNode;
}) {
  const [alle, setAlle] = useState(false);
  const gewaehlt = akts.filter((a) => auswahl.includes(a.id)).sort((x, y) => (x.d < y.d ? 1 : -1));
  const zeigen = alle ? gewaehlt : gewaehlt.slice(0, 5);
  return (
    <section className="st-gruppe">
      <div className="st-gruppe-kopf"><span className="lbl">Einheiten ({gewaehlt.length})</span>
        <button className="btn ghost small" onClick={onWaehlen}>Auswählen …</button>
      </div>
      {gewaehlt.length ? (
        <ul className="ek-liste">
          {zeigen.map((a) => (
            <li key={a.id} className={a.id === aktiv ? "an" : ""}>
              <button className="ek-name" onClick={() => onAktiv?.(a.id)} disabled={!onAktiv} aria-pressed={onAktiv ? a.id === aktiv : undefined}>
                <SportSym k={a.k} klein />
                <span className="grow"><b>{a.n}</b><span className="muted">{aktText(a)}</span></span>
              </button>
              <button className="btn ghost sq klein" onClick={() => onWeg(a.id)} aria-label={a.n + " entfernen"} data-tipp="Entfernen">×</button>
            </li>
          ))}
          {gewaehlt.length > 5 && <li><button className="btn ghost small" onClick={() => setAlle(!alle)}>{alle ? "Weniger" : "Alle " + gewaehlt.length + " zeigen"}</button></li>}
        </ul>
      ) : <p className="muted">Noch keine Einheit gewählt.</p>}
      {aktion}
    </section>
  );
}

/* ---------- Sammelbild und Video ---------- */

/** Fürs Video gibt es keinen transparenten Hintergrund */
export const videoStand = (s: SammelState): SammelState => (s.bg === "Transparent" ? { ...s, bg: "Dunkel" } : s);
export function tonspur(E: SammelEinheit[], s: SammelState): { plan: ReturnType<typeof zeitplan>; spur: Tonspur } {
  const plan = zeitplan(kachelnVon(E, s).length, s.video);
  return { plan, spur: { toene: plan.toene, musik: s.video.musik, laut: s.video.laut, dauer: plan.dauer } };
}

export function SammelFlaeche({ E, st, video, ruhe }: { E: SammelEinheit[]; st: SammelState; video: boolean; ruhe: boolean }) {
  const huelle = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const [spielt, setSpielt] = useState(false);
  const stopp = useRef<(() => void) | null>(null);
  const s = video ? videoStand(st) : st;
  const { W, H } = sammelGroesse(s);
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
  const malen = (t: number, plan?: ReturnType<typeof zeitplan>) => {
    const c = canvas.current;
    if (c) zeichneSammel(c.getContext("2d")!, E, s, { W, H, px: c.width / W }, t, plan);
  };
  useEffect(() => {
    const c = canvas.current;
    if (!c || cssW < 20) return;
    let weg = false;
    void sammelSchriften().then(() => {
      if (weg) return;
      c.width = Math.round(cssW * dpr); c.height = Math.round(cssH * dpr);
      if (!spielt) malen(Infinity);
    });
    return () => { weg = true; };
  }, [E, s, cssW, cssH, dpr, W, H, spielt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { stopp.current?.(); stopp.current = null; setSpielt(false); }, [E, st, video, ruhe]);
  const umschalten = async () => {
    if (spielt) { stopp.current?.(); stopp.current = null; setSpielt(false); return; }
    setSpielt(true);
    await sammelSchriften();
    const { plan, spur } = tonspur(E, s);
    stopp.current = await abspielen((t) => malen(t, plan), spur, () => { stopp.current = null; setSpielt(false); });
  };
  return (
    <div ref={huelle} className="tf-huelle">
      <div className={`tf-bild${s.bg === "Transparent" ? " schach" : ""}`} style={{ width: cssW, height: cssH }}>
        <canvas ref={canvas} style={{ width: cssW, height: cssH }} />
        {video && <button className="sm-spielen" onClick={() => void umschalten()} aria-label={spielt ? "Anhalten" : "Abspielen"}>{spielt ? "❚❚" : "▶"}</button>}
      </div>
    </div>
  );
}

type MutS = (f: (s: SammelState) => void, schritt?: boolean) => void;
export function Gruppe({ titel, children, aktion }: { titel: string; children: ReactNode; aktion?: ReactNode }) {
  return (
    <section className="st-gruppe">
      <div className="st-gruppe-kopf"><span className="lbl">{titel}</span>{aktion}</div>
      {children}
    </section>
  );
}
export function Schalter({ an, onChange, label }: { an: boolean; onChange: (v: boolean) => void; label: string }) {
  return <label className="chk"><input type="checkbox" checked={an} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}

export function SammelPanel({ st, mut, video, E, musik, kannVideo, farbwahl }: {
  st: SammelState; mut: MutS; video: boolean; E: SammelEinheit[]; musik: Musik[]; kannVideo: boolean; farbwahl: (wert: string, onChange: (v: string) => void) => ReactNode;
}) {
  const ohneRoute = E.filter((e) => e.punkte.length < 2).length;
  const { plan } = tonspur(E, st);
  return (
    <>
      {ohneRoute > 0 && <Schalter an={st.ohneRoute} onChange={(v) => mut((s) => { s.ohneRoute = v; })}
        label={(ohneRoute === 1 ? "Eine Einheit" : ohneRoute + " Einheiten") + " ohne Route als Symbol zeigen"} />}
      <Gruppe titel={video ? "Video" : "Bild"}>
        <Seg klein wert={st.format} optionen={FORMATE.map((f) => [f.key, f.kurz] as [FormatKey, string])} onChange={(v) => mut((s) => { s.format = v; })} />
        <Seg klein wert={video && st.bg === "Transparent" ? "Dunkel" : st.bg}
          optionen={[...(video ? [] : [["Transparent", "Transparent"] as ["Transparent", string]]), ["Dunkel", "Dunkel"], ["Hell", "Hell"]]} onChange={(v) => mut((s) => { s.bg = v; })} />
        <div className="st-zeile"><span>Farbe der Routen</span><Seg klein wert={st.farbe} optionen={[["sport", "Nach Sport"], ["akzent", "Akzent"]]} onChange={(v) => mut((s) => { s.farbe = v; })} /></div>
        {st.farbe === "akzent" && farbwahl(st.accent, (v) => mut((s) => { s.accent = v; }))}
        <label className="st-regler"><span>Linienbreite</span>
          <input type="range" min={0.4} max={3} step={0.05} value={st.linie} onChange={(e) => mut((s) => { s.linie = Number(e.target.value); }, false)} /><b>{Math.round(st.linie * 100)} %</b></label>
        <Schalter an={st.leuchten} onChange={(v) => mut((s) => { s.leuchten = v; })} label="Routen leuchten" />
        <Schalter an={st.titelAn} onChange={(v) => mut((s) => { s.titelAn = v; })} label="Titel und Zeitraum oben" />
        {st.titelAn && <input className="inp" value={st.titel} placeholder="Titel automatisch (KW, Monat, Jahr oder Zeitraum)" onChange={(e) => mut((s) => { s.titel = e.target.value; }, false)} />}
        <Schalter an={st.beschriftung} onChange={(v) => mut((s) => { s.beschriftung = v; })} label="Tag und Distanz unter den Routen" />
        <Schalter an={st.summen} onChange={(v) => mut((s) => { s.summen = v; })} label="Summen (km, Stunden, Höhenmeter)" />
        <label className="st-feld"><span>Branding</span><input className="inp" value={st.brand} placeholder="z. B. dein Name" onChange={(e) => mut((s) => { s.brand = e.target.value; }, false)} /></label>
      </Gruppe>
      {video && (
        <>
          <Gruppe titel="Animation">
            <div className="st-zeile"><span>Effekt</span><Seg klein wert={st.video.effekt} optionen={[["zeichnen", "Zeichnen"], ["einblenden", "Einblenden"], ["fliegen", "Hereinfliegen"]] as [Effekt, string][]} onChange={(v) => mut((s) => { s.video.effekt = v; })} /></div>
            <div className="st-regler"><span>Abstand</span>
              <input type="range" min={ABSTAND_MIN} max={2} step={0.01} value={st.video.abstand} aria-label="Abstand zwischen den Routen" onChange={(e) => mut((s) => { s.video.abstand = Number(e.target.value); }, false)} />
              <AbstandFeld wert={st.video.abstand} onChange={(v) => mut((s) => { s.video.abstand = v; }, false)} />
            </div>
            <div className="muted small">Länge: {Math.round(plan.dauer)} s</div>
          </Gruppe>
          <Gruppe titel="Ton">
            <div className="st-zeile"><span>Je Route</span><Seg klein wert={st.video.ton} optionen={[["aus", "Aus"], ["woosh", "Woosh"], ["blop", "Blop"], ["klick", "Klick"]] as [RoutenTon, string][]} onChange={(v) => mut((s) => { s.video.ton = v; })} /></div>
            <div className="st-zeile"><span>Am Ende</span><Seg klein wert={st.video.ende} optionen={[["aus", "Aus"], ["bling", "Bling"], ["impact", "Einschlag"]] as [EndTon, string][]} onChange={(v) => mut((s) => { s.video.ende = v; })} /></div>
            {musik.length > 0 && <div className="st-zeile"><span>Musik</span><Seg klein wert={musik.includes(st.video.musik) ? st.video.musik : "aus"} optionen={[["aus", "Aus"], ...musik.map((m) => [m, m === "lofi" ? "Lofi" : "Daytona"] as [Musik, string])]} onChange={(v) => mut((s) => { s.video.musik = v; })} /></div>}
            <label className="st-regler"><span>Lautstärke</span>
              <input type="range" min={0} max={1} step={0.05} value={st.video.laut} onChange={(e) => mut((s) => { s.video.laut = Number(e.target.value); }, false)} /><b>{Math.round(st.video.laut * 100)} %</b></label>
            {!kannVideo && <div className="small bad">Dieses Fenster kann keine Videos aufnehmen.</div>}
          </Gruppe>
        </>
      )}
    </>
  );
}

/** Zahlenfeld für den Abstand: Zwischenstände beim Tippen („0“, „0,0“) übergehen, sonst springt das Feld auf den kleinsten Wert */
function AbstandFeld({ wert, onChange }: { wert: number; onChange: (v: number) => void }) {
  const [t, setT] = useState(String(wert).replace(".", ","));
  useEffect(() => { if (Number(t.replace(",", ".")) !== wert) setT(String(wert).replace(".", ",")); }, [wert]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input className="inp sm-zahl" inputMode="decimal" value={t} aria-label="Abstand in Sekunden"
      onChange={(e) => { const v = e.target.value.replace(/[^0-9.,]/g, ""); setT(v); const x = Number(v.replace(",", ".")); if (v && x >= ABSTAND_MIN && x <= 3) onChange(x); }} />
  );
}
