import { useMemo, useState } from "react";
import { Hinweis, Karte, Seg } from "./komp";
import { Abweichung, Legende, Streu, Volumen } from "./charts";
import { RoutenKarte } from "./karte";
import {
  Akt, ENTWICKLUNG, Extras, KATS, Kat, KAT_NAME, KAT_VAR, Metrik, REGEN_LABELS, Strecke, TAGESZEIT_LABELS, TEMP_LABELS, WIND_LABELS, Zeile,
  effizienzLauf, effizienzRad, fmtMinSek, fmtTag, fmtZeit, gruppen, laufBestzeiten, laufendeBest, nf, punkte, regenKey,
  stundenBehaelter, tageszeitKey, tagDatum, tempKey, trendlinie, veraenderung, windKey,
} from "./util";

export type Neben = { details: { fertig: number; gesamt: number; pause: string }; wetter: { fertig: number; gesamt: number } };
type Oeffne = (id: string) => void;

export function ZeilenListe({ zeilen, auf }: { zeilen: Zeile[]; auf: Oeffne }) {
  if (!zeilen.length) return <div className="leer">Noch keine passenden Einheiten</div>;
  return (
    <div className="rekorde">
      {zeilen.map((r) => (
        <div key={r.label} className={`rek${r.id ? " klick" : ""}`} onClick={() => { if (r.id) auf(r.id); }}>
          <div className="grow"><div className="lbl">{r.label}</div><div className="rsub">{r.sub}</div></div>
          <b className="mono">{r.wert}</b>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Bestzeiten ------------------------------ */
/** Laufen: Bestzeiten je Distanz (Strava-Segmente innerhalb der Einheit) und der Verlauf der gewaehlten Distanz */
export function Bestzeiten({ akts, ex, neben, heute, auf }: { akts: Akt[]; ex: Extras; neben: Neben; heute: number; auf: Oeffne }) {
  const jahr = tagDatum(heute).getUTCFullYear();
  const best = useMemo(() => laufBestzeiten(akts, ex, jahr), [akts, ex, jahr]);
  const [wahl, setWahl] = useState("5k");
  const aktiv = best.find((b) => b.name === wahl) ?? best.find((b) => b.name === "5k") ?? best[0];
  const erste = akts.length ? akts[0].tag : heute;
  const d = neben.details;
  return (
    <>
      {d.gesamt > 0 && d.fertig < d.gesamt && (
        <div className="s12"><Hinweis>{d.pause ? `${d.pause}. ` : ""}Läufe werden bei Strava analysiert: {d.fertig} von {d.gesamt}. Die Bestzeiten füllen sich laufend.</Hinweis></div>
      )}
      <Karte klasse="s5" titel="Bestzeiten" sub="Laufen" sym="uhr" farbe="var(--c-run)">
        {best.length ? (
          <div className="tabelle hoch">
            <table>
              <thead><tr><th>Distanz</th><th className="r">Bestzeit</th><th className="r">Pace</th><th className="r">Datum</th><th className="r">{jahr}</th></tr></thead>
              <tbody>
                {best.map((b) => (
                  <tr key={b.name} className={b.name === aktiv?.name ? "gewaehlt" : ""} onClick={() => setWahl(b.name)} onDoubleClick={() => b.best && auf(b.best.id)}>
                    <td>{b.label}</td>
                    <td className="r mono"><b>{fmtZeit(b.best!.sek)}</b></td>
                    <td className="r mono">{fmtMinSek(b.best!.sek / (b.m / 1000))} /km</td>
                    <td className="r mono muted">{fmtTag(b.best!.tag, true)}</td>
                    <td className="r mono">{b.jahr ? <>{fmtZeit(b.jahr.sek)}{b.jahr.sek <= b.best!.sek && <span className="pr"> PR</span>}</> : <span className="muted">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="leer">{d.gesamt ? "Wird geladen …" : "Noch keine Läufe"}</div>}
      </Karte>
      <Karte klasse="s7" titel={aktiv ? `Verlauf ${aktiv.label}` : "Verlauf"} sub={aktiv ? `${aktiv.anzahl} Versuche · Linie = laufende Bestzeit` : undefined}>
        {aktiv ? <Streu punkte={aktiv.versuche.map((v) => ({ tag: v.tag, wert: v.sek, id: v.id, n: v.n }))} trend={laufendeBest(aktiv.versuche)} von={Math.min(erste, heute - 365)} bis={heute}
          fmt={fmtZeit} besserNiedrig farbe="var(--c-run)" onKlick={auf} /> : <div className="leer">Keine Daten</div>}
      </Karte>
    </>
  );
}
/* ------------------------------ Entwicklung ------------------------------ */
export function Entwicklung({ akts, von, bis, heute, auf, kat }: { akts: Akt[]; von: number; bis: number; heute: number; auf: Oeffne; kat: Kat }) {
  const karten = useMemo(() => ENTWICKLUNG.filter((m) => m.k === kat).map((m) => {
    const p = punkte(akts, m.f, von, bis);
    const v = veraenderung(punkte(akts, m.f, heute - 120, heute), heute);
    return { m, p, t: trendlinie(p), v };
  }), [akts, von, bis, heute, kat]);
  return (
    <>
      {karten.map(({ m, p, t, v }) => {
        const besser = v ? (m.besserNiedrig ? v.jetzt < v.vor : v.jetzt > v.vor) : null;
        const pct = v ? Math.abs(((v.jetzt - v.vor) / v.vor) * 100) : 0;
        return (
          <Karte key={m.id} klasse={karten.length === 1 ? "s12" : "s6"} titel={m.titel.replace(/^[^·]+· /, "")} sub={`${m.sub} · ${p.length} Einheiten`}
            rechts={v ? <div className="trendtext"><b className="mono">{m.fmt(v.jetzt)}</b><span className={pct < 0.5 ? "muted" : ""}>{pct < 0.5 ? "unverändert" : `${besser ? "▲ besser" : "▼ schwächer"} um ${nf(pct, pct < 10 ? 1 : 0)} %`}</span><span className="muted">letzte 8 Wochen gegen davor</span></div> : undefined}>
            <Streu punkte={p} trend={t} von={von} bis={bis} fmt={m.fmt} besserNiedrig={m.besserNiedrig} farbe={KAT_VAR[m.k]} onKlick={auf} />
          </Karte>
        );
      })}
    </>
  );
}

/* ------------------------------ Karte ------------------------------ */
export function Routen({ strecken, alleStrecken, akts, dunkel, auf, geladen }: { strecken: Strecke[]; alleStrecken: Strecke[]; akts: Akt[]; dunkel: boolean; auf: Oeffne; geladen: boolean }) {
  const [kacheln, setKacheln] = useState<"karte" | "leer">("karte");
  const [reset, setReset] = useState(0);
  const [q, setQ] = useState("");
  const [fokus, setFokus] = useState<Strecke | null>(null);
  const [offen, setOffen] = useState(false);
  const km = useMemo(() => strecken.length, [strecken]);
  const mitRoute = useMemo(() => new Map(alleStrecken.map((r) => [r.id, r])), [alleStrecken]);
  const treffer = useMemo(() => {
    const w = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!w.length) return [] as Akt[];
    const hits = akts.filter((a) => {
      const iso = a.d.slice(0, 10), de = `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
      const heu = `${a.n} ${iso} ${de} ${KAT_NAME[a.k]} ${a.s}`.toLowerCase();
      return w.every((t) => heu.includes(t));
    });
    return hits.sort((a, c) => c.tag - a.tag);
  }, [q, akts]);
  const waehlen = (a: Akt) => {
    const r = mitRoute.get(a.id);
    setOffen(false);
    if (r) { setFokus(r); setQ(a.n); } else auf(a.id);
  };
  const leeren = () => { setQ(""); setFokus(null); setOffen(false); };
  return (
    <section className="card kartencard">
      <header className="kartenkopf">
        <div className="grow"><h2>Routen</h2><div className="lbl">{geladen ? `${nf(km)} Routen` : "lädt …"}</div></div>
        <div className="kartensuche">
          <input type="text" value={q} placeholder="Suchen: Name, Datum, Sportart" onChange={(e) => { setQ(e.target.value); setOffen(true); if (!e.target.value) setFokus(null); }} onFocus={() => setOffen(true)} onBlur={() => window.setTimeout(() => setOffen(false), 150)} />
          {q && <button className="x" onMouseDown={(e) => e.preventDefault()} onClick={leeren} aria-label="Suche leeren">×</button>}
          {offen && q.trim() && (
            <div className="suchliste">
              {treffer.length === 0 && <div className="leer">Keine Einheit gefunden</div>}
              {treffer.slice(0, 10).map((a) => (
                <button key={a.id} onMouseDown={(e) => e.preventDefault()} onClick={() => waehlen(a)} className={mitRoute.has(a.id) ? "" : "ohne"}>
                  <i style={{ background: KAT_VAR[a.k] }} />
                  <span className="n">{a.n}</span>
                  <span className="mono d">{fmtTag(a.tag, true)}</span>
                  {!mitRoute.has(a.id) && <span className="r">keine Route</span>}
                </button>
              ))}
              {treffer.length > 10 && <div className="leer">+ {treffer.length - 10} weitere</div>}
            </div>
          )}
        </div>
        <Legende kats={KATS.filter((k) => strecken.some((s) => s.k === k))} />
        <Seg klein wert={kacheln} optionen={[["karte", "Karte"], ["leer", "Nur Routen"]]} onChange={setKacheln} />
        <button className="btn small" onClick={() => { setFokus(null); setReset(reset + 1); }}>Alles zeigen</button>
      </header>
      <div className="kartenkoerper"><RoutenKarte strecken={strecken} kacheln={kacheln === "karte"} dunkel={dunkel} reset={reset} auf={auf} fokus={fokus} /></div>
    </section>
  );
}

/* ------------------------------ Tageszeit und Wetter ------------------------------ */
export function TageszeitWetter({ akts, alle, ex, neben, auf }: { akts: Akt[]; alle: Akt[]; ex: Extras; neben: Neben; auf?: Oeffne }) {
  void auf;
  const [mk, setMk] = useState<Metrik>("t");
  const [basis, setBasis] = useState<"Run" | "Ride">("Run");
  const f = basis === "Run" ? effizienzLauf : effizienzRad;
  const pop = useMemo(() => alle.filter((a) => a.k === basis), [alle, basis]);
  const stunden = useMemo(() => stundenBehaelter(akts), [akts]);
  const tz = useMemo(() => gruppen(pop, f, TAGESZEIT_LABELS, tageszeitKey), [pop, f]);
  const mitWetter = (g: (w: number[]) => number) => (x: Akt) => { const w = ex.wetter[x.id]; return w && w.length === 4 ? g(w) : null; };
  const temp = useMemo(() => gruppen(pop, f, TEMP_LABELS, mitWetter((w) => tempKey(w[0]))), [pop, f, ex]);       // eslint-disable-line react-hooks/exhaustive-deps
  const regen = useMemo(() => gruppen(pop, f, REGEN_LABELS, mitWetter((w) => regenKey(w[1]))), [pop, f, ex]);   // eslint-disable-line react-hooks/exhaustive-deps
  const wind = useMemo(() => gruppen(pop, f, WIND_LABELS, mitWetter((w) => windKey(w[2]))), [pop, f, ex]);       // eslint-disable-line react-hooks/exhaustive-deps
  const w = neben.wetter;
  const einheit = basis === "Run" ? "Lauf-Effizienz (Meter pro Minute je Herzschlag)" : "Rad-Effizienz (Watt je Herzschlag)";
  const basisSeg = <Seg klein wert={basis} optionen={[["Run", "Laufen"], ["Ride", "Rad"]]} onChange={setBasis} />;
  return (
    <>
      <div className="wnav">{basisSeg}<span className="muted">{einheit}</span></div>
      {w.gesamt > 0 && w.fertig < w.gesamt && <Hinweis>Wetter wird nachgeladen: {w.fertig} von {w.gesamt} Einheiten.</Hinweis>}
      <div className="raster">
        <Karte klasse="s8" titel="Startzeit" sub="wann du trainierst"
          rechts={<><Legende kats={KATS.filter((k) => akts.some((a) => a.k === k))} /><Seg klein wert={mk} optionen={[["t", "Zeit"], ["m", "Distanz"], ["e", "Höhenmeter"]]} onChange={setMk} /></>}>
          <Volumen b={stunden} mk={mk} monate={false} />
        </Karte>
        <Karte klasse="s4" titel="Tageszeit" sub="Effizienz gegen den Durchschnitt">
          <Abweichung zeilen={tz.zeilen} />
          <div className="fuss muted">Ø {isFinite(tz.gesamt) ? nf(tz.gesamt, 2) : "–"} · {tz.n} Einheiten</div>
        </Karte>
        <Karte klasse="s4" titel="Temperatur" sub="Effizienz gegen den Durchschnitt">
          <Abweichung zeilen={temp.zeilen} />
          <div className="fuss muted">{temp.n} Einheiten mit Wetterdaten</div>
        </Karte>
        <Karte klasse="s4" titel="Niederschlag" sub="während der Einheit">
          <Abweichung zeilen={regen.zeilen} />
          <div className="fuss muted">{regen.n} Einheiten mit Wetterdaten</div>
        </Karte>
        <Karte klasse="s4" titel="Wind" sub="Mittel während der Einheit">
          <Abweichung zeilen={wind.zeilen} />
          <div className="fuss muted">{wind.n} Einheiten mit Wetterdaten</div>
        </Karte>
      </div>
    </>
  );
}
