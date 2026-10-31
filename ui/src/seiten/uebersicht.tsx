/* Übersicht: Bereitschaft heute, Form, diese Woche, Ziel und die letzten Einheiten */
import { useMemo } from "react";
import { Delta, Karte, Kopf, Zahl, Zahlen } from "../komp";
import { FitnessChart } from "../charts";
import { Sym, SportSym } from "../symbole";
import { belastungSumme, fitness, fmtDauer, fmtKm, fmtTag, isoKw, nf, summe, tagDatum, wochenStart, wochentag, WT } from "../util";
import type { Stufe } from "../empfehlung";
import { Ctx, MONATE, WTL } from "./ctx";
import { Tagesleiste } from "./aktivitaeten";

const STUFE_FARBE: Record<Stufe, string> = { hart: "var(--ok)", normal: "var(--accent)", locker: "var(--warn)", pause: "var(--bad)", erledigt: "var(--muted)" };
const SIGNAL_SYM: Record<string, string> = { hrv: "puls", rhr: "herz", schlaf: "mond", bb: "batterie", tr: "sonne", form: "flamme" };
const datumLang = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const bisText = (t: number) => (t === 0 ? "heute" : t < 56 ? `${nf(t)} ${t === 1 ? "Tag" : "Tage"}` : `${nf(Math.floor(t / 7))} Wochen`);

function Bereitschaft({ c }: { c: Ctx }) {
  const e = c.empf;
  if (!e) {
    return (
      <Karte klasse="s6" titel="Bereitschaft" sym="sonne">
        <div className="muted">Noch keine Einheiten.</div>
      </Karte>
    );
  }
  const farbe = STUFE_FARBE[e.stufe];
  const umfang = 2 * Math.PI * 50;
  return (
    <Karte klasse="s6" titel="Bereitschaft" sub={c.gdaten?.tage.length ? "Garmin · heute Nacht" : "aus deinen Einheiten"} sym="sonne" farbe={farbe}
      rechts={!c.gz.verbunden && !c.demo ? <button className="btn small" onClick={() => c.gehe("koerper")}>Garmin verbinden …</button> : undefined}>
      <div className="bereit">
        <div className="bereit-ring" aria-label={`Bereitschaft ${e.score} von 100`}>
          <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" className="spur-r" /><circle cx="60" cy="60" r="50" className="wert-r" style={{ stroke: farbe, strokeDasharray: `${(umfang * e.score) / 100} ${umfang}` }} /></svg>
          <b>{e.score}</b><span>von 100</span>
        </div>
        <div className="bereit-text">
          <div><div className="empf-t" style={{ color: farbe }}>{e.titel}</div><div className="muted">{e.detail}</div></div>
          {e.signale.length > 0 && (
            <div className="signale">
              {e.signale.map((s) => (
                <div key={s.id} className="sig" data-tipp={s.vergleich || undefined}><i className={s.status} /><Sym n={SIGNAL_SYM[s.id] ?? "puls"} /><span>{s.name}</span><b className="mono">{s.wert}</b></div>
              ))}
            </div>
          )}
          {e.hinweise.length > 0 && <div className="notiz">{e.hinweise.join(" · ")}</div>}
        </div>
      </div>
    </Karte>
  );
}

function Form({ c }: { c: Ctx }) {
  const fit = useMemo(() => fitness(c.alle, c.heute, c.ruhe, c.maxp), [c.alle, c.heute, c.ruhe, c.maxp]);
  const n = fit ? fit.ctl.length : 0;
  const ctl = fit ? fit.ctl[n - 1] : 0, atl = fit ? fit.atl[n - 1] : 0, form = ctl - atl;
  const ctl4 = fit && n > 28 ? fit.ctl[n - 29] : null;
  const atlMittel = fit ? fit.atl.slice(-42).reduce((s, v) => s + v, 0) / Math.min(42, n) : 0;
  const formText = !fit ? "" : form > 15 ? "ausgeruht" : form > 0 ? "frisch" : form > -15 ? "im Training" : "müde";
  return (
    <Karte klasse="s6" titel="Form" sub="letzte 6 Wochen" sym="puls"
      rechts={<div className="legende"><span><i style={{ background: "var(--c-ctl)" }} />Fitness</span><span><i style={{ background: "var(--c-atl)" }} />Ermüdung</span></div>}>
      <Zahlen>
        <Zahl sym="herz" titel="Form" wert={fit ? `${form > 0 ? "+" : ""}${nf(form)}` : "–"} fuss={<span className={`delta ${form > 0 ? "auf" : form < -15 ? "ab" : ""}`}>{formText}</span>} />
        <Zahl sym="puls" titel="Fitness" wert={fit ? nf(ctl) : "–"} fuss={ctl4 !== null ? <span className={`delta ${ctl - ctl4 >= 0.5 ? "auf" : ctl - ctl4 <= -0.5 ? "ab" : ""}`}>{ctl - ctl4 >= 0 ? "▲" : "▼"} {nf(Math.abs(ctl - ctl4))} in 4 Wochen</span> : null} />
        <Zahl sym="flamme" titel="Ermüdung" wert={fit ? nf(atl) : "–"} fuss={fit ? <span className="delta">Ø {nf(atlMittel)} in 6 Wochen</span> : null} />
      </Zahlen>
      <FitnessChart f={fit} von={c.heute - 41} bis={c.heute} kompakt />
    </Karte>
  );
}

function DieseWoche({ c }: { c: Ctx }) {
  const { alle, heute, ruhe, maxp } = c;
  const start = wochenStart(heute), ende = start + 6, tageBisher = heute - start;
  const jetzt = useMemo(() => summe(alle, start, ende), [alle, start, ende]);
  const vor = useMemo(() => summe(alle, start - 7, start - 7 + tageBisher), [alle, start, tageBisher]);
  const bel = useMemo(() => belastungSumme(alle, start, ende, ruhe, maxp), [alle, start, ende, ruhe, maxp]);
  const belVor = useMemo(() => belastungSumme(alle, start - 7, start - 7 + tageBisher, ruhe, maxp), [alle, start, tageBisher, ruhe, maxp]);
  const woAkts = useMemo(() => alle.filter((a) => a.tag >= start && a.tag <= ende), [alle, start, ende]);
  const ziel = (c.einst?.wochenziel || 0) * 3600;
  return (
    <Karte klasse="s8" titel="Diese Woche" sub={`KW ${isoKw(start)}`} sym="kalender"
      rechts={<button className="btn small" onClick={() => c.gehe("aktivitaeten")}>In Aktivitäten öffnen</button>}>
      <Zahlen>
        <Zahl sym="uhr" titel="Zeit" wert={fmtDauer(jetzt.t)} einheit={ziel ? `von ${fmtDauer(ziel)} h` : "h"}
          fuss={ziel ? <span className="zielbalken"><span className="balken"><i style={{ width: `${Math.min(100, (jetzt.t / ziel) * 100)}%` }} /></span>{Math.round((jetzt.t / ziel) * 100)} %</span> : <Delta jetzt={jetzt.t} vor={vor.t} text="zur Vorwoche" />} />
        <Zahl sym="strecke" titel="Distanz" wert={fmtKm(jetzt.m)} einheit="km" fuss={<Delta jetzt={jetzt.m} vor={vor.m} text="zur Vorwoche" />} />
        <Zahl sym="liste" titel="Einheiten" wert={nf(jetzt.n)} fuss={<Delta jetzt={jetzt.n} vor={vor.n} text="zur Vorwoche" />} />
        <Zahl sym="flamme" titel="Belastung" wert={nf(bel)} fuss={<Delta jetzt={bel} vor={belVor} text="zur Vorwoche" />} />
      </Zahlen>
      <Tagesleiste akts={woAkts} start={start} heute={heute} auf={c.auf} kompakt />
    </Karte>
  );
}

function Ziel({ c }: { c: Ctx }) {
  const ev = c.events[0];
  if (!ev) {
    return (
      <Karte titel="Ziel" sym="flagge">
        <div className="muted">Kein Event eingetragen.</div>
        <div><button className="btn" onClick={c.einstellungen}>Ziel eintragen …</button></div>
      </Karte>
    );
  }
  const vonTag = Math.round(Date.parse((ev.von || ev.datum) + "T00:00:00Z") / 864e5);
  const gesamt = Math.max(1, ev.tage + (c.heute - vonTag));
  const anteil = Math.max(0, Math.min(1, 1 - ev.tage / gesamt));
  const gross = ev.tage === 0 ? "Heute" : ev.tage < 56 ? nf(ev.tage) : nf(Math.floor(ev.tage / 7));
  const einheit = ev.tage === 0 ? "" : ev.tage < 56 ? (ev.tage === 1 ? "Tag bis" : "Tage bis") : "Wochen bis";
  const rest = c.events.slice(1, 3);
  return (
    <Karte titel="Ziel" sym="flagge">
      <div className="ziel-zahl"><b>{gross}</b><span className="muted">{einheit}</span></div>
      <div><b>{ev.name}</b><div className="muted">{datumLang(ev.datum)}</div></div>
      <div className="balken"><i style={{ width: `${anteil * 100}%`, background: "var(--accent)" }} /></div>
      {rest.length > 0 && <div className="notiz">Weitere: {rest.map((e) => `${e.name} · ${bisText(e.tage)}`).join(" · ")}</div>}
    </Karte>
  );
}

function Zuletzt({ c }: { c: Ctx }) {
  const l = c.alle.slice(-5).reverse();
  return (
    <Karte titel="Zuletzt" sym="uhr">
      <div className="liste">
        {l.map((a) => (
          <button key={a.id} className="zeile" onClick={() => c.auf(a)}>
            <SportSym k={a.k} />
            <span className="t">{a.n}<small>{WT[wochentag(a.tag)]} {fmtTag(a.tag)} · {fmtDauer(a.t)} h{a.m >= 100 ? ` · ${nf(a.m / 1000, 1)} km` : ""}</small></span>
            <Sym n="pfeil" />
          </button>
        ))}
        {!l.length && <div className="muted">Noch keine Einheiten</div>}
      </div>
    </Karte>
  );
}

export function Uebersicht({ c }: { c: Ctx }) {
  const d = tagDatum(c.heute);
  return (
    <>
      <Kopf titel="Übersicht" unter={`${WTL[wochentag(c.heute)]}, ${d.getUTCDate()}. ${MONATE[d.getUTCMonth()]} · KW ${isoKw(c.heute)}`} />
      <div className="raster">
        <Bereitschaft c={c} />
        <Form c={c} />
        <DieseWoche c={c} />
        <div className="spalte s4">
          <Ziel c={c} />
          <Zuletzt c={c} />
        </div>
      </div>
    </>
  );
}
