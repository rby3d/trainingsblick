/* Körperdaten (Garmin) und Karte: beide mit wählbarem Zeitraum */
import { useMemo } from "react";
import { Kopf, Seg } from "../komp";
import { Erholung, GarminVerbinden } from "../erholung";
import { Routen } from "../ansichten";
import { Strecke, Zeitraum, ZEITRAEUME, bereich } from "../util";
import { Ctx } from "./ctx";

const ZR_KOERPER: [Zeitraum, string][] = [["4w", "4 Wochen"], ["12w", "12 Wochen"], ["jahr", "Dieses Jahr"]];
type SportFilter = "alle" | "Ride" | "Run" | "Swim";
export const KARTE_SPORTS: [SportFilter, string][] = [["alle", "Alle"], ["Ride", "Rad"], ["Run", "Laufen"], ["Swim", "Schwimmen"]];
export type { SportFilter };

export function Koerperdaten({ c, zeitraum, setZeitraum }: { c: Ctx; zeitraum: Zeitraum; setZeitraum: (z: Zeitraum) => void }) {
  const { gdaten, gz, aktion, heute } = c;
  const zr = zeitraum === "gesamt" ? "jahr" : zeitraum;
  const br = useMemo(() => bereich(zr, heute, heute), [zr, heute]);
  const laedt = gz.busy && gz.art === "sync";
  if (gdaten && gdaten.tage.length && !gz.anmelden) {
    return (
      <>
        <Kopf titel="Körperdaten">
          <Seg label="Zeitraum" wert={zr} optionen={ZR_KOERPER} onChange={setZeitraum} />
          <span className="grow" />
          {laedt && <span className="muted">Lade Garmin-Daten {gz.fertig}/{gz.gesamt} …</span>}
          <button className="btn" disabled={gz.busy || !gz.paket} onClick={() => void aktion("garmin_sync", { voll: false })}>Neu laden</button>
          <button className="btn ghost" disabled={gz.busy} onClick={() => void aktion("garmin_trennen")}>Trennen</button>
        </Kopf>
        {gz.fehler && gz.text && <div className="fehlbox">{gz.text}</div>}
        <div className="raster"><Erholung d={gdaten} br={br} heute={heute} gz={gz} /></div>
      </>
    );
  }
  return (
    <>
      <Kopf titel="Körperdaten" />
      <div className="raster">
        {gz.verbunden && !gz.anmelden && gz.paket && gz.py ? (
          <section className="feld s6">
            {laedt ? <div className="lbl">Lade Garmin-Daten {gz.fertig}/{gz.gesamt} …</div> : (
              <>
                {gz.fehler && gz.text ? <div className="fehlbox">{gz.text}</div> : <div className="muted">Noch keine Daten von Garmin.</div>}
                <div><button className="btn primary" onClick={() => void aktion("garmin_sync", { voll: false })}>Daten laden</button></div>
              </>
            )}
          </section>
        ) : <GarminVerbinden gz={gz} aktion={aktion} />}
      </div>
    </>
  );
}

export function KarteSeite({ c, strecken, geladen, dunkel, sport, setSport, zeitraum, setZeitraum }: {
  c: Ctx; strecken: Strecke[]; geladen: boolean; dunkel: boolean; sport: SportFilter; setSport: (s: SportFilter) => void; zeitraum: Zeitraum; setZeitraum: (z: Zeitraum) => void;
}) {
  const erste = c.alle.length ? c.alle[0].tag : c.heute;
  const br = useMemo(() => bereich(zeitraum, c.heute, erste), [zeitraum, c.heute, erste]);
  const sichtbar = useMemo(() => strecken.filter((r) => (sport === "alle" || r.k === sport) && r.tag >= br.von && r.tag <= br.bis), [strecken, sport, br]);
  return (
    <>
      <Kopf titel="Karte">
        <Seg label="Sportart" wert={sport} optionen={KARTE_SPORTS} onChange={setSport} />
        <Seg label="Zeitraum" wert={zeitraum} optionen={ZEITRAEUME} onChange={setZeitraum} />
      </Kopf>
      <Routen strecken={sichtbar} alleStrecken={strecken} akts={c.alle} dunkel={dunkel} auf={c.aufId} geladen={geladen} />
    </>
  );
}
