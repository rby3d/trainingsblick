# -*- coding: utf-8 -*-
"""
Gibt es eine neuere Version? Einmal je Start fragt das Dashboard bei GitHub nach dem neuesten Release
(api.github.com, ohne Anmeldung; mitgeschickt wird nur die Programmversion im User-Agent). Installiert wird nichts von selbst:
die Oberflaeche zeigt einen Hinweis mit Link auf die Release-Seite, dort laedt man die neue Setup.exe.
"""
from __future__ import annotations

import json
import re
import urllib.request

import version


def _zahlen(v):
    return tuple(int(x) for x in re.findall(r"\d+", v or "")[:3])


def pruefen(timeout=8):
    """{"neu": "1.2.0"} wenn auf GitHub eine hoehere Version liegt, sonst {} (auch bei jedem Fehler: kein Netz, Limit ...)."""
    try:
        req = urllib.request.Request("https://api.github.com/repos/%s/releases/latest" % version.REPO,
                                     headers={"Accept": "application/vnd.github+json", "User-Agent": "Trainingsblick/" + version.VERSION})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            tag = str(json.loads(r.read().decode("utf-8")).get("tag_name") or "")
    except Exception:       # noqa: BLE001
        return {}
    return {"neu": tag.lstrip("v")} if _zahlen(tag) > _zahlen(version.VERSION) else {}
