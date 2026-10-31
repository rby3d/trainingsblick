import { ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Behaelter, Fitness, JahrReihe, KATS, KAT_NAME, KAT_VAR, METRIK, Metrik, fmtDauer, fmtMetrik, fmtTag, monatKurz, nf, tagDatum, tagNr, wochentag, WT } from "./util";

export function useBreite<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [b, setB] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setB(el.clientWidth || 600);
    const ro = new ResizeObserver(() => setB(el.clientWidth || 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, b];
}

type Tip = { x: number; y: number; inhalt: ReactNode } | null;
function TipBox({ tip, breite }: { tip: Tip; breite: number }) {
  if (!tip) return null;
  const rechts = tip.x > breite * 0.62;
  return <div className="tip" style={{ left: tip.x, top: Math.max(4, tip.y), transform: `translate(${rechts ? "calc(-100% - 14px)" : "14px"}, 0)` }}>{tip.inhalt}</div>;
}

function schritt(max: number, n = 4): number {
  if (max <= 0) return 1;
  const roh = max / n, p = Math.pow(10, Math.floor(Math.log10(roh)));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * p >= roh) return f * p;
  return 10 * p;
}
function ticks(max: number, n = 4): number[] {
  const s = schritt(max, n), out: number[] = [];
  for (let v = 0; v <= max + s * 0.999; v += s) out.push(v);
  return out;
}
const rund = (v: number, d: number) => v.toLocaleString("de-DE", { maximumFractionDigits: d });

/** Balken oben abgerundet, unten gerade. */
function balkenPfad(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

export function Legende({ kats }: { kats: readonly (typeof KATS)[number][] }) {
  return <div className="legende">{kats.map((k) => <span key={k}><i style={{ background: KAT_VAR[k] }} />{KAT_NAME[k]}</span>)}</div>;
}

/* ---------------- Wochenvolumen (gestapelt) ---------------- */
export function Volumen({ b, mk, monate }: { b: Behaelter[]; mk: Metrik; monate: boolean }) {
  const [ref, breite] = useBreite<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [tip, setTip] = useState<Tip>(null);
  const H = 250, L = 46, R = 10, T = 10, U = 24;
  const innen = Math.max(50, breite - L - R), hoehe = H - T - U;
  const conv = METRIK[mk].f;
  const maxv = Math.max(0.0001, ...b.map((x) => conv(x.gesamt[mk])));
  const tk = ticks(maxv * 1.04);
  const top = tk[tk.length - 1] || 1;
  const sl = innen / Math.max(1, b.length), bw = Math.max(2, Math.min(34, sl * 0.72));
  const jeLabel = Math.max(1, Math.ceil(52 / sl));
  const y = (v: number) => T + hoehe - (v / top) * hoehe;
  return (
    <div className="chartbox" ref={ref} onMouseLeave={() => { setHover(null); setTip(null); }}>
      <svg width={breite} height={H} role="img" aria-label={`${METRIK[mk].name} je ${monate ? "Monat" : "Woche"}`}>
        {tk.map((v) => (
          <g key={v}>
            <line x1={L} x2={breite - R} y1={y(v)} y2={y(v)} className="gitter" />
            <text x={L - 8} y={y(v) + 4} className="achse" textAnchor="end">{rund(v, v < 10 && v % 1 ? 1 : 0)}</text>
          </g>
        ))}
        {hover !== null && <rect x={L + hover * sl} y={T} width={sl} height={hoehe} className="hoverband" />}
        {b.map((x, i) => {
          const cx = L + i * sl + sl / 2;
          let acc = 0;
          const segs = KATS.filter((k) => x.w[k][mk] > 0);
          return (
            <g key={x.von}>
              {segs.map((k, si) => {
                const v = conv(x.w[k][mk]), h = (v / top) * hoehe, y0 = y(acc + v);
                acc += v;
                const letzte = si === segs.length - 1;
                const gap = si > 0 ? 2 : 0;
                const hh = Math.max(0, h - gap);
                if (hh < 0.5) return null;
                return letzte ? <path key={k} d={balkenPfad(cx - bw / 2, y0, bw, hh, 4)} fill={KAT_VAR[k]} />
                  : <rect key={k} x={cx - bw / 2} y={y0} width={bw} height={hh} fill={KAT_VAR[k]} />;
              })}
              {i % jeLabel === 0 && <text x={cx} y={H - 7} className="achse" textAnchor="middle">{x.label}</text>}
              <rect x={L + i * sl} y={T} width={sl} height={hoehe + U} fill="transparent"
                onMouseMove={(e) => {
                  setHover(i);
                  const r = ref.current!.getBoundingClientRect();
                  setTip({ x: e.clientX - r.left, y: e.clientY - r.top - 10, inhalt: (
                    <>
                      <b>{x.titel}</b>
                      {KATS.filter((k) => x.w[k][mk] > 0).map((k) => <div key={k} className="tr"><span><i style={{ background: KAT_VAR[k] }} />{KAT_NAME[k]}</span><span className="mono">{fmtMetrik(mk, x.w[k][mk])}</span></div>)}
                      <div className="tr sum"><span>Gesamt</span><span className="mono">{fmtMetrik(mk, x.gesamt[mk])}</span></div>
                    </>) });
                }} />
            </g>
          );
        })}
        <text x={L} y={T - 1} className="achse einheit">{METRIK[mk].einheit}</text>
      </svg>
      <TipBox tip={tip} breite={breite} />
    </div>
  );
}

/* ---------------- Fitness / Ermuedung / Form ---------------- */
export function FitnessChart({ f, von, bis, kompakt }: { f: Fitness | null; von: number; bis: number; kompakt?: boolean }) {
  const [ref, breite] = useBreite<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  // kompakt: nur Fitness und Ermuedung (Uebersicht), sonst darunter die Form
  const L = 46, R = 12, T = 10, H1 = kompakt ? 130 : 170, H2 = kompakt ? 0 : 62, GAP = kompakt ? 0 : 24, H = kompakt ? T + H1 + 26 : 300;
  const v0 = f ? Math.max(von, f.start) : von, n = bis - v0 + 1;
  if (!f || n < 2) return <div className="chartbox" ref={ref}><div className="leer">{f ? "Zu wenig Daten" : "Keine Daten"}</div></div>;
  const innen = Math.max(50, breite - L - R);
  const off = v0 - f.start;
  const ctl = f.ctl.slice(off, off + n), atl = f.atl.slice(off, off + n);
  const form = ctl.map((c, i) => c - atl[i]);
  const max1 = Math.max(10, ...ctl, ...atl);
  const tk = ticks(max1 * 1.05, 4), top = tk[tk.length - 1];
  const fm = Math.max(10, ...form.map(Math.abs));
  const fs = schritt(fm, 2), fTop = Math.ceil(fm / fs) * fs;
  const x = (i: number) => L + (i / (n - 1)) * innen;
  const y1 = (v: number) => T + H1 - (v / top) * H1;
  const y0b = T + H1 + GAP;
  const y2 = (v: number) => y0b + H2 / 2 - (v / fTop) * (H2 / 2);
  const pfad = (w: number[], yf: (v: number) => number) => w.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${yf(v).toFixed(1)}`).join("");
  const flaeche = `M${x(0)},${y2(0)} ` + form.map((v, i) => `L${x(i).toFixed(1)},${y2(v).toFixed(1)}`).join(" ") + ` L${x(n - 1)},${y2(0)} Z`;
  const monatsMarken: { i: number; t: string }[] = [];
  for (let i = 0; i < n; i += 1) {
    const d = tagDatum(v0 + i);
    if (d.getUTCDate() === 1 && monatsMarken.length < 40) monatsMarken.push({ i, t: d.getUTCMonth() === 0 ? `${monatKurz(0)} ${String(d.getUTCFullYear()).slice(2)}` : monatKurz(d.getUTCMonth()) });
  }
  const stride = Math.max(1, Math.ceil(52 / Math.max(1, (innen / n) * 30.4)));
  const marken = monatsMarken.filter((_, k) => k % stride === 0);
  const hv = hover;
  return (
    <div className="chartbox" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg width={breite} height={H} role="img" aria-label="Fitness, Ermüdung und Form"
        onMouseMove={(e) => {
          const r = ref.current!.getBoundingClientRect();
          const px = e.clientX - r.left;
          const i = Math.round(((px - L) / innen) * (n - 1));
          setHover(i >= 0 && i < n ? i : null);
        }}>
        {tk.map((v) => (
          <g key={v}><line x1={L} x2={breite - R} y1={y1(v)} y2={y1(v)} className="gitter" /><text x={L - 8} y={y1(v) + 4} className="achse" textAnchor="end">{rund(v, 0)}</text></g>
        ))}
        <path d={pfad(atl, y1)} className="linie" stroke="var(--c-atl)" />
        <path d={pfad(ctl, y1)} className="linie" stroke="var(--c-ctl)" />
        {!kompakt && (
          <>
            <line x1={L} x2={breite - R} y1={y2(0)} y2={y2(0)} className="gitter null" />
            <path d={flaeche} className="formflaeche" />
            <path d={pfad(form, y2)} className="linie dünn" stroke="var(--muted)" />
            <text x={L - 8} y={y2(0) + 4} className="achse" textAnchor="end">0</text>
            <text x={L - 8} y={y2(fTop) + 8} className="achse" textAnchor="end">+{rund(fTop, 0)}</text>
            <text x={L - 8} y={y2(-fTop) } className="achse" textAnchor="end">−{rund(fTop, 0)}</text>
            <text x={L} y={y0b - 6} className="achse einheit">Form</text>
          </>
        )}
        {marken.map((m) => <text key={m.i} x={x(m.i)} y={H - 6} className="achse" textAnchor="middle">{m.t}</text>)}
        {hv !== null && (
          <g>
            <line x1={x(hv)} x2={x(hv)} y1={T} y2={y0b + H2} className="fadenkreuz" />
            <circle cx={x(hv)} cy={y1(ctl[hv])} r={4.5} fill="var(--c-ctl)" className="ring" />
            <circle cx={x(hv)} cy={y1(atl[hv])} r={4.5} fill="var(--c-atl)" className="ring" />
          </g>
        )}
      </svg>
      {hv !== null && (
        <div className="tip" style={{ left: x(hv), top: T + 6, transform: `translate(${x(hv) > breite * 0.62 ? "calc(-100% - 14px)" : "14px"}, 0)` }}>
          <b>{fmtTag(v0 + hv, true)}</b>
          <div className="tr"><span><i style={{ background: "var(--c-ctl)" }} />Fitness</span><span className="mono">{nf(ctl[hv], 0)}</span></div>
          <div className="tr"><span><i style={{ background: "var(--c-atl)" }} />Ermüdung</span><span className="mono">{nf(atl[hv], 0)}</span></div>
          <div className="tr sum"><span>Form</span><span className="mono">{form[hv] > 0 ? "+" : ""}{nf(form[hv], 0)}</span></div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Kalender-Heatmap ---------------- */
/** bis: letzter gezeigter Tag (Standard heute), von: Tage davor bleiben leer (z. B. ein Kalenderjahr) */
export function Heatmap({ tage, heute, von, bis }: { tage: Map<number, number>; heute: number; von?: number; bis?: number }) {
  const [ref, breite] = useBreite<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  const L = 26, T = 18, spalten = 53;
  const zelle = Math.max(8, Math.min(26, (breite - L - 4) / spalten));
  const g = zelle - 3;
  const ende = bis ?? heute;
  const start = wochenStart7(ende) - (spalten - 1) * 7;
  let max = 0;
  tage.forEach((v, k) => { if (k >= start && k <= Math.min(heute, ende) && v > max) max = v; });
  const stufe = (v: number) => (v <= 0 ? 0 : Math.min(5, 1 + Math.floor((v / (max || 1)) * 4.999)));
  const zellen: JSX.Element[] = [];
  const monate: JSX.Element[] = [];
  let letzterMonat = -1;
  for (let c = 0; c < spalten; c++) {
    for (let r = 0; r < 7; r++) {
      const n = start + c * 7 + r;
      if (n > heute || n > ende || (von !== undefined && n < von)) continue;
      const v = tage.get(n) ?? 0;
      zellen.push(
        <rect key={n} x={L + c * zelle} y={T + r * zelle} width={g} height={g} rx={3} className={`hz s${stufe(v)}`}
          onMouseMove={(e) => {
            const rc = ref.current!.getBoundingClientRect();
            setTip({ x: e.clientX - rc.left, y: e.clientY - rc.top - 8, inhalt: <><b>{WT[wochentag(n)]}, {fmtTag(n, true)}</b><div className="mono">{v ? `${fmtDauer(v)} h` : "Pause"}</div></> });
          }} />);
    }
    const d = tagDatum(start + c * 7 + 3);
    if (d.getUTCMonth() !== letzterMonat && c < spalten - 1) {
      letzterMonat = d.getUTCMonth();
      monate.push(<text key={c} x={L + c * zelle} y={11} className="achse">{monatKurz(letzterMonat)}</text>);
    }
  }
  return (
    <div className="chartbox" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg width={breite} height={T + 7 * zelle + 4} role="img" aria-label="Trainingskalender">
        {monate}
        {[0, 2, 4].map((r) => <text key={r} x={0} y={T + r * zelle + g - 1} className="achse">{WT[r]}</text>)}
        {zellen}
      </svg>
      <div className="skala"><span>weniger</span>{[0, 1, 2, 3, 4, 5].map((s) => <svg key={s} width={13} height={13}><rect width={13} height={13} rx={3} className={`hz s${s}`} /></svg>)}<span>mehr</span></div>
      <TipBox tip={tip} breite={breite} />
    </div>
  );
}
const wochenStart7 = (n: number) => n - wochentag(n);

/* ---------------- Jahresvergleich ---------------- */
export function Jahresvergleich({ reihen, mk }: { reihen: JahrReihe[]; mk: Metrik }) {
  const [ref, breite] = useBreite<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 250, L = 46, R = 44, T = 10, U = 24;
  const innen = Math.max(50, breite - L - R), hoehe = H - T - U;
  const conv = METRIK[mk].f;
  const max = Math.max(0.0001, ...reihen.map((r) => conv(r.werte[r.werte.length - 1] ?? 0)));
  const tk = ticks(max * 1.05, 4), top = tk[tk.length - 1];
  const x = (i: number) => L + (i / 365) * innen;
  const y = (v: number) => T + hoehe - (conv(v) / top) * hoehe;
  const farbe = (i: number) => (i === reihen.length - 1 ? "var(--accent)" : `color-mix(in srgb, var(--muted) ${40 + (i + 1) * 15}%, var(--surface))`);
  const endlabels = reihen.map((r) => ({ jahr: r.jahr, ende: r.ende, y: y(r.werte[r.werte.length - 1] ?? 0) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < endlabels.length; i++) if (endlabels[i].y - endlabels[i - 1].y < 13) endlabels[i].y = endlabels[i - 1].y + 13;
  const monatsStart = Array.from({ length: 12 }, (_, m) => tagNr(2025, m + 1, 1) - tagNr(2025, 1, 1));
  return (
    <div className="chartbox" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg width={breite} height={H} role="img" aria-label="Kumulierter Jahresvergleich"
        onMouseMove={(e) => { const r = ref.current!.getBoundingClientRect(); const i = Math.round(((e.clientX - r.left - L) / innen) * 365); setHover(i >= 0 && i <= 365 ? i : null); }}>
        {tk.map((v) => <g key={v}><line x1={L} x2={breite - R} y1={T + hoehe - (v / top) * hoehe} y2={T + hoehe - (v / top) * hoehe} className="gitter" /><text x={L - 8} y={T + hoehe - (v / top) * hoehe + 4} className="achse" textAnchor="end">{rund(v, 0)}</text></g>)}
        {monatsStart.map((d, m) => <text key={m} x={x(d)} y={H - 7} className="achse">{monatKurz(m)}</text>)}
        {reihen.map((r, ri) => (
          <path key={r.jahr} d={r.werte.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("")} className="linie" stroke={farbe(ri)} style={ri === reihen.length - 1 ? undefined : { strokeWidth: 1.8 }} />
        ))}
        {endlabels.map((l) => <text key={l.jahr} x={x(l.ende) + 6} y={l.y + 4} className="achse ende">{l.jahr}</text>)}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={T + hoehe} className="fadenkreuz" />}
        {hover !== null && reihen.map((r, ri) => hover <= r.ende ? <circle key={r.jahr} cx={x(hover)} cy={y(r.werte[hover])} r={4} fill={farbe(ri)} className="ring" /> : null)}
      </svg>
      {hover !== null && (
        <div className="tip" style={{ left: x(hover), top: T + 6, transform: `translate(${x(hover) > breite * 0.62 ? "calc(-100% - 14px)" : "14px"}, 0)` }}>
          <b>{fmtTag(tagNr(2025, 1, 1) + hover).slice(0, 6)}</b>
          {[...reihen].reverse().map((r) => <div key={r.jahr} className="tr"><span>{r.jahr}</span><span className="mono">{hover <= r.ende ? fmtMetrik(mk, r.werte[hover]) : "–"}</span></div>)}
        </div>
      )}
    </div>
  );
}

/* ---------------- Wochentage ---------------- */
export function Wochentage({ werte }: { werte: number[] }) {
  const [ref, breite] = useBreite<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  const H = 190, T = 10, U = 22, L = 4;
  const max = Math.max(1, ...werte), sl = (breite - L * 2) / 7, bw = Math.min(34, sl * 0.62), hoehe = H - T - U;
  const summe = werte.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="chartbox" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg width={breite} height={H} role="img" aria-label="Trainingszeit je Wochentag">
        <line x1={L} x2={breite - L} y1={T + hoehe} y2={T + hoehe} className="gitter" />
        {werte.map((v, i) => {
          const h = (v / max) * hoehe, cx = L + i * sl + sl / 2;
          return (
            <g key={i}>
              {h > 0.5 && <path d={balkenPfad(cx - bw / 2, T + hoehe - h, bw, h, 4)} fill="var(--accent)" opacity={0.92} />}
              <text x={cx} y={H - 6} className="achse" textAnchor="middle">{WT[i]}</text>
              <rect x={L + i * sl} y={0} width={sl} height={H} fill="transparent" onMouseMove={(e) => {
                const rc = ref.current!.getBoundingClientRect();
                setTip({ x: e.clientX - rc.left, y: e.clientY - rc.top - 10, inhalt: <><b>{WT[i]}</b><div className="mono">{fmtDauer(v)} h · {Math.round((v / summe) * 100)} %</div></> });
              }} />
            </g>
          );
        })}
      </svg>
      <TipBox tip={tip} breite={breite} />
    </div>
  );
}

export function Spark({ werte, breite = 110, hoehe = 30 }: { werte: number[]; breite?: number; hoehe?: number }) {
  if (werte.length < 2) return <svg width={breite} height={hoehe} />;
  const max = Math.max(...werte, 0.0001);
  const pts = werte.map((v, i) => `${i ? "L" : "M"}${((i / (werte.length - 1)) * (breite - 4) + 2).toFixed(1)},${(hoehe - 3 - (v / max) * (hoehe - 8)).toFixed(1)}`).join("");
  return <svg width={breite} height={hoehe} aria-hidden="true"><path d={pts} className="spark" /></svg>;
}

/* ---------------- Route ---------------- */
export function Route({ punkte }: { punkte: number[][] }) {
  if (punkte.length < 2) return <div className="leer">Keine Route</div>;
  const lat0 = punkte.reduce((a, p) => a + p[0], 0) / punkte.length, k = Math.cos((lat0 * Math.PI) / 180);
  const xs = punkte.map((p) => p[1] * k), ys = punkte.map((p) => -p[0]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const W = 420, H = 300, pad = 18, s = Math.min((W - 2 * pad) / Math.max(1e-9, maxx - minx), (H - 2 * pad) / Math.max(1e-9, maxy - miny));
  const ox = (W - (maxx - minx) * s) / 2, oy = (H - (maxy - miny) * s) / 2;
  const P = punkte.map((_, i) => [ox + (xs[i] - minx) * s, oy + (ys[i] - miny) * s]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="route" role="img" aria-label="Route">
      <path d={P.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("")} className="routenlinie" />
      <circle cx={P[0][0]} cy={P[0][1]} r={5} className="start" />
      <circle cx={P[P.length - 1][0]} cy={P[P.length - 1][1]} r={5} className="ziel" />
    </svg>
  );
}


/* ---------------- Streudiagramm mit Trendlinie (Entwicklung, Bestzeiten-Verlauf) ---------------- */
function niceBereich(min: number, max: number, n = 4): { lo: number; hi: number; tk: number[] } {
  if (!(max > min)) { max = min + 1; }
  const s = schritt((max - min) * 1.1, n), lo = Math.floor((min - (max - min) * 0.05) / s) * s, hi = Math.ceil((max + (max - min) * 0.05) / s) * s;
  const tk: number[] = [];
  for (let v = lo; v <= hi + s * 0.001; v += s) tk.push(v);
  return { lo, hi, tk };
}
export function Streu({ punkte, trend, von, bis, fmt, besserNiedrig, farbe, tickFmt, onKlick, h = 230 }: {
  punkte: { tag: number; wert: number; id: string; n: string }[]; trend: { tag: number; wert: number }[]; von: number; bis: number;
  fmt: (v: number) => string; besserNiedrig: boolean; farbe: string; tickFmt?: (v: number) => string; onKlick?: (id: string) => void; h?: number;
}) {
  const [ref, breite] = useBreite<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const ohneEinheit = (v: number) => fmt(v).replace(/\s*(\/km|\/100 m|km\/h|W)$/, "");
  const L = 52, R = 12, T = 10, U = 24;
  const innen = Math.max(50, breite - L - R), hoehe = h - T - U;
  const alle = punkte.map((p) => p.wert).concat(trend.map((t) => t.wert));
  if (!punkte.length) return <div className="chartbox" ref={ref}><div className="leer">Keine passenden Einheiten</div></div>;
  const { lo, hi, tk } = niceBereich(Math.min(...alle), Math.max(...alle));
  const dx = Math.max(1, bis - von);
  const x = (t: number) => L + ((t - von) / dx) * innen;
  const y = (v: number) => T + (besserNiedrig ? (v - lo) / (hi - lo) : 1 - (v - lo) / (hi - lo)) * hoehe;
  const marken: { t: number; txt: string }[] = [];
  const mn = (bis - von) / 30.4, stride = Math.max(1, Math.ceil(mn / Math.max(2, innen / 64)));
  let k = 0;
  for (let t = von; t <= bis; t++) {
    const d = tagDatum(t);
    if (d.getUTCDate() === 1) { if (k++ % stride === 0) marken.push({ t, txt: d.getUTCMonth() === 0 || marken.length === 0 ? `${monatKurz(d.getUTCMonth())} ${String(d.getUTCFullYear()).slice(2)}` : monatKurz(d.getUTCMonth()) }); }
  }
  const nah = (px: number, py: number) => {
    let b = -1, bd = 18 * 18;
    punkte.forEach((p, i) => { const dd = (x(p.tag) - px) ** 2 + (y(p.wert) - py) ** 2; if (dd < bd) { bd = dd; b = i; } });
    return b < 0 ? null : b;
  };
  const hp = hover !== null ? punkte[hover] : null;
  return (
    <div className="chartbox" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg width={breite} height={h} role="img" style={{ cursor: hp && onKlick ? "pointer" : "default" }}
        onMouseMove={(e) => { const r = ref.current!.getBoundingClientRect(); setHover(nah(e.clientX - r.left, e.clientY - r.top)); }}
        onClick={() => { if (hp && onKlick) onKlick(hp.id); }}>
        {tk.map((v) => <g key={v}><line x1={L} x2={breite - R} y1={y(v)} y2={y(v)} className="gitter" /><text x={L - 8} y={y(v) + 4} className="achse" textAnchor="end">{(tickFmt ?? ohneEinheit)(v)}</text></g>)}
        {marken.map((m) => <text key={m.t} x={x(m.t)} y={h - 6} className="achse" textAnchor="middle">{m.txt}</text>)}
        {punkte.map((p, i) => <circle key={p.id} cx={x(p.tag)} cy={y(p.wert)} r={3.4} fill={farbe} opacity={hover === i ? 1 : 0.42} />)}
        {trend.length > 1 && <path d={trend.filter((t) => t.tag >= von).map((t, i) => `${i ? "L" : "M"}${x(t.tag).toFixed(1)},${y(t.wert).toFixed(1)}`).join("")} className="linie trendl" stroke={farbe} />}
        {hp && <circle cx={x(hp.tag)} cy={y(hp.wert)} r={5.5} fill={farbe} className="ring" />}
      </svg>
      {hp && (
        <div className="tip" style={{ left: x(hp.tag), top: Math.max(4, y(hp.wert) - 58), transform: `translate(${x(hp.tag) > breite * 0.62 ? "calc(-100% - 14px)" : "14px"}, 0)` }}>
          <b>{hp.n}</b><div className="tr"><span>{fmtTag(hp.tag, true)}</span><span className="mono">{fmt(hp.wert)}</span></div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Abweichung vom Durchschnitt (waagerechte Balken um eine Mittellinie) ---------------- */
export function Abweichung({ zeilen, minN = 3 }: { zeilen: { label: string; n: number; abw: number }[]; minN?: number }) {
  const gueltig = zeilen.filter((z) => z.n >= minN && isFinite(z.abw));
  const max = Math.max(2, ...gueltig.map((z) => Math.abs(z.abw)));
  return (
    <div className="abw">
      {zeilen.map((z) => {
        const ok = z.n >= minN && isFinite(z.abw);
        const breite = ok ? (Math.abs(z.abw) / max) * 50 : 0;
        return (
          <div key={z.label} className={`abwzeile${ok ? "" : " leise"}`}>
            <span className="abwlabel">{z.label}</span>
            <div className="abwspur">
              <i className="mitte" />
              {ok && <i className={`abwbalken ${z.abw >= 0 ? "plus" : "minus"}`} style={z.abw >= 0 ? { left: "50%", width: `${breite}%` } : { right: "50%", width: `${breite}%` }} />}
            </div>
            <span className="abwwert mono">{ok ? `${z.abw > 0 ? "+" : z.abw < 0 ? "−" : ""}${nf(Math.abs(z.abw), 1)} %` : "–"}</span>
            <span className="abwn muted mono">{z.n}×</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Schlaf je Nacht (gestapelt: tief, REM, leicht, wach) ---------------- */
export type Nacht = { tag: number; tief: number; rem: number; leicht: number; wach: number; score?: number };
const SCHLAF_TEILE: { k: "tief" | "rem" | "leicht" | "wach"; name: string; farbe: string }[] = [
  { k: "tief", name: "Tiefschlaf", farbe: "var(--c-ride)" },
  { k: "rem", name: "REM", farbe: "var(--c-swim)" },
  { k: "leicht", name: "Leichtschlaf", farbe: "color-mix(in srgb, var(--c-ride) 38%, var(--surface2))" },
  { k: "wach", name: "Wach", farbe: "var(--c-run)" },
];
export function SchlafLegende() {
  return <div className="legende">{SCHLAF_TEILE.map((t) => <span key={t.k}><i style={{ background: t.farbe }} />{t.name}</span>)}</div>;
}
export function SchlafBalken({ n, von, bis, h = 250 }: { n: Nacht[]; von: number; bis: number; h?: number }) {
  const [ref, breite] = useBreite<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [tip, setTip] = useState<Tip>(null);
  const H = h, L = 46, R = 10, T = 10, U = 24;
  const innen = Math.max(50, breite - L - R), hoehe = H - T - U;
  const tage = Math.max(1, bis - von + 1);
  const sl = innen / tage, bw = Math.max(1.5, Math.min(26, sl * 0.74));
  const gesamt = (x: Nacht) => (x.tief + x.rem + x.leicht + x.wach) / 3600;
  const maxv = Math.max(8, ...n.map(gesamt));
  const top = Math.ceil((maxv * 1.02) / 2) * 2;
  const tk = Array.from({ length: top / 2 + 1 }, (_, i) => i * 2);
  const y = (v: number) => T + hoehe - (v / top) * hoehe;
  const jeLabel = Math.max(1, Math.ceil(60 / sl));
  if (!n.length) return <div className="chartbox" ref={ref}><div className="leer">Keine Schlafdaten</div></div>;
  return (
    <div className="chartbox" ref={ref} onMouseLeave={() => { setHover(null); setTip(null); }}>
      <svg width={breite} height={H} role="img" aria-label="Schlaf je Nacht">
        {tk.map((v) => (
          <g key={v}>
            <line x1={L} x2={breite - R} y1={y(v)} y2={y(v)} className="gitter" />
            <text x={L - 8} y={y(v) + 4} className="achse" textAnchor="end">{rund(v, 0)}</text>
          </g>
        ))}
        {hover !== null && <rect x={L + hover * sl} y={T} width={sl} height={hoehe} className="hoverband" />}
        {n.map((x) => {
          const i = x.tag - von;
          if (i < 0 || i >= tage) return null;
          const cx = L + i * sl + sl / 2;
          let acc = 0;
          const teile = SCHLAF_TEILE.filter((t) => x[t.k] > 0);
          return (
            <g key={x.tag}>
              {teile.map((t, si) => {
                const v = x[t.k] / 3600, h = (v / top) * hoehe, y0 = y(acc + v);
                acc += v;
                const hh = Math.max(0, h - (si > 0 ? 1 : 0));
                if (hh < 0.4) return null;
                return si === teile.length - 1 ? <path key={t.k} d={balkenPfad(cx - bw / 2, y0, bw, hh, Math.min(3, bw / 2))} fill={t.farbe} />
                  : <rect key={t.k} x={cx - bw / 2} y={y0} width={bw} height={hh} fill={t.farbe} />;
              })}
              <rect x={L + i * sl} y={T} width={sl} height={hoehe + U} fill="transparent"
                onMouseMove={(e) => {
                  setHover(i);
                  const r = ref.current!.getBoundingClientRect();
                  setTip({ x: e.clientX - r.left, y: e.clientY - r.top - 10, inhalt: (
                    <>
                      <b>{WT[wochentag(x.tag)]} {fmtTag(x.tag, true)}</b>
                      {SCHLAF_TEILE.filter((t) => x[t.k] > 0).map((t) => <div key={t.k} className="tr"><span><i style={{ background: t.farbe }} />{t.name}</span><span className="mono">{fmtDauer(x[t.k])}</span></div>)}
                      <div className="tr sum"><span>Gesamt</span><span className="mono">{fmtDauer(gesamt(x) * 3600)} h</span></div>
                      {x.score ? <div className="tr"><span>Schlaf-Score</span><span className="mono">{nf(x.score)}</span></div> : null}
                    </>) });
                }} />
            </g>
          );
        })}
        {Array.from({ length: tage }, (_, i) => i).filter((i) => i % jeLabel === 0).map((i) => (
          <text key={i} x={L + i * sl + sl / 2} y={H - 7} className="achse" textAnchor="middle">{fmtTag(von + i)}</text>
        ))}
        <text x={L} y={T - 1} className="achse einheit">h</text>
      </svg>
      <TipBox tip={tip} breite={breite} />
    </div>
  );
}
