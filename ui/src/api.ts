const win = window as unknown as { __T?: string };
const T = win.__T && win.__T !== "__TOKEN__" ? win.__T : new URLSearchParams(location.search).get("t") ?? "";

export const token = () => T;

export class ApiFehler extends Error {
  details: string;
  constructor(m: string, d = "") { super(m); this.details = d; }
}

export async function rpc<R = unknown>(name: string, body: unknown = {}): Promise<R> {
  let r: Response;
  try {
    r = await fetch(`/api/${name}?t=${encodeURIComponent(T)}`, { method: "POST", body: JSON.stringify(body) });
  } catch {
    throw new ApiFehler("Keine Verbindung zum Script. Wurde das Fenster geschlossen?");
  }
  const txt = await r.text();
  let j: unknown = null;
  try { j = txt ? JSON.parse(txt) : null; } catch { /* leer */ }
  if (!r.ok) {
    const o = (j ?? {}) as { fehler?: string; details?: string };
    throw new ApiFehler(o.fehler || `Fehler ${r.status}`, o.details || "");
  }
  return j as R;
}


export function beenden() {
  try { navigator.sendBeacon(`/api/beenden?t=${encodeURIComponent(T)}`, "{}"); } catch { /* egal */ }
}
