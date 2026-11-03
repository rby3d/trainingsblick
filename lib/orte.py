# -*- coding: utf-8 -*-
"""
Wo das Dashboard seine Daten ablegt. Alles, was der Nutzer einstellt oder was geladen wurde, liegt AUSSERHALB des
Programmordners (Windows: %APPDATA%\\StravaDashboard). So kann man den Programmordner bei einem Update einfach ersetzen.

  DATEN    Grundordner (Umgebungsvariable STRAVA_DASHBOARD_DATEN, sonst %APPDATA%\\StravaDashboard bzw. ~/.strava_dashboard)
  CONFIG   Einstellungen (strava_dashboard.json), nichts Geheimes
  GEHEIM   Zugangsdaten Strava und Garmin, verschluesselt (lib/tresor.py); Windows: %LOCALAPPDATA%\\StravaDashboard\\geheim
  CACHE    Zwischenspeicher (Aktivitaeten, Bestzeiten, Runden, Wetter, Garmin-Tage) - kann geloescht werden, laedt dann neu
  LOGS     Fehlerberichte
  TON      eigene Sounds fuer die Videos (<name>.mp3), optional
"""
from __future__ import annotations

import os
from pathlib import Path

PROGRAMM = Path(__file__).resolve().parent.parent


def _daten() -> Path:
    eigen = (os.environ.get("STRAVA_DASHBOARD_DATEN") or "").strip().strip('"')
    if eigen:
        return Path(eigen)
    if os.name == "nt" and os.environ.get("APPDATA"):
        return Path(os.environ["APPDATA"]) / "StravaDashboard"
    return Path.home() / ".strava_dashboard"


def _geheim() -> Path:
    """Zugangsdaten (verschluesselt, lib/tresor.py) lokal statt im mitwandernden Profil."""
    if (os.environ.get("STRAVA_DASHBOARD_DATEN") or "").strip():
        return _daten() / "geheim"
    if os.name == "nt" and os.environ.get("LOCALAPPDATA"):
        return Path(os.environ["LOCALAPPDATA"]) / "StravaDashboard" / "geheim"
    return _daten() / "geheim"


DATEN = _daten()
GEHEIM = _geheim()
CONFIG = DATEN / "config"
CACHE = DATEN / "cache"
LOGS = DATEN / "logs"
TON = DATEN / "ton"
