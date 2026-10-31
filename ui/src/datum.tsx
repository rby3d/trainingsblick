/* Eigene Datumsauswahl (statt des nativen Datumsfelds), Vorlage: Formkurve ui/Datum.tsx */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Sym } from "./symbole";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const pad = (n: number) => String(n).padStart(2, "0");
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); };
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addTage = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const montag = (s: string) => addTage(s, -((parse(s).getDay() + 6) % 7));
const heute = () => iso(new Date());
const kw = (s: string) => { const d = parse(montag(s)); d.setDate(d.getDate() + 3); const j = new Date(d.getFullYear(), 0, 4, 12); return 1 + Math.round(((d.getTime() - j.getTime()) / 864e5 - 3 + ((j.getDay() + 6) % 7)) / 7); };
const ersterImMonat = (s: string) => s.slice(0, 8) + "01";
const monatPlus = (s: string, n: number) => { const d = parse(ersterImMonat(s)); d.setMonth(d.getMonth() + n); return iso(d); };
/** Kurz, damit es auch in schmalen Spalten passt: „So, 11.07.2027“ */
export const datumText = (s: string) => { const d = parse(s); return `${WT[(d.getDay() + 6) % 7]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };

/** Knopf mit Datum, darunter ein Kalender als Portal. `min` sperrt die Tage davor (Events nicht in der Vergangenheit). */
export function DatumWahl({ value, onChange, label, min }: { value: string; onChange: (v: string) => void; label: string; min?: string }) {
  const [offen, setOffen] = useState(false);
  const [ansicht, setAnsicht] = useState(ersterImMonat(value || heute()));
  const [fokus, setFokus] = useState(value || heute());
  const [monate, setMonate] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const knopf = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const h = heute();
  const erlaubt = (d: string) => !min || d >= min;

  const oeffnen = () => {
    const r = knopf.current?.getBoundingClientRect();
    if (!r) return;
    const breite = 304, hoehe = 372;
    const unten = window.innerHeight - r.bottom - 12;
    const nachOben = unten < hoehe && r.top - 12 > unten;
    const links = Math.max(8, Math.min(r.left, window.innerWidth - breite - 8));
    setPos(nachOben ? { left: links, width: breite, bottom: window.innerHeight - r.top + 6 } : { left: links, width: breite, top: r.bottom + 6 });
    const start = value || (min && min > h ? min : h);
    setAnsicht(ersterImMonat(start)); setFokus(start); setMonate(false); setOffen(true);
  };
  const waehlen = (d: string) => {
    if (!erlaubt(d)) return;
    onChange(d);
    setOffen(false);
    knopf.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!offen) return;
    const weg = (e: Event) => { const t = e.target as Node; if (!pop.current?.contains(t) && !knopf.current?.contains(t)) setOffen(false); };
    const scroll = (e: Event) => { if (!pop.current?.contains(e.target as Node)) setOffen(false); };
    const zu = () => setOffen(false);
    document.addEventListener("mousedown", weg, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", zu);
    pop.current?.querySelector<HTMLElement>(".kal-gitter")?.focus({ preventScroll: true });
    return () => { document.removeEventListener("mousedown", weg, true); window.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", zu); };
  }, [offen]);

  const fokusSetzen = (d: string) => { setFokus(d); if (ersterImMonat(d) !== ansicht) setAnsicht(ersterImMonat(d)); };
  const taste = (e: React.KeyboardEvent) => {
    const schritte: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOffen(false); knopf.current?.focus(); }
    else if (e.key in schritte) { e.preventDefault(); fokusSetzen(addTage(fokus, schritte[e.key])); }
    else if (e.key === "PageUp" || e.key === "PageDown") { e.preventDefault(); const d = parse(fokus); d.setMonth(d.getMonth() + (e.key === "PageUp" ? -1 : 1)); fokusSetzen(iso(d)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); waehlen(fokus); }
  };

  const erster = montag(ansicht);
  const wochen = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, t) => addTage(erster, w * 7 + t)));
  const monat = parse(ansicht).getMonth(), jahr = parse(ansicht).getFullYear();
  const vorZurueck = (n: number) => setAnsicht(monatPlus(ansicht, monate ? n * 12 : n));
  const monatErlaubt = (m: number) => !min || iso(new Date(jahr, m + 1, 0, 12)) >= min;

  return (
    <>
      <button ref={knopf} type="button" className="auswahl datum" aria-haspopup="dialog" aria-expanded={offen} aria-label={label}
        onClick={() => (offen ? setOffen(false) : oeffnen())}
        onKeyDown={(e) => { if (!offen && (e.key === "ArrowDown" || e.key === "Enter")) { e.preventDefault(); oeffnen(); } }}>
        <span className={value ? "" : "muted"}>{value ? datumText(value) : "Datum wählen"}</span>
        <Sym n="kalender" />
      </button>
      {offen && createPortal(
        <div ref={pop} className="kal-pop" style={pos} role="dialog" aria-label={label}>
          <div className="kal-kopf">
            <button type="button" className="btn ghost sq" onClick={() => vorZurueck(-1)} aria-label={monate ? "Voriges Jahr" : "Voriger Monat"}>‹</button>
            <button type="button" className="kal-titel" onClick={() => setMonate(!monate)} aria-label="Monat wählen">{monate ? jahr : `${MONATE[monat]} ${jahr}`}</button>
            <button type="button" className="btn ghost sq" onClick={() => vorZurueck(1)} aria-label={monate ? "Nächstes Jahr" : "Nächster Monat"}>›</button>
          </div>
          {monate ? (
            <div className="kal-monate">
              {MONATE.map((m, i) => (
                <button key={m} type="button" disabled={!monatErlaubt(i)} aria-pressed={i === monat}
                  className={"kal-monat" + (jahr === parse(h).getFullYear() && i === parse(h).getMonth() ? " heute" : "")}
                  onClick={() => { setAnsicht(iso(new Date(jahr, i, 1, 12))); setMonate(false); }}>{m.slice(0, 3)}</button>
              ))}
            </div>
          ) : (
            <div className="kal-gitter" role="grid" tabIndex={0} onKeyDown={taste} aria-label={`${MONATE[monat]} ${jahr}`}>
              <div className="kal-zeile kal-wt" role="row"><span className="kal-kw" aria-hidden="true">KW</span>{WT.map((t) => <span key={t} role="columnheader">{t}</span>)}</div>
              {wochen.map((w) => (
                <div key={w[0]} role="row" className="kal-zeile">
                  <span className="kal-kw" aria-hidden="true">{kw(w[0])}</span>
                  {w.map((d) => (
                    <button key={d} type="button" role="gridcell" tabIndex={-1} aria-selected={d === value} disabled={!erlaubt(d)}
                      className={"kal-tag" + (parse(d).getMonth() !== monat ? " fremd" : "") + (d === h ? " heute" : "") + (d === value ? " an" : "") + (d === fokus ? " fokus" : "")}
                      onClick={() => waehlen(d)}>{parse(d).getDate()}</button>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="kal-fuss">
            <button type="button" className="btn ghost small" disabled={!erlaubt(h)} onClick={() => waehlen(h)}>Heute</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
