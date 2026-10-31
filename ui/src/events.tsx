import { Ev, nf } from "./util";

const TAG = 864e5;
export const tageBis = (datum: string, heute: number) => Math.round(Date.parse(datum + "T00:00:00Z") / TAG - heute);

function fmtDatum(d: string) {
  const t = new Date(d + "T00:00:00Z");
  return t.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Grosse Anzeige: Wochen und Tage bis zum Haupt-Event, darunter die uebrigen Events. */
export function Countdown({ events, heute }: { events: Ev[]; heute: number }) {
  const kommend = events.map((e) => ({ ...e, tage: tageBis(e.datum, heute) })).filter((e) => e.tage >= 0).sort((a, b) => a.tage - b.tage);
  if (!kommend.length) return null;
  const haupt = kommend.find((e) => e.haupt) || kommend[0];
  const rest = kommend.filter((e) => e !== haupt);
  const wochen = Math.floor(haupt.tage / 7), rtage = haupt.tage % 7;
  const gesamt = Math.max(1, tageBis(haupt.datum, Math.round(Date.parse(haupt.von + "T00:00:00Z") / TAG)));
  const anteil = Math.max(0, Math.min(1, 1 - haupt.tage / gesamt));
  const woche = Math.min(Math.ceil(gesamt / 7), Math.floor((gesamt - haupt.tage) / 7) + 1);
  const gross = haupt.tage === 0 ? "Heute" : haupt.tage < 56 ? `${nf(haupt.tage)} ${haupt.tage === 1 ? "Tag" : "Tage"}` : `${nf(wochen)} Wochen`;
  const klein = haupt.tage === 0 ? "" : haupt.tage < 56
    ? `${wochen ? `${nf(wochen)} Wo. ${rtage ? `${rtage} T.` : ""}` : ""}`
    : `${rtage ? `${rtage} ${rtage === 1 ? "Tag" : "Tage"} · ` : ""}${nf(haupt.tage)} Tage`;
  return (
    <section className="card countdown">
      <div className="cd-haupt">
        <div className="cd-zahl">{gross}</div>
        <div className="cd-text"><b>{haupt.name}</b><span className="muted">{fmtDatum(haupt.datum)}{klein ? ` · ${klein.trim()}` : ""}</span></div>
      </div>
      <div className="cd-balken" title={`Woche ${woche} von ${Math.ceil(gesamt / 7)}`}><i style={{ width: `${anteil * 100}%` }} /></div>
      {rest.length > 0 && (
        <div className="cd-rest">
          {rest.slice(0, 5).map((e, i) => (
            <span key={i} className="pill">{e.name} · {e.tage === 0 ? "heute" : e.tage < 56 ? `${nf(e.tage)} ${e.tage === 1 ? "Tag" : "Tage"}` : `${nf(Math.floor(e.tage / 7))} Wochen`}</span>
          ))}
        </div>
      )}
    </section>
  );
}
