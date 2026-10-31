import { ReactNode } from "react";
import { Sym, SymFeld } from "./symbole";
import { nf } from "./util";

export function Seg<T extends string>({ wert, optionen, onChange, klein, label }: { wert: T; optionen: [T, string][]; onChange: (v: T) => void; klein?: boolean; label?: string }) {
  return <div className={`seg${klein ? " klein" : ""}`} role="group" aria-label={label}>{optionen.map(([k, l]) => <button key={k} aria-pressed={wert === k} onClick={() => onChange(k)}>{l}</button>)}</div>;
}

/** Ein Feld im Raster: Kopf mit Symbol, Titel, Zusatz und rechts Bedienung, darunter der Inhalt */
export function Karte({ titel, sub, rechts, children, klasse, sym, farbe }: { titel: string; sub?: string; rechts?: ReactNode; children: ReactNode; klasse?: string; sym?: string; farbe?: string }) {
  return (
    <section className={`feld ${klasse ?? ""}`}>
      <header className="fk">
        <h2>{sym && <SymFeld n={sym} farbe={farbe} klein />}{titel}{sub && <small>{sub}</small>}</h2>
        {rechts && <div className="fk-rechts">{rechts}</div>}
      </header>
      {children}
    </section>
  );
}

export function Hinweis({ children }: { children: ReactNode }) {
  return <div className="infobox"><span className="punkt laeuft" />{children}</div>;
}

/** Seitenkopf: Titel (und Untertitel), danach die Bedienung der Seite */
export function Kopf({ titel, unter, children }: { titel: string; unter?: string; children?: ReactNode }) {
  return (
    <header className="s-kopf">
      <div className="s-titel"><h1>{titel}</h1>{unter && <div className="muted">{unter}</div>}</div>
      {children}
    </header>
  );
}

/** Abschnitt einer Seite: Überschrift ohne eigene Karte */
export function Abschnitt({ titel, sub, sym, farbe, rechts, children }: { titel: string; sub?: string; sym?: string; farbe?: string; rechts?: ReactNode; children: ReactNode }) {
  return (
    <section className="abschnitt">
      <header className="ab-kopf"><h2>{sym && <SymFeld n={sym} farbe={farbe} klein />}{titel}{sub && <small>{sub}</small>}</h2>{rechts}</header>
      {children}
    </section>
  );
}

/** Zahlenleiste: Werte nebeneinander, durch feine Linien getrennt */
export function Zahlen({ children }: { children: ReactNode }) {
  return <div className="zahlen">{children}</div>;
}
export function Zahl({ sym, titel, wert, einheit, fuss, onClick }: { sym?: string; titel: string; wert: string; einheit?: string; fuss?: ReactNode; onClick?: () => void }) {
  const inhalt = (
    <>
      <span className="lbl">{sym && <Sym n={sym} />}{titel}</span>
      <b className="zw">{wert}{einheit && <small>{einheit}</small>}</b>
      <span className="zf">{fuss}</span>
    </>
  );
  return onClick ? <button className="zahl klick" onClick={onClick}>{inhalt}</button> : <div className="zahl">{inhalt}</div>;
}

/** Veränderung gegenüber dem Zeitraum davor */
export function Delta({ jetzt, vor, text = "zum Vorzeitraum" }: { jetzt: number; vor?: number; text?: string }) {
  if (vor === undefined) return <span className="delta">&nbsp;</span>;
  if (vor <= 0) return <span className="delta">{jetzt > 0 ? "neu" : "–"}</span>;
  const p = ((jetzt - vor) / vor) * 100;
  if (Math.abs(p) < 0.5) return <span className="delta">± 0 % <span className="muted">{text}</span></span>;
  return <span className={`delta ${p > 0 ? "auf" : "ab"}`}>{p > 0 ? "▲" : "▼"} {nf(Math.abs(p), Math.abs(p) < 10 ? 1 : 0)} % <span className="muted">{text}</span></span>;
}
