/* Eigene Auswahlliste statt des nativen <select> (Vorlage: resolve_tools/src/auswahl.tsx, ohne Favoriten) */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";

export type Opt = { value: string; label: string };

export function Auswahl({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: Opt[]; label: string }) {
  const [offen, setOffen] = useState(false);
  const [aktiv, setAktiv] = useState(0);
  const [pos, setPos] = useState<CSSProperties>({});
  const knopf = useRef<HTMLButtonElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const aktuell = options.find((o) => o.value === value);

  const oeffnen = () => { setAktiv(Math.max(0, options.findIndex((o) => o.value === value))); setOffen(true); };
  const waehlen = (v: string) => { onChange(v); setOffen(false); knopf.current?.focus(); };

  useLayoutEffect(() => {
    if (!offen || !knopf.current) return;
    const r = knopf.current.getBoundingClientRect();
    const unten = window.innerHeight - r.bottom - 12;
    const nachOben = unten < Math.min(320, options.length * 36 + 12) && r.top > unten;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 220) - 8)), minWidth: r.width,
      ...(nachOben ? { bottom: window.innerHeight - r.top + 6, maxHeight: Math.min(320, r.top - 12) } : { top: r.bottom + 6, maxHeight: Math.min(320, unten) }) });
  }, [offen, options.length]);

  useEffect(() => {
    if (!offen) return;
    const taste = (e: KeyboardEvent) => {
      const stop = () => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
      if (e.key === "Escape") { stop(); setOffen(false); knopf.current?.focus(); }
      else if (e.key === "ArrowDown") { stop(); setAktiv((a) => Math.min(a + 1, options.length - 1)); }
      else if (e.key === "ArrowUp") { stop(); setAktiv((a) => Math.max(a - 1, 0)); }
      else if (e.key === "Enter" || e.key === " ") { stop(); if (options[aktiv]) waehlen(options[aktiv].value); }
      else if (e.key === "Tab") setOffen(false);
    };
    const aussen = (e: Event) => { const t = e.target as Node; if (!liste.current?.contains(t) && !knopf.current?.contains(t)) setOffen(false); };
    const zu = (e: Event) => { if (e.type === "scroll" && liste.current?.contains(e.target as Node)) return; setOffen(false); };
    window.addEventListener("keydown", taste, true);
    window.addEventListener("pointerdown", aussen, true);
    window.addEventListener("resize", zu);
    window.addEventListener("scroll", zu, true);
    return () => {
      window.removeEventListener("keydown", taste, true);
      window.removeEventListener("pointerdown", aussen, true);
      window.removeEventListener("resize", zu);
      window.removeEventListener("scroll", zu, true);
    };
  });

  return (
    <>
      <button ref={knopf} type="button" className="aw-knopf" aria-label={label} aria-haspopup="listbox" aria-expanded={offen}
        onClick={() => (offen ? setOffen(false) : oeffnen())}
        onKeyDown={(e) => { if (!offen && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); oeffnen(); } }}>
        <span className="nm">{aktuell?.label ?? ""}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {offen && createPortal(
        <div ref={liste} className="aw-liste" style={pos} role="listbox" aria-label={label}>
          {options.map((o, i) => (
            <div key={o.value} role="option" aria-selected={o.value === value} className={"aw-opt" + (i === aktiv ? " on" : "")}
              onMouseMove={() => aktiv !== i && setAktiv(i)} onClick={() => waehlen(o.value)}>
              <span className="nm">{o.label}</span>
              {o.value === value && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
