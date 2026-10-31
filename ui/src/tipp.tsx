import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* Eigene Tooltips statt des nativen title-Attributs (Vorlage: Formkurve ui/Tipp.tsx): Elemente mit data-tipp="…"
   zeigen beim Überfahren mit der Maus bzw. beim Fokussieren mit der Tastatur eine kleine Karte über dem Element. */

const ZIEL = "[data-tipp]";
type Stand = { text: string; x: number; y: number; unten: boolean };

export function TippHost() {
  const [stand, setStand] = useState<Stand | null>(null);
  const ziel = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const blase = useRef<HTMLDivElement>(null);
  const [verschub, setVerschub] = useState(0);

  useEffect(() => {
    const zeigen = (el: HTMLElement, sofort: boolean) => {
      const text = el.getAttribute("data-tipp");
      window.clearTimeout(timer.current);
      if (!text) return;
      ziel.current = el;
      timer.current = window.setTimeout(() => {
        if (ziel.current !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        const unten = r.top < 56;
        setVerschub(0);
        setStand({ text, x: r.left + r.width / 2, y: unten ? r.bottom + 8 : r.top - 8, unten });
      }, sofort ? 0 : 380);
    };
    const weg = () => { window.clearTimeout(timer.current); ziel.current = null; setStand(null); };
    const over = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = (e.target as Element | null)?.closest?.(ZIEL) as HTMLElement | null;
      if (el === ziel.current) return;
      if (el) zeigen(el, !!stand); else weg();
    };
    const fokus = (e: FocusEvent) => {
      const el = (e.target as Element | null)?.closest?.(ZIEL) as HTMLElement | null;
      if (el && (e.target as HTMLElement).matches(":focus-visible")) zeigen(el, false);
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerdown", weg, true);
    document.addEventListener("focusin", fokus);
    document.addEventListener("focusout", weg);
    window.addEventListener("scroll", weg, true);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerdown", weg, true);
      document.removeEventListener("focusin", fokus);
      document.removeEventListener("focusout", weg);
      window.removeEventListener("scroll", weg, true);
    };
  }, [stand]);

  // am Bildschirmrand nach innen schieben
  useEffect(() => {
    const b = blase.current;
    if (!b || !stand) return;
    const r = b.getBoundingClientRect();
    const d = r.left < 8 ? 8 - r.left : r.right > window.innerWidth - 8 ? window.innerWidth - 8 - r.right : 0;
    if (d) setVerschub(d);
  }, [stand]);

  if (!stand) return null;
  return createPortal(
    <div ref={blase} className={"tipp-blase" + (stand.unten ? " unten" : "")} role="tooltip"
      style={{ left: stand.x + verschub, top: stand.y, ["--pfeil" as string]: -verschub + "px" }}>
      {stand.text}
    </div>,
    document.body,
  );
}
