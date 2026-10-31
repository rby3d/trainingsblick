import { ReactNode, useEffect } from "react";

export function Modal(p: { titel: string; onClose?: () => void; children: ReactNode; foot?: ReactNode; size?: "schmal" | "breit" | "" }) {
  useEffect(() => {
    if (!p.onClose) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); p.onClose?.(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [p.onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && p.onClose) p.onClose(); }}>
      <div className={`modal ${p.size ?? ""}`} role="dialog" aria-label={p.titel}>
        <div className="mh">
          <h2>{p.titel}</h2>
          {p.onClose && <button className="btn ghost sq" onClick={p.onClose} aria-label="Schließen">✕</button>}
        </div>
        <div className="mb">{p.children}</div>
        {p.foot && <div className="mf">{p.foot}</div>}
      </div>
    </div>
  );
}

export function Chev({ open, onClick }: { open: boolean; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <span className={`chev ${open ? "open" : ""}`} onClick={onClick}>
      <svg viewBox="0 0 10 10"><path d="M2 0l6 5-6 5z" /></svg>
    </span>
  );
}

/** Rueckfrage mit zwei Knoepfen. */
export function Bestaetigen(p: { titel: string; children: ReactNode; ja: string; onJa: () => void; onNein: () => void; gefahr?: boolean }) {
  return (
    <Modal titel={p.titel} size="schmal" onClose={p.onNein}
      foot={<><button className="btn" onClick={p.onNein}>Abbrechen</button>
        <button className={`btn ${p.gefahr ? "bad" : "primary"}`} onClick={p.onJa}>{p.ja}</button></>}>
      {p.children}
    </Modal>
  );
}

/** Ergebnisanzeige. */
export function Info(p: { titel: string; children: ReactNode; onClose: () => void; extra?: ReactNode }) {
  return (
    <Modal titel={p.titel} size="schmal" onClose={p.onClose}
      foot={<>{p.extra}<button className="btn primary" onClick={p.onClose}>OK</button></>}>
      {p.children}
    </Modal>
  );
}
