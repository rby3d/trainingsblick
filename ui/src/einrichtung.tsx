/* Einrichtung beim ersten Start: Strava verbinden, Garmin (optional), Ziel (optional), erster Abruf */
import { useEffect, useState } from "react";
import { GarminVerbinden, GZ } from "./erholung";
import { DatumWahl } from "./datum";
import { Sym, SymFeld } from "./symbole";
import { nf, Ev } from "./util";
import type { Aktion, Einst, Zustand } from "./seiten/ctx";

const SCHRITTE: [string, string, string][] = [["kette", "Strava", "Aktivitäten"], ["uhrband", "Garmin", "optional"], ["flagge", "Ziel", "optional"], ["haken", "Fertig", "erster Abruf"]];
const heuteIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function Einrichtung({ z, gz, einst, aktion, speichern, onClose }: {
  z: Zustand | null; gz: GZ; einst: Einst | null; aktion: Aktion;
  speichern: (patch: Record<string, unknown>) => Promise<boolean>; onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const [cid, setCid] = useState(""), [sec, setSec] = useState("");
  const heute = heuteIso();
  const haupt = (einst?.events || []).find((e) => e.haupt && e.datum >= heute) ?? (einst?.events || []).find((e) => e.datum >= heute);
  const [evName, setEvName] = useState(haupt?.name ?? "");
  const [evDatum, setEvDatum] = useState(haupt?.datum ?? "");
  const [wz, setWz] = useState(einst?.wochenziel ? String(einst.wochenziel).replace(".", ",") : "");
  const verbunden = !!z?.verbunden;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const zielSpeichern = async () => {
    if (evName.trim() && !evDatum) return;
    const andere = (einst?.events || []).filter((e) => e !== haupt);
    const events: Ev[] = evName.trim() && evDatum
      ? [{ name: evName.trim(), datum: evDatum, haupt: true, von: haupt?.von || heute }, ...andere.map((e) => ({ ...e, haupt: false }))]
      : einst?.events || [];
    const ok = await speichern({ ruhepuls: einst?.ruhepuls || 50, maxpuls: einst?.maxpuls || 0, events, wochenziel: wz || 0 });
    if (ok) setI(3);
  };

  const zurueck = i > 0 ? <button className="btn" onClick={() => setI(i - 1)}>Zurück</button> : null;
  let inhalt: JSX.Element;
  if (i === 0) {
    inhalt = (
      <>
        <h2><SymFeld n="kette" farbe="#fc4c02" />Mit Strava verbinden</h2>
        {verbunden ? (
          <>
            <div className="ob-status"><Sym n="haken" />Strava ist verbunden · {nf(z?.n ?? 0)} Einheiten</div>
            <div className="ob-fuss"><span className="grow" /><button className="btn primary" onClick={() => setI(1)}>Weiter</button></div>
          </>
        ) : (
          <>
            <p>Das Dashboard holt deine Aktivitäten direkt bei Strava. Dafür brauchst du eine eigene, kostenlose Strava-API-App.</p>
            <ol className="ob-schritte">
              <li><b>strava.com/settings/api</b> öffnen und eine App anlegen (Name beliebig, Website z. B. <code>http://localhost</code>)</li>
              <li>Bei „Authorization Callback Domain“ <code>localhost</code> eintragen</li>
              <li>Client ID und Client Secret hier einfügen</li>
            </ol>
            <div className="ob-form">
              <label>Client ID<input type="text" value={cid} onChange={(e) => setCid(e.target.value)} autoFocus /></label>
              <label>Client Secret<input type="password" value={sec} onChange={(e) => setSec(e.target.value)} /></label>
            </div>
            {z?.verb.text && <div className={z.verb.text.startsWith("Fehler") ? "fehlbox" : "muted"}>{z.verb.text}</div>}
            <div className="ob-sicher"><Sym n="haken" />Die Zugangsdaten bleiben auf deinem PC.</div>
            <div className="ob-fuss">
              <span className="grow" />
              <button className="btn" onClick={() => setI(1)}>Später</button>
              <button className="btn primary" disabled={!z || z.verb.busy || !cid.trim() || !sec.trim()} onClick={() => void aktion("verbinden", { client_id: cid, client_secret: sec })}>
                {z?.verb.busy ? "Warte auf Strava …" : "Mit Strava verbinden …"}
              </button>
            </div>
          </>
        )}
      </>
    );
  } else if (i === 1) {
    inhalt = (
      <>
        <h2><SymFeld n="uhrband" />Garmin verbinden</h2>
        <p>Für Schlaf, HRV, Ruhepuls, Body Battery und die Bereitschaft am Morgen. Ohne Garmin fehlen nur die Körperdaten.</p>
        {gz.verbunden && !gz.anmelden ? <div className="ob-status"><Sym n="haken" />Garmin ist verbunden</div> : <GarminVerbinden gz={gz} aktion={aktion} ohneRahmen />}
        <div className="ob-sicher"><Sym n="haken" />Das Passwort wird nicht gespeichert, nur der Zugang von Garmin.</div>
        <div className="ob-fuss">
          {zurueck}<span className="grow" />
          {gz.verbunden && !gz.anmelden ? <button className="btn primary" onClick={() => setI(2)}>Weiter</button> : <button className="btn" onClick={() => setI(2)}>Überspringen</button>}
        </div>
      </>
    );
  } else if (i === 2) {
    inhalt = (
      <>
        <h2><SymFeld n="flagge" />Trainierst du auf ein Ziel hin?</h2>
        <p>Dann zeigt die Übersicht den Countdown bis zum Renntag.</p>
        <div className="ob-form">
          <label className="ganz">Event<input type="text" value={evName} placeholder="z. B. Halbmarathon Freiburg" onChange={(e) => setEvName(e.target.value)} /></label>
          <label>Datum<DatumWahl value={evDatum} onChange={setEvDatum} label="Datum des Events" min={heute} /></label>
          <label>Wochenziel in Stunden<input type="text" inputMode="decimal" value={wz} placeholder="keins" onChange={(e) => setWz(e.target.value)} /></label>
        </div>
        {evName.trim() && !evDatum && <div className="muted">Bitte noch das Datum wählen.</div>}
        <div className="ob-fuss">
          {zurueck}<span className="grow" />
          <button className="btn" onClick={() => setI(3)}>Kein Ziel</button>
          <button className="btn primary" disabled={!!evName.trim() && !evDatum} onClick={() => void zielSpeichern()}>Weiter</button>
        </div>
      </>
    );
  } else {
    const syncAn = !!z?.sync.busy, gAn = gz.busy && gz.art === "sync";
    inhalt = (
      <>
        <h2><SymFeld n="haken" farbe="var(--ok)" />Alles bereit</h2>
        <p>{verbunden ? "Deine Aktivitäten werden geladen. Was schon da ist, siehst du sofort, ältere Einheiten kommen im Hintergrund dazu." : "Strava ist noch nicht verbunden. Das geht jederzeit über „Einrichtung …“ in der Seitenleiste."}</p>
        <div className="ob-fortschritt">
          <div className="ob-zeile"><SymFeld n="kette" farbe="#fc4c02" klein /><span className="grow">Aktivitäten von Strava</span><b className="mono">{!verbunden ? "nicht verbunden" : syncAn ? z!.sync.text : `${nf(z!.n)} Einheiten`}</b></div>
          {verbunden && <div className={`balken${syncAn ? " laeuft" : ""}`}><i style={{ width: syncAn ? "40%" : "100%", background: syncAn ? "var(--accent)" : "var(--ok)" }} /></div>}
          <div className="ob-zeile"><SymFeld n="uhrband" klein /><span className="grow">Körperdaten von Garmin</span><b className="mono">{gAn ? `${gz.fertig} von ${gz.gesamt}` : gz.verbunden ? "fertig" : "nicht verbunden"}</b></div>
          {gz.verbunden && <div className="balken"><i style={{ width: gAn && gz.gesamt ? `${(gz.fertig / gz.gesamt) * 100}%` : "100%", background: gAn ? "var(--accent)" : "var(--ok)" }} /></div>}
        </div>
        <div className="ob-sicher">Alles lässt sich später unter Einstellungen ändern.</div>
        <div className="ob-fuss">{zurueck}<span className="grow" /><button className="btn primary" onClick={onClose}>Zum Dashboard</button></div>
      </>
    );
  }
  return (
    <div className="ob-hinter" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ob" role="dialog" aria-label="Einrichtung">
        <aside className="ob-seite">
          <div className="logo">Strava<small>Einrichtung</small></div>
          {SCHRITTE.map(([sy, t, u], k) => (
            <button key={t} className={`ob-schritt${k === i ? " jetzt" : k < i ? " fertig" : ""}`} onClick={() => setI(k)}>
              <SymFeld n={k < i ? "haken" : sy} /><span>{t}<small>{u}</small></span>
            </button>
          ))}
        </aside>
        <div className="ob-inhalt">{inhalt}</div>
      </div>
    </div>
  );
}
