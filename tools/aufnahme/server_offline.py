# -*- coding: utf-8 -*-
"""
Startet den Dashboard-Server ohne Fenster und komplett OFFLINE (kein Strava-, Garmin- oder Wetter-Abruf),
mit einem kopierten Datenordner (STRAVA_DASHBOARD_DATEN). Nur fuer Bildschirmaufnahmen.

  python tools/aufnahme/server_offline.py <datenordner> <port> <token>
"""
import os
import sys
from pathlib import Path

daten, port, token = sys.argv[1], sys.argv[2], sys.argv[3]
os.environ["STRAVA_DASHBOARD_DATEN"] = daten
REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(REPO / "lib"))

import strava_dashboard as sd  # noqa: E402

dl, gl = sd.dl, sd.gl
dl.details_schleife = lambda ctx: None
dl.wetter_schleife = lambda ctx: None
gl.Garmin.hintergrund = lambda self: None
UNVERBUNDEN = os.environ.get("AUFNAHME_UNVERBUNDEN") == "1"   # Einrichtung im Zustand 'nicht verbunden' zeigen
gl.Garmin.tokens_da = lambda self: not UNVERBUNDEN
gl.Garmin.sync = lambda self, voll=False: {"ok": True}
sd.Sitzung.verbunden = lambda self: not UNVERBUNDEN
sd.Sitzung.synchronisieren = lambda self, d: {"ok": True}
sd.Sitzung._strava_laden = lambda self: setattr(self, "strava", {})

sys.exit(sd.main(["--kein-fenster", "--port", port, "--token", token]))
