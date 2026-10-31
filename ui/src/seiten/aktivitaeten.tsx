/* Aktivitäten: Woche, Monat oder Jahr mit Zahlen, Tagesleiste/Kalender, Sportarten, Einheiten und Tageszeit/Wetter */
import { useMemo, useState } from "react";
import { Abschnitt, Delta, Karte, Kopf, Seg, Zahl, Zahlen } from "../komp";
import { Heatmap, Jahresvergleich, Volumen } from "../charts";
import { TageszeitWetter } from "../ansichten";
import { Sym, SportSym } from "../symbole";
import {
  Akt, KATS, KAT_NAME, KAT_VAR, Kat, Metrik, behaelter, belastungSumme, fmtDauer, fmtKm, fmtTag, isoKw, jahresreihen, nf, summe, tagDatum, tagNr,
  tagesZeit, tempo, wochenStart, wochentag, WT,
} from "../util";
import { Ctx, MONATE, WTL } from "./ctx";

export type Zoom = "woche" | "monat" | "jahr";
export type Blick = { zoom: Zoom; off: number };

type Spanne = { von: number; bis: number; vorVon: number; vorBis: number; titel: string; sub: string };
/** Zeitraum zum Blick; der Vergleich läuft in der laufenden Spanne nur bis zum gleichen Tag */
export function spanne(b: Blick, heute: number): Spanne {
  const d = tagDatum(heute), y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (b.zoom === "woche") {
    const von = wochenStart(heute) + b.off * 7, bis = von + 6;
    return { von, bis, vorVon: von - 7, vorBis: Math.min(bis, heute) - 7, titel: `KW ${isoKw(von)}`, sub: `${fmtTag(von)}–${fmtTag(bis, true)}` };
  }
  if (b.zoom === "monat") {
    const mm = m + b.off, jy = y + Math.floor(mm / 12), jm = ((mm % 12) + 12) % 12;
    const von = tagNr(jy, jm + 1, 1), bis = tagNr(jm === 11 ? jy + 1 : jy, jm === 11 ? 1 : jm + 2, 1) - 1;
    const vorVon = tagNr(jm === 0 ? jy - 1 : jy, jm === 0 ? 12 : jm, 1);
    return { von, bis, vorVon, vorBis: Math.min(von - 1, vorVon + (Math.min(bis, heute) - von)), titel: MONATE[jm], sub: String(jy) };
  }
  const jy = y + b.off, von = tagNr(jy, 1, 1), bis = tagNr(jy + 1, 1, 1) - 1, vorVon = tagNr(jy - 1, 1, 1);
  return { von, bis, vorVon, vorBis: Math.min(von - 1, vorVon + (Math.min(bis, heute) - von)), titel: String(jy), sub: "Jahr" };
}

/** Anteile je Sportart als ein Balken */
function Anteile({ werte, max, children }: { werte: Record<Kat, number>; max: number; children?: React.ReactNode }) {
  return (
    <div className="spurbalken">
      {KATS.filter((k) => werte[k] > 0).map((k) => <i key={k} style={{ width: `${(werte[k] / max) * 100}%`, background: KAT_VAR[k] }} />)}
      {children}
    </div>
  );
}
const proKat = (l: Akt[]) => { const w: Record<Kat, number> = { Ride: 0, Run: 0, Swim: 0, Other: 0 }; for (const a of l) w[a.k] += a.t; return w; };
const kurzText = (a: Akt) => `${fmtDauer(a.t)} h${a.m >= 100 ? ` · ${nf(a.m / 1000, 1)} km` : ""}`;

/** Woche als Tagesleiste: je Tag ein Balken (Länge = Zeit) und die Einheiten als Chips */
export function Tagesleiste({ akts, start, heute, auf, kompakt }: { akts: Akt[]; start: number; heute: number; auf: (a: Akt) => void; kompakt?: boolean }) {
  const tage = Array.from({ length: 7 }, (_, i) => {
    const tag = start + i;
    const liste = akts.filter((a) => a.tag === tag).sort((a, b) => (a.d < b.d ? -1 : 1));
    return { tag, liste, t: liste.reduce((s, a) => s + a.t, 0) };
  });
  // Platz für den Text hinter dem längsten Balken lassen
  const max = Math.max(kompakt ? 5400 : 7200, ...tage.map((d) => d.t)) * (kompakt ? 1.8 : 1.3);
  return (
    <div className={`tage${kompakt ? " kompakt" : ""}`}>
      {tage.map(({ tag, liste, t }, i) => (
        <div key={tag} className={`tag${tag === heute ? " heute" : ""}${tag > heute ? " zukunft" : ""}`}>
          <div className="tk"><b>{kompakt ? WT[i] : WTL[i]}</b><small>{fmtTag(tag)}</small></div>
          <div className="spur">
            {liste.length ? (
              <>
                <Anteile werte={proKat(liste)} max={max}><em>{fmtDauer(t)} h{kompakt ? ` · ${liste.map((a) => a.n).join(", ")}` : ""}</em></Anteile>
                {!kompakt && (
                  <div className="akts">
                    {liste.map((a) => <button key={a.id} className="akt" onClick={() => auf(a)}><SportSym k={a.k} klein /><span className="an">{a.n}</span><small>{kurzText(a)}</small></button>)}
                  </div>
                )}
              </>
            ) : <span className="pause">{tag > heute ? "" : "Pause"}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Monat als Kalender mit Wochensummen */
function Monatskalender({ akts, von, bis, heute, auf }: { akts: Akt[]; von: number; bis: number; heute: number; auf: (a: Akt) => void }) {
  const wochen: number[] = [];
  for (let w = wochenStart(von); w <= bis; w += 7) wochen.push(w);
  const proTag = useMemo(() => { const m = new Map<number, Akt[]>(); for (const a of akts) if (a.tag >= wochenStart(von) && a.tag <= bis + 7) m.set(a.tag, [...(m.get(a.tag) ?? []), a]); return m; }, [akts, von, bis]);
  return (
    <div className="monat">
      {WT.map((t) => <div key={t} className="wt">{t}</div>)}
      <div className="wt summe">Woche</div>
      {wochen.map((w) => {
        const ws = summe(akts, w, w + 6);
        return [
          ...Array.from({ length: 7 }, (_, i) => {
            const tag = w + i, l = proTag.get(tag) ?? [], t = l.reduce((s, a) => s + a.t, 0);
            return (
              <div key={tag} className={`mz${tag < von || tag > bis ? " anders" : ""}${tag === heute ? " heute" : ""}`}>
                <span className="nr">{tagDatum(tag).getUTCDate()}</span>
                {l.length > 0 && (
                  <>
                    <Anteile werte={proKat(l)} max={Math.max(10800, t)} />
                    <span className="mt">{fmtDauer(t)} h</span>
                    <span className="msym">{l.map((a) => <button key={a.id} className="symknopf" aria-label={a.n} data-tipp={`${a.n} · ${kurzText(a)}`} onClick={() => auf(a)}><SportSym k={a.k} klein /></button>)}</span>
                  </>
                )}
              </div>
            );
          }),
          <div key={`s${w}`} className="mz summe"><span className="lbl">KW {isoKw(w)}</span><b>{fmtDauer(ws.t)} h</b><span className="muted">{ws.m >= 100 ? `${fmtKm(ws.m)} km` : ""}</span></div>,
        ];
      })}
    </div>
  );
}

type SortKey = "tag" | "t" | "m" | "e" | "hr";
/** Einheiten als sortierbare Tabelle */
export function Liste({ akts, auf, max = 80 }: { akts: Akt[]; auf: (a: Akt) => void; max?: number }) {
  const [sort, setSort] = useState<{ k: SortKey; ab: boolean }>({ k: "tag", ab: true });
  const zeilen = useMemo(() => {
    const l = [...akts];
    const f = (a: Akt) => (sort.k === "hr" ? a.hr ?? 0 : sort.k === "tag" ? a.tag * 24 + a.std : a[sort.k]);
    l.sort((a, b) => (f(a) - f(b)) * (sort.ab ? -1 : 1));
    return l;
  }, [akts, sort]);
  const kopf = (k: SortKey, t: string, cls = "") => (
    <th className={cls} onClick={() => setSort((s) => ({ k, ab: s.k === k ? !s.ab : true }))} aria-sort={sort.k === k ? (sort.ab ? "descending" : "ascending") : "none"}>
      {t}{sort.k === k && <span className="sortpfeil">{sort.ab ? "↓" : "↑"}</span>}
    </th>
  );
  return (
    <div className="tabelle">
      <table>
        <thead><tr>{kopf("tag", "Datum")}<th>Einheit</th>{kopf("t", "Dauer", "r")}{kopf("m", "Distanz", "r")}<th className="r">Tempo</th>{kopf("e", "Höhe", "r")}{kopf("hr", "Ø Puls", "r")}</tr></thead>
        <tbody>
          {zeilen.slice(0, max).map((a) => (
            <tr key={a.id} onClick={() => auf(a)}>
              <td className="mono muted">{WT[wochentag(a.tag)]} {fmtTag(a.tag, true)}</td>
              <td className="tn"><SportSym k={a.k} klein />{a.n}</td>
              <td className="r mono">{fmtDauer(a.t)}</td>
              <td className="r mono">{a.m >= 100 ? `${nf(a.m / 1000, 1)} km` : "–"}</td>
              <td className="r mono">{tempo(a)}</td>
              <td className="r mono">{a.e ? `${nf(a.e)} m` : "–"}</td>
              <td className="r mono">{a.hr ? nf(a.hr) : "–"}</td>
            </tr>
          ))}
          {!zeilen.length && <tr><td colSpan={7} className="leer">Keine Einheiten im Zeitraum</td></tr>}
        </tbody>
      </table>
      {zeilen.length > max && <div className="notiz tab-mehr">+ {zeilen.length - max} weitere</div>}
    </div>
  );
}

/** Anteil der Sportarten an der Zeit */
export function Sportarten({ akts }: { akts: Akt[] }) {
  const v = useMemo(() => {
    const t: Record<Kat, { t: number; n: number }> = { Ride: { t: 0, n: 0 }, Run: { t: 0, n: 0 }, Swim: { t: 0, n: 0 }, Other: { t: 0, n: 0 } };
    for (const a of akts) { t[a.k].t += a.t; t[a.k].n += 1; }
    return t;
  }, [akts]);
  const ges = KATS.reduce((s, k) => s + v[k].t, 0) || 1;
  if (!akts.length) return <div className="muted">Noch nichts in diesem Zeitraum</div>;
  return (
    <>
      <Anteile werte={{ Ride: v.Ride.t, Run: v.Run.t, Swim: v.Swim.t, Other: v.Other.t }} max={ges} />
      <div className="sportliste">
        {KATS.filter((k) => v[k].n > 0).sort((a, b) => v[b].t - v[a].t).map((k) => (
          <div key={k} className="sportzeile">
            <SportSym k={k} />
            <span className="grow"><b>{KAT_NAME[k]}</b><small>{Math.round((v[k].t / ges) * 100)} % · {v[k].n} {v[k].n === 1 ? "Einheit" : "Einheiten"}</small></span>
            <b className="mono">{fmtDauer(v[k].t)} h</b>
          </div>
        ))}
      </div>
    </>
  );
}

export function Aktivitaeten({ c, blick, setBlick }: { c: Ctx; blick: Blick; setBlick: (b: Blick) => void }) {
  const { alle, heute, ruhe, maxp, auf } = c;
  const sp = useMemo(() => spanne(blick, heute), [blick, heute]);
  const [mkJahr, setMkJahr] = useState<Metrik>("t");
  const l = useMemo(() => alle.filter((a) => a.tag >= sp.von && a.tag <= sp.bis), [alle, sp]);
  const s = useMemo(() => summe(alle, sp.von, sp.bis), [alle, sp]);
  const v = useMemo(() => summe(alle, sp.vorVon, sp.vorBis), [alle, sp]);
  const bel = useMemo(() => belastungSumme(alle, sp.von, sp.bis, ruhe, maxp), [alle, sp, ruhe, maxp]);
  const belVor = useMemo(() => belastungSumme(alle, sp.vorVon, sp.vorBis, ruhe, maxp), [alle, sp, ruhe, maxp]);
  const heat = useMemo(() => (blick.zoom === "jahr" ? tagesZeit(alle) : new Map<number, number>()), [alle, blick.zoom]);
  const monate = useMemo(() => (blick.zoom === "jahr" ? behaelter(alle, sp.von, sp.bis, true).liste : []), [alle, sp, blick.zoom]);
  const jahre = useMemo(() => (blick.zoom === "jahr" ? jahresreihen(alle, mkJahr, heute) : []), [alle, mkJahr, heute, blick.zoom]);
  const vergleich = blick.zoom === "woche" ? "zur Vorwoche" : blick.zoom === "monat" ? "zum Vormonat" : "zum Vorjahr";
  return (
    <>
      <Kopf titel="Aktivitäten">
        <Seg label="Zeitraum" wert={blick.zoom} optionen={[["woche", "Woche"], ["monat", "Monat"], ["jahr", "Jahr"]]} onChange={(z) => setBlick({ zoom: z, off: 0 })} />
        <div className="blaettern">
          <button className="btn sq" aria-label="Früher" onClick={() => setBlick({ ...blick, off: blick.off - 1 })}>‹</button>
          <div className="bl-titel"><b>{sp.titel}</b><span className="muted">{sp.sub}</span></div>
          <button className="btn sq" aria-label="Später" disabled={blick.off >= 0} onClick={() => setBlick({ ...blick, off: blick.off + 1 })}>›</button>
          {blick.off < 0 && <button className="btn" onClick={() => setBlick({ ...blick, off: 0 })}>Heute</button>}
        </div>
        <span className="grow" />
        <button className="btn" onClick={() => c.studio({ ids: l.map((a) => a.id), modus: "sammel" })}><Sym n="teilen" />{blick.zoom === "woche" ? "Woche" : blick.zoom === "monat" ? "Monat" : "Jahr"} teilen …</button>
      </Kopf>

      <section className="feld">
        <Zahlen>
          <Zahl sym="uhr" titel="Zeit" wert={fmtDauer(s.t)} einheit="h" fuss={<Delta jetzt={s.t} vor={v.t} text={vergleich} />} />
          <Zahl sym="strecke" titel="Distanz" wert={fmtKm(s.m)} einheit="km" fuss={<Delta jetzt={s.m} vor={v.m} text={vergleich} />} />
          <Zahl sym="berg" titel="Höhenmeter" wert={nf(s.e)} einheit="m" fuss={<Delta jetzt={s.e} vor={v.e} text={vergleich} />} />
          <Zahl sym="liste" titel="Einheiten" wert={nf(s.n)} fuss={<Delta jetzt={s.n} vor={v.n} text={vergleich} />} />
          <Zahl sym="flamme" titel="Belastung" wert={nf(bel)} fuss={<Delta jetzt={bel} vor={belVor} text={vergleich} />} />
        </Zahlen>
      </section>

      <div className="raster">
        <section className="feld s9">
          {blick.zoom === "woche" && <Tagesleiste akts={l} start={sp.von} heute={heute} auf={auf} />}
          {blick.zoom === "monat" && <Monatskalender akts={alle} von={sp.von} bis={sp.bis} heute={heute} auf={auf} />}
          {blick.zoom === "jahr" && (
            <>
              <Heatmap tage={heat} heute={heute} von={sp.von} bis={sp.bis} />
              <div className="lbl">Zeit je Monat</div>
              <Volumen b={monate} mk="t" monate />
            </>
          )}
        </section>
        <section className="feld s3">
          <header className="fk"><h2>Sportarten</h2></header>
          <Sportarten akts={l} />
        </section>
      </div>

      {blick.zoom === "jahr" && (
        <div className="raster">
          <Karte klasse="s12" titel="Jahresvergleich" sub="kumuliert" rechts={<Seg klein wert={mkJahr} optionen={[["t", "Zeit"], ["m", "Distanz"], ["e", "Höhenmeter"]]} onChange={setMkJahr} />}>
            <Jahresvergleich reihen={jahre} mk={mkJahr} />
          </Karte>
        </div>
      )}

      <Abschnitt titel="Einheiten" sub={`${l.length} in ${blick.zoom === "woche" ? sp.titel : `${sp.titel}${blick.zoom === "monat" ? ` ${sp.sub}` : ""}`}`} sym="liste">
        <section className="feld tab-feld"><Liste akts={l} auf={auf} max={blick.zoom === "jahr" ? 200 : 80} /></section>
      </Abschnitt>

      <details className="einfl">
        <summary><Sym n="sonne" /><span>Tageszeit und Wetter</span><small>Effizienz gegen deinen Durchschnitt, alle Einheiten</small></summary>
        <div className="einfl-inhalt"><TageszeitWetter akts={alle} alle={alle} ex={c.extras} neben={c.neben} /></div>
      </details>
    </>
  );
}
