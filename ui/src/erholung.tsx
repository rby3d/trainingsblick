import { useMemo, useState } from "react";
import { Karte } from "./komp";
import { Nacht, SchlafBalken, SchlafLegende, Streu } from "./charts";
import { Bereich, Punkt, fmtDauer, nf, tagNr, trendlinie, fmtTag, WT, wochentag } from "./util";

export type GTag = { rhr?: number; hrv?: number; hrvw?: number; hrvs?: string; sl?: number; tief?: number; leicht?: number; rem?: number; wach?: number;
  slscore?: number; bbh?: number; bbl?: number; bbw?: number; str?: number; schritte?: number; tr?: number; trl?: string };
export type GDaten = { tage: [string, GTag][]; vo2: [string, number][]; stand: number };
export type GZ = { py: string; py_ver: string; geprueft: boolean; paket: boolean | null; busy: boolean; art: string; text: string; fehler: boolean; mfa: boolean;
  fertig: number; gesamt: number; anmelden: boolean; verbunden: boolean; ver: number; stand: number };
export const GZ_LEER: GZ = { py: "", py_ver: "", geprueft: false, paket: null, busy: false, art: "", text: "", fehler: false, mfa: false, fertig: 0, gesamt: 0, anmelden: false, verbunden: false, ver: 0, stand: 0 };

const tagVon = (iso: string) => tagNr(+iso.slice(0, 4), +iso.slice(5, 7), +iso.slice(8, 10));
const mittel = (w: number[]) => (w.length ? w.reduce((a, b) => a + b, 0) / w.length : NaN);
const label = (tag: number) => `${WT[wochentag(tag)]} ${fmtTag(tag, true)}`;

type Reihe = { tag: number; wert: number }[];
function reihe(d: GDaten, f: (t: GTag) => number | undefined): Reihe {
  const out: Reihe = [];
  for (const [iso, t] of d.tage) { const v = f(t); if (v !== undefined && isFinite(v) && v > 0) out.push({ tag: tagVon(iso), wert: v }); }
  return out;
}
const punkteVon = (r: Reihe, br: Bereich): Punkt[] => r.filter((p) => p.tag >= br.von && p.tag <= br.bis).map((p) => ({ tag: p.tag, wert: p.wert, id: String(p.tag), n: label(p.tag) }));

/** Aenderung des 7-Tage-Mittels gegenueber dem 28-Tage-Mittel davor. */
function trendText(r: Reihe, heute: number, einheit: string, niedrigGut: boolean, dez = 0): { text: string; gut: boolean | null } {
  const a = r.filter((p) => p.tag > heute - 7).map((p) => p.wert), b = r.filter((p) => p.tag <= heute - 7 && p.tag > heute - 35).map((p) => p.wert);
  if (a.length < 3 || b.length < 7) return { text: "–", gut: null };
  const d = mittel(a) - mittel(b);
  if (Math.abs(d) < Math.pow(10, -dez) / 2) return { text: `Ø 7 Tage ± 0 ${einheit}`, gut: null };
  return { text: `Ø 7 Tage ${d > 0 ? "▲" : "▼"} ${nf(Math.abs(d), dez)} ${einheit}`, gut: niedrigGut ? d < 0 : d > 0 };
}

export function Erholung({ d, br, heute, gz }: { d: GDaten; br: Bereich; heute: number; gz: GZ }) {
  const rhr = useMemo(() => reihe(d, (t) => t.rhr), [d]);
  const hrv = useMemo(() => reihe(d, (t) => t.hrv), [d]);
  const sl = useMemo(() => reihe(d, (t) => (t.sl ? t.sl / 3600 : undefined)), [d]);
  const bb = useMemo(() => reihe(d, (t) => t.bbh), [d]);
  const tr = useMemo(() => reihe(d, (t) => t.tr), [d]);
  const vo2 = useMemo(() => d.vo2.map(([iso, v]) => ({ tag: tagVon(iso), wert: v })), [d]);
  const letzte = (r: Reihe) => (r.length ? r[r.length - 1] : null);
  const letzterTag = d.tage.length ? d.tage[d.tage.length - 1] : null;
  const nachte: Nacht[] = useMemo(() => d.tage.filter(([, t]) => t.sl).map(([iso, t]) => ({ tag: tagVon(iso), tief: t.tief || 0, rem: t.rem || 0, leicht: t.leicht || 0, wach: t.wach || 0, score: t.slscore })), [d]);
  const lRhr = letzte(rhr), lHrv = letzte(hrv), lSl = letzte(sl), lBb = letzte(bb), lTr = letzte(tr), lVo2 = letzte(vo2);
  const tRhr = trendText(rhr, heute, "bpm", true), tHrv = trendText(hrv, heute, "ms", false), tSl = trendText(sl, heute, "h", false, 1), tBb = trendText(bb, heute, "", false), tTr = trendText(tr, heute, "", false);
  const hrvStatus = letzterTag?.[1].hrvs;
  const statusText: Record<string, string> = { BALANCED: "Ausgeglichen", UNBALANCED: "Unausgeglichen", LOW: "Niedrig", POOR: "Schlecht", NONE: "–" };
  const nachteBr = nachte.filter((n) => n.tag >= br.von && n.tag <= br.bis);
  const von = nachteBr.length ? Math.max(br.von, nachteBr[0].tag) : br.von;
  /** Ein Feld je Messwert: aktueller Wert im Kopf, Verlauf im Zeitraum, darunter der Trend der letzten 7 Tage */
  const feld = (r: Reihe, sym: string, farbe: string, titel: string, sub: string, wert: string, t: { text: string; gut: boolean | null }, dez = 0, kopfrechts?: string) => {
    const p = punkteVon(r, br);
    return (
      <Karte klasse="s4" titel={titel} sub={sub} sym={sym} farbe={farbe} rechts={<b className="gwert">{wert}{kopfrechts && <small>{kopfrechts}</small>}</b>}>
        <Streu punkte={p} trend={trendlinie(p, 7)} von={br.von} bis={br.bis} fmt={(v) => nf(v, dez)} besserNiedrig={false} farbe={farbe} h={150} />
        <div className={`notiz${t.gut === null ? "" : t.gut ? " gut" : " schlecht"}`}>{t.text}</div>
      </Karte>
    );
  };
  const hrvText = hrvStatus && hrvStatus !== "NONE" ? { text: `${statusText[hrvStatus] || hrvStatus} · ${tHrv.text}`, gut: hrvStatus === "BALANCED" ? true : false } : tHrv;
  return (
    <>
      {feld(hrv, "puls", "var(--accent)", "HRV", "ms · Ø der Nacht", lHrv ? nf(lHrv.wert) : "–", hrvText)}
      {feld(rhr, "herz", "var(--c-run)", "Ruhepuls", "bpm", lRhr ? nf(lRhr.wert) : "–", tRhr)}
      <Karte klasse="s4" titel="Schlaf" sub="Stunden je Nacht" sym="mond" farbe="var(--c-other)" rechts={<b className="gwert">{lSl ? fmtDauer(lSl.wert * 3600) : "–"}<small>h</small></b>}>
        <SchlafBalken n={nachte} von={von} bis={br.bis} h={150} />
        <div className="fk-fuss"><SchlafLegende /><span className={`notiz${tSl.gut === null ? "" : tSl.gut ? " gut" : " schlecht"}`}>{tSl.text}</span></div>
      </Karte>
      {feld(bb, "batterie", "var(--c-swim)", "Body Battery", "Höchstwert des Tages", lBb ? nf(lBb.wert) : "–", tBb)}
      {feld(tr, "sonne", "var(--ok)", "Trainingsbereitschaft", "Garmin", lTr ? nf(lTr.wert) : "–", tTr, 0, letzterTag?.[1].trl ? String(letzterTag[1].trl).toLowerCase() : undefined)}
      {feld(vo2, "tacho", "var(--c-ride)", "VO2max", "ml/kg/min", lVo2 ? nf(lVo2.wert, 1) : "–", { text: gz.stand > 0 ? `Stand ${new Date(gz.stand * 1000).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "", gut: null }, 1)}
    </>
  );
}
/** Einrichtung: Python pruefen, Paket installieren, bei Garmin anmelden (mit Zwei-Faktor-Code). */
export function GarminVerbinden({ gz, aktion, ohneRahmen }: { gz: GZ; aktion: (name: string, body?: unknown) => Promise<void>; ohneRahmen?: boolean }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const beschaeftigt = gz.busy;
  let inhalt;
  if (!gz.geprueft || gz.art === "pruefen") {
    inhalt = <div className="lbl">Prüfe Python …</div>;
  } else if (!gz.py) {
    inhalt = (
      <>
        <div className="fehlbox">Kein Python 3.12 oder neuer gefunden. Installiere es, zum Beispiel mit <span className="mono">winget install Python.Python.3.12</span>.</div>
        <div><button className="btn" onClick={() => void aktion("garmin_pruefen")}>Erneut prüfen</button></div>
      </>
    );
  } else if (!gz.paket) {
    inhalt = (
      <>
        {gz.text && <div className="fehlbox">{gz.text}</div>}
        <div><button className="btn primary" disabled={beschaeftigt} onClick={() => void aktion("garmin_installieren")}>{gz.art === "install" ? "Installiere …" : "Garmin-Paket installieren"}</button></div>
      </>
    );
  } else if (gz.mfa) {
    inhalt = (
      <>
        <div className="formgrid"><label>Bestätigungscode</label><input type="text" inputMode="numeric" autoFocus value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && code) void aktion("garmin_mfa", { code }); }} /></div>
        <div><button className="btn primary" disabled={!code} onClick={() => void aktion("garmin_mfa", { code })}>Bestätigen</button></div>
      </>
    );
  } else {
    inhalt = (
      <>
        {gz.fehler && gz.text && <div className="fehlbox">{gz.text}</div>}
        <div className="formgrid">
          <label>E-Mail</label><input type="text" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Passwort</label><input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && email && pw) void aktion("garmin_anmelden", { email, passwort: pw }); }} />
        </div>
        <div><button className="btn primary" disabled={beschaeftigt || !email || !pw} onClick={() => void aktion("garmin_anmelden", { email, passwort: pw })}>{beschaeftigt ? (gz.text || "Verbinde …") : "Mit Garmin verbinden"}</button></div>
      </>
    );
  }
  if (ohneRahmen) return <div className="garmin-inhalt">{inhalt}</div>;
  return (
    <Karte klasse="s6 garminbox" titel="Garmin Connect" sym="uhrband">
      <p className="muted">Für Schlaf, HRV, Ruhepuls, Body Battery und die Bereitschaft am Morgen.</p>
      {inhalt}
    </Karte>
  );
}
