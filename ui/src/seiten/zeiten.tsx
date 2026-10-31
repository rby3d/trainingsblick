/* Zeiten: Bestzeiten, Entwicklung und Rekorde je Sportart */
import { useMemo } from "react";
import { Abschnitt, Karte, Kopf, Seg, Zahl, Zahlen } from "../komp";
import { Volumen } from "../charts";
import { Bestzeiten, Entwicklung, ZeilenListe } from "../ansichten";
import { KAT_NAME, KAT_VAR, Kat, behaelter, radBestwerte, rekorde, schwimmBestwerte } from "../util";
import { Ctx } from "./ctx";

export type ZeitSport = "Run" | "Ride" | "Swim";
export const ZEIT_SPORTS: [ZeitSport, string][] = [["Run", "Laufen"], ["Ride", "Rad"], ["Swim", "Schwimmen"]];

export function Zeiten({ c, sport, setSport }: { c: Ctx; sport: ZeitSport; setSport: (s: ZeitSport) => void }) {
  const { alle, heute, aufId } = c;
  const akts = useMemo(() => alle.filter((a) => a.k === sport), [alle, sport]);
  const rad = useMemo(() => (sport === "Ride" ? radBestwerte(akts) : []), [akts, sport]);
  const schwimm = useMemo(() => (sport === "Swim" ? schwimmBestwerte(akts) : []), [akts, sport]);
  const umfang = useMemo(() => behaelter(akts, heute - 364, heute, true), [akts, heute]);
  const rek = useMemo(() => rekorde(akts), [akts]);
  const farbe = KAT_VAR[sport as Kat];
  return (
    <>
      <Kopf titel="Zeiten">
        <Seg label="Sportart" wert={sport} optionen={ZEIT_SPORTS} onChange={setSport} />
        <span className="grow" />
        <span className="muted">Bestzeiten aus allen Jahren · Verläufe der letzten 12 Monate</span>
      </Kopf>
      <div className="raster">
        {sport === "Run" ? (
          <Bestzeiten akts={alle} ex={c.extras} neben={c.neben} heute={heute} auf={aufId} />
        ) : (
          <>
            <Karte klasse="s5" titel="Bestwerte" sub={KAT_NAME[sport]} sym="uhr" farbe={farbe}>
              <ZeilenListe zeilen={sport === "Ride" ? rad : schwimm} auf={aufId} />
            </Karte>
            <Karte klasse="s7" titel="Umfang" sub="Distanz je Monat">
              <Volumen b={umfang.liste} mk="m" monate />
            </Karte>
          </>
        )}
      </div>
      <Abschnitt titel="Entwicklung" sub={`${KAT_NAME[sport]} · letzte 12 Monate`} sym="puls" farbe={farbe}>
        <div className="raster">
          <Entwicklung akts={akts} von={heute - 364} bis={heute} heute={heute} auf={aufId} kat={sport} />
        </div>
      </Abschnitt>
      <Abschnitt titel="Rekorde" sub={KAT_NAME[sport]} sym="pokal" farbe="var(--warn)">
        <section className="feld">
          {rek.length ? (
            <Zahlen>
              {rek.map((r) => <Zahl key={r.label} titel={r.label.replace(/ · .*$/, "")} wert={r.wert} fuss={<span className="delta">{r.sub}</span>} onClick={r.id ? () => aufId(r.id!) : undefined} />)}
            </Zahlen>
          ) : <div className="muted">Noch keine Einheiten</div>}
        </section>
      </Abschnitt>
    </>
  );
}
