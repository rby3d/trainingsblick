// Was alle Seiten brauchen: Daten, Einstellungen und Aktionen aus App.tsx
import type { Akt, Ev, Extras, Zeitraum } from "../util";
import type { GDaten, GZ } from "../erholung";
import type { Empf } from "../empfehlung";
import type { Neben } from "../ansichten";
import type { StudioStart } from "../studio/Studio";

export type Einst = { ruhepuls: number; maxpuls: number; events: Ev[]; zeitraum: Zeitraum; sport: string; ansicht: string; wochenziel: number };
export type Zustand = { ver: number; sync: { busy: boolean; text: string; fehler: boolean; fertig: number }; verb: { busy: boolean; text: string }; verbunden: boolean;
  n: number; jetzt: number; ver2: number; neben: Neben; garmin?: GZ; version?: string; update?: { neu?: string } };
export type Seite = "uebersicht" | "aktivitaeten" | "koerper" | "zeiten" | "karte";
export type Aktion = (name: string, body?: unknown) => Promise<void>;
export type HauptEv = Ev & { tage: number };

export type Ctx = {
  alle: Akt[]; heute: number; ruhe: number; maxp: number; demo: boolean;
  einst: Einst | null; extras: Extras; neben: Neben; gdaten: GDaten | null; gz: GZ; empf: Empf | null;
  /** kommende Events, Haupt-Event zuerst */
  events: HauptEv[];
  auf: (a: Akt) => void; aufId: (id: string) => void;
  aktion: Aktion; zeige: (t: string, fehler?: boolean) => void;
  gehe: (s: Seite) => void; einstellungen: () => void;
  /** Share Studio öffnen (Einzeln, Sammelbild, Video) */
  studio: (s: StudioStart) => void;
};

export const NEBEN_LEER: Neben = { details: { fertig: 0, gesamt: 0, pause: "" }, wetter: { fertig: 0, gesamt: 0 } };
export const WTL = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
export const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
