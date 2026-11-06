/* Bilder und Videos speichern: der Windows-Dialog kommt direkt aus dem Fenster (File System Access API von Edge/Chrome),
   die Seite schreibt die Datei selbst. Der Dialog darf nur direkt nach einem Klick aufgehen, deshalb wird das Ziel
   VOR dem Rechnen gewählt (dateiWaehlen/ordnerWaehlen im Klick-Handler, danach erst zeichnen und schreiben).
   Ohne die API (anderer Browser): Datei ans Script schicken, das sie mit eigenem Dialog ablegt (lib/ablage.py). */
import { rpc, token } from "./api";

/** Was nach dem Speichern angezeigt wird; `ordner` nur, wenn der Pfad bekannt ist (dann gibt es den Knopf „Ordner“) */
export type Gespeichert = { text: string; ordner?: string };
export type DateiZiel = { schreiben: (blob: Blob) => Promise<Gespeichert | null> };
export type OrdnerZiel = { schreiben: (name: string, blob: Blob) => Promise<void>; fertig: (anzahl: number) => Promise<Gespeichert | null> };

type Schreibbar = { write: (b: Blob) => Promise<void>; close: () => Promise<void> };
type DateiHandle = { name: string; createWritable: () => Promise<Schreibbar> };
type OrdnerHandle = { name: string; getFileHandle: (n: string, o: { create: boolean }) => Promise<DateiHandle> };
type Picker = {
  showSaveFilePicker?: (o: unknown) => Promise<DateiHandle>;
  showDirectoryPicker?: (o: unknown) => Promise<OrdnerHandle>;
};
const w = window as unknown as Picker;

const TYPEN: Record<string, { description: string; accept: Record<string, string[]> }> = {
  png: { description: "PNG-Bild", accept: { "image/png": [".png"] } },
  mp4: { description: "MP4-Video", accept: { "video/mp4": [".mp4"] } },
  webm: { description: "WebM-Video", accept: { "video/webm": [".webm"] } },
};
const abgebrochen = (e: unknown) => (e as Error)?.name === "AbortError";
const ordnerVon = (p: string) => p.replace(/[\\/][^\\/]*$/, "");

async function hochladen(gruppe: string, blob: Blob, name: string) {
  const r = await fetch(`/hochladen?gruppe=${gruppe}&name=${encodeURIComponent(name)}&t=${encodeURIComponent(token())}`, { method: "POST", body: blob });
  if (!r.ok) throw new Error("Datei konnte nicht übergeben werden");
}
async function inDatei(h: DateiHandle, blob: Blob) {
  const s = await h.createWritable();
  await s.write(blob);
  await s.close();
}

/** Speicherort für eine Datei wählen; null = abgebrochen. Im Klick-Handler aufrufen, bevor gerechnet wird. */
export async function dateiWaehlen(name: string): Promise<DateiZiel | null> {
  if (!w.showSaveFilePicker) {
    return {
      schreiben: async (blob) => {
        const gruppe = "teilen" + Date.now().toString(36);
        await hochladen(gruppe, blob, name);
        const r = await rpc<{ abgebrochen: boolean; pfad?: string }>("teilen_ablegen", { gruppe, name });
        return r.abgebrochen || !r.pfad ? null : { text: "Gespeichert: " + r.pfad, ordner: ordnerVon(r.pfad) };
      },
    };
  }
  const typ = TYPEN[(name.split(".").pop() || "").toLowerCase()];
  let h: DateiHandle;
  try {
    h = await w.showSaveFilePicker({ suggestedName: name, id: "strava-teilen", startIn: "pictures", types: typ ? [typ] : undefined });
  } catch (e) {
    if (abgebrochen(e)) return null;
    throw e;
  }
  return { schreiben: async (blob) => { await inDatei(h, blob); return { text: "Gespeichert: " + h.name }; } };
}

/** Ordner für mehrere Dateien wählen; null = abgebrochen. Im Klick-Handler aufrufen, bevor gerechnet wird. */
export async function ordnerWaehlen(): Promise<OrdnerZiel | null> {
  if (!w.showDirectoryPicker) {
    const gruppe = "bilder" + Date.now().toString(36);
    const namen: string[] = [];
    return {
      schreiben: async (name, blob) => { await hochladen(gruppe, blob, name); namen.push(name); },
      fertig: async () => {
        const r = await rpc<{ abgebrochen: boolean; ordner?: string; anzahl?: number }>("teilen_ablegen_ordner", { gruppe, namen });
        return r.abgebrochen ? null : { text: `${r.anzahl} Bilder gespeichert: ${r.ordner}`, ordner: r.ordner };
      },
    };
  }
  let o: OrdnerHandle;
  try {
    o = await w.showDirectoryPicker({ id: "strava-teilen", startIn: "pictures", mode: "readwrite" });
  } catch (e) {
    if (abgebrochen(e)) return null;
    throw e;
  }
  return {
    schreiben: async (name, blob) => inDatei(await o.getFileHandle(name, { create: true }), blob),
    fertig: async (anzahl) => ({ text: `${anzahl} Bilder gespeichert im Ordner „${o.name}“` }),
  };
}
