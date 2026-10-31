# -*- coding: utf-8 -*-
"""
Strava-Dashboard - Logik ohne Oberflaeche: Aktivitaeten von Strava holen, zwischenspeichern, Demo-Daten, Einstellungen.
Die Auswertung (Wochenvolumen, Fitness/Form, Heatmap ...) rechnet die React-Oberflaeche selbst, damit Filter sofort greifen.
Zugang: lib\\strava_api.py. Daten liegen ausserhalb des Programmordners (lib\\orte.py).
"""
from __future__ import annotations

import datetime as dt
import json
import math
import os
import random
import time
import urllib.error
import urllib.parse
import urllib.request
import orte

CONFIG_PATH = orte.CONFIG / "strava_dashboard.json"
CACHE_PATH = orte.CACHE / "aktivitaeten.json"
EXTRAS_PATH = orte.CACHE / "extras.json"
SCHEMA = 2                      # Aenderung -> Verlauf wird einmal neu von Strava geholt
DETAIL_FENSTER = 80             # Detail-Abrufe je 15 Minuten (Strava-Limit: 100 Abrufe / 15 min, 1000 / Tag)
DETAIL_TAGESLIMIT = 700
WETTER_ARCHIV = "https://archive-api.open-meteo.com/v1/archive"
WETTER_PROGNOSE = "https://api.open-meteo.com/v1/forecast"

STANDARD = {"ruhepuls": 50, "maxpuls": 0, "ziel_name": "", "ziel_datum": "", "zeitraum": "12w", "sport": "alle", "ansicht": "uebersicht", "wochenziel": 0, "fenster": None}
RUN_TYPES = ("Run", "TrailRun", "VirtualRun")


def kategorie(sport):
    if sport in RUN_TYPES:
        return "Run"
    if "Ride" in sport or sport in ("Handcycle", "Velomobile"):
        return "Ride"
    if sport == "Swim":
        return "Swim"
    return "Other"


def cfg_laden():
    c = dict(STANDARD)
    try:
        c.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        pass
    return c


def cfg_speichern(c):
    try:
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_PATH.write_text(json.dumps(c, indent=2, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass


def schlank(a):
    """Strava-Aktivitaet -> kleine Zeile fuer die Oberflaeche (Route wird erst bei Bedarf geliefert)."""
    sport = a.get("sport_type") or a.get("type") or "Workout"
    mp = a.get("map") or {}
    poly = mp.get("summary_polyline") or ""
    z = {"id": str(a.get("id")), "n": a.get("name") or sport, "s": sport, "k": kategorie(sport),
         "d": (a.get("start_date_local") or a.get("start_date") or "")[:19].replace("Z", ""),
         "m": round(float(a.get("distance") or 0), 1), "t": int(a.get("moving_time") or a.get("elapsed_time") or 0),
         "e": round(float(a.get("total_elevation_gain") or 0), 1), "kud": int(a.get("kudos_count") or 0),
         "tr": bool(a.get("trainer")), "r": bool(poly)}
    ll = a.get("start_latlng") or []
    ll = [round(float(ll[0]), 3), round(float(ll[1]), 3)] if len(ll) == 2 and not z["tr"] else []
    for kurz, lang in (("hr", "average_heartrate"), ("mhr", "max_heartrate"), ("w", "average_watts"), ("nw", "weighted_average_watts")):
        if a.get(lang):
            z[kurz] = round(float(a[lang]), 1)
    return z, poly, ll


class Speicher:
    """Zwischenspeicher aller Aktivitaeten (Zeilen, Routen, Startpunkte) in .cache."""

    def __init__(self):
        self.akt = {}       # id -> Zeile
        self.routen = {}    # id -> polyline
        self.ll = {}        # id -> [lat, lng] (nur fuer die Wetterabfrage, geht nie an die Oberflaeche)
        self.stand = 0.0
        self.laden()

    def laden(self):
        try:
            j = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
            if j.get("schema") != SCHEMA:
                return
            self.akt = {z["id"]: z for z in j.get("akt", [])}
            self.routen = j.get("routen", {})
            self.ll = j.get("ll", {})
            self.stand = float(j.get("stand", 0))
        except (OSError, ValueError, KeyError, TypeError):
            pass

    def speichern(self):
        try:
            CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            tmp = CACHE_PATH.with_suffix(".tmp")
            tmp.write_text(json.dumps({"schema": SCHEMA, "akt": list(self.akt.values()), "routen": self.routen, "ll": self.ll,
                                       "stand": self.stand}, ensure_ascii=False), encoding="utf-8")
            tmp.replace(CACHE_PATH)
        except OSError:
            pass

    def liste(self):
        return sorted(self.akt.values(), key=lambda z: z["d"])


class Extras:
    """Nachgeladene Zusatzdaten: Bestzeiten je Lauf (Strava best_efforts), Runden (Laps) und Wetter je Einheit (Open-Meteo)."""

    def __init__(self):
        self.be = {}        # id -> {Distanzname: Sekunden}
        self.lp = {}        # id -> [[Bewegungszeit s, Distanz m, Puls, Watt], ...] (leer = abgerufen, keine Runden)
        self.wetter = {}    # id -> [Temperatur, Niederschlag mm, Wind km/h, Wettercode]
        self.tag = ""
        self.anzahl = 0     # Detail-Abrufe am heutigen Tag
        self.laden()

    def laden(self):
        try:
            j = json.loads(EXTRAS_PATH.read_text(encoding="utf-8"))
            self.be, self.wetter, self.lp = j.get("be", {}), j.get("wetter", {}), j.get("lp", {})
            self.tag, self.anzahl = j.get("tag", ""), int(j.get("anzahl", 0))
        except (OSError, ValueError, TypeError):
            pass

    def speichern(self):
        try:
            EXTRAS_PATH.parent.mkdir(parents=True, exist_ok=True)
            tmp = EXTRAS_PATH.with_suffix(".tmp")
            tmp.write_text(json.dumps({"be": self.be, "lp": self.lp, "wetter": self.wetter, "tag": self.tag, "anzahl": self.anzahl},
                                      ensure_ascii=False), encoding="utf-8")
            tmp.replace(EXTRAS_PATH)
        except OSError:
            pass

    def heute_anzahl(self):
        if self.tag != dt.date.today().isoformat():
            self.tag, self.anzahl = dt.date.today().isoformat(), 0
        return self.anzahl


def synchronisieren(cfg_strava, speicher, voll=False, melden=lambda t: None):
    """Holt neue Aktivitaeten (inkrementell ab 3 Tage vor der letzten, sonst alles). Rueckgabe: Anzahl neuer/geaenderter."""
    import strava_api as sl
    inkrementell = bool(speicher.akt) and not voll
    params = {"per_page": 200}
    if inkrementell:
        letzte = max(z["d"] for z in speicher.akt.values())
        try:
            ts = dt.datetime.strptime(letzte[:19], "%Y-%m-%dT%H:%M:%S")
            params["after"] = int((ts - dt.timedelta(days=4) - dt.datetime(1970, 1, 1)).total_seconds())
        except ValueError:
            inkrementell = False
    neu = {}
    routen = {}
    lls = {}
    seite = 1
    while seite <= 60:
        params["page"] = seite
        res = sl.api_get(cfg_strava, "/athlete/activities", params)
        for a in res:
            z, poly, ll = schlank(a)
            neu[z["id"]] = z
            if poly:
                routen[z["id"]] = poly
            if ll:
                lls[z["id"]] = ll
        melden("Lade Aktivitäten … %d" % len(neu))
        if len(res) < 200:
            break
        seite += 1
    if not inkrementell:
        speicher.akt, speicher.routen, speicher.ll = {}, {}, {}
    geaendert = sum(1 for k, z in neu.items() if speicher.akt.get(k) != z)
    speicher.akt.update(neu)
    speicher.routen.update(routen)
    speicher.ll.update(lls)
    speicher.stand = time.time()
    speicher.speichern()
    return geaendert


def polyline_dekodieren(s):
    pts, i, lat, lng = [], 0, 0, 0
    while i < len(s):
        for which in (0, 1):
            shift = res = 0
            while True:
                b = ord(s[i]) - 63
                i += 1
                res |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            d = ~(res >> 1) if res & 1 else res >> 1
            if which == 0:
                lat += d
            else:
                lng += d
        pts.append([round(lat / 1e5, 5), round(lng / 1e5, 5)])
    if len(pts) > 400:
        schritt = len(pts) / 400.0
        pts = [pts[int(k * schritt)] for k in range(400)] + [pts[-1]]
    return pts


def polyline_kodieren(pts):
    def wert(v):
        v = ~(v << 1) if v < 0 else v << 1
        out = ""
        while v >= 0x20:
            out += chr((0x20 | (v & 0x1F)) + 63)
            v >>= 5
        return out + chr(v + 63)
    out, la, lo = "", 0, 0
    for lat, lng in pts:
        a, b = int(round(lat * 1e5)), int(round(lng * 1e5))
        out += wert(a - la) + wert(b - lo)
        la, lo = a, b
    return out


# ---------------------------------------------------------------------------
# Hintergrund: Bestzeiten je Lauf (Strava) und Wetter (Open-Meteo)
# ---------------------------------------------------------------------------
def best_efforts(detail):
    return {e["name"]: int(e["elapsed_time"]) for e in (detail.get("best_efforts") or []) if e.get("name") and e.get("elapsed_time")}


RUNDEN_SPORT = ("Run", "Ride", "Swim")


def runden(detail):
    """Runden (Laps) kompakt wie in Formkurve: [Bewegungszeit s, Distanz m, Ø Puls, Ø Watt]. Strukturierte Workouts von Garmin
    kommen als eine Runde je Schritt an, daran erkennt das Studio Intervalle."""
    out = []
    for l in (detail.get("laps") or [])[:80]:
        t = int(l.get("moving_time") or l.get("elapsed_time") or 0)
        if t <= 0:
            continue
        out.append([t, round(float(l.get("distance") or 0), 1), round(float(l.get("average_heartrate") or 0)),
                    round(float(l.get("average_watts") or 0))])
    return out if len(out) > 1 else []


def detail_merken(extras, z, detail):
    """Aus einem Detail-Abruf Bestzeiten (Lauf) und Runden uebernehmen."""
    if z["k"] == "Run":
        extras.be[z["id"]] = best_efforts(detail)
    if z["k"] in RUNDEN_SPORT:
        extras.lp[z["id"]] = runden(detail)


def details_schleife(ctx):
    """Holt je Lauf die best_efforts und je Lauf, Rad- und Schwimmeinheit die Runden (neueste zuerst), hoechstens DETAIL_FENSTER
    je 15 Minuten, nie mehr als das Tageslimit."""
    import strava_api as sl
    zeiten, fehl, seit = [], set(), 0
    while not ctx.stopp.is_set():
        alle = ctx.speicher.liste()
        laeufe = [z for z in alle if z["k"] == "Run"]
        fehlt = lambda z: (z["k"] == "Run" and z["id"] not in ctx.extras.be) or (z["k"] in RUNDEN_SPORT and z["id"] not in ctx.extras.lp)  # noqa: E731
        offen = [z for z in reversed(alle) if fehlt(z) and z["id"] not in fehl]
        ctx.status["details"] = {"fertig": sum(1 for z in laeufe if z["id"] in ctx.extras.be), "gesamt": len(laeufe), "pause": ""}
        if not offen or ctx.strava is None or not ctx.strava.get("refresh_token"):
            ctx.stopp.wait(20)
            continue
        if ctx.extras.heute_anzahl() >= DETAIL_TAGESLIMIT:
            ctx.status["details"]["pause"] = "Tageslimit erreicht, morgen geht es weiter"
            ctx.stopp.wait(600)
            continue
        jetzt = time.time()
        zeiten = [t for t in zeiten if jetzt - t < 900]
        if len(zeiten) >= DETAIL_FENSTER:
            ctx.status["details"]["pause"] = "Wartet auf das Strava-Limit"
            ctx.stopp.wait(max(5, zeiten[0] + 900 - jetzt))
            continue
        z0 = offen[0]
        zid = z0["id"]
        try:
            d = sl.api_get(ctx.strava, "/activities/%s" % zid)
        except Exception as e:      # noqa: BLE001
            if "429" in str(e):
                ctx.status["details"]["pause"] = "Strava-Limit erreicht, wartet 15 Minuten"
                ctx.stopp.wait(900)
            else:
                fehl.add(zid)
                ctx.stopp.wait(1)
            continue
        zeiten.append(time.time())
        ctx.extras.anzahl += 1
        detail_merken(ctx.extras, z0, d)
        seit += 1
        if seit >= 10:
            seit = 0
            ctx.extras.speichern()
            ctx.stossen()
        ctx.stopp.wait(0.3)
    ctx.extras.speichern()


def wetter_tag(lat1, lng1, datum, hol=None):
    """Stundenwerte (Temperatur, Niederschlag, Wind, Wettercode) fuer einen Tag. Koordinaten nur auf 0,1 Grad (ca. 11 km) gerundet."""
    alt = (dt.date.today() - dt.date.fromisoformat(datum)).days
    basis = WETTER_PROGNOSE if alt <= 8 else WETTER_ARCHIV
    q = urllib.parse.urlencode({"latitude": "%.1f" % lat1, "longitude": "%.1f" % lng1, "start_date": datum, "end_date": datum,
                                "hourly": "temperature_2m,precipitation,wind_speed_10m,weather_code", "timezone": "auto"})
    with urllib.request.urlopen(basis + "?" + q, timeout=20) as r:
        j = json.loads(r.read().decode("utf-8"))
    h = j.get("hourly") or {}
    if not h.get("temperature_2m"):
        raise ValueError("keine Wetterdaten")
    return h


def wetter_fuer(stunden, z):
    """[mittlere Temperatur, Niederschlag-Summe mm, mittlerer Wind km/h, Wettercode zum Start] ueber die Dauer der Einheit."""
    h0 = int(z["d"][11:13] or 0)
    minute = int(z["d"][14:16] or 0)
    h1 = min(23, h0 + int((minute + z["t"] / 60.0) // 60))
    def teil(name):
        return [v for v in (stunden.get(name) or [])[h0:h1 + 1] if v is not None]
    t, p, w = teil("temperature_2m"), teil("precipitation"), teil("wind_speed_10m")
    if not t:
        return None
    code = (stunden.get("weather_code") or [None] * 24)[h0]
    return [round(sum(t) / len(t), 1), round(sum(p), 1), round(sum(w) / len(w), 1) if w else 0.0, int(code) if code is not None else 0]


def wetter_schleife(ctx):
    fehl = set()
    while not ctx.stopp.is_set():
        kand = [z for z in reversed(ctx.speicher.liste()) if z["id"] in ctx.speicher.ll and z["id"] not in ctx.extras.wetter and z["id"] not in fehl]
        alle = sum(1 for z in ctx.speicher.akt.values() if z["id"] in ctx.speicher.ll)
        ctx.status["wetter"] = {"fertig": sum(1 for k in ctx.speicher.ll if k in ctx.extras.wetter), "gesamt": alle}
        if not kand:
            ctx.stopp.wait(30)
            continue
        z = kand[0]
        ll = ctx.speicher.ll[z["id"]]
        key = (round(ll[0], 1), round(ll[1], 1), z["d"][:10])
        gruppe = [k for k in kand if (round(ctx.speicher.ll[k["id"]][0], 1), round(ctx.speicher.ll[k["id"]][1], 1), k["d"][:10]) == key]
        try:
            std = wetter_tag(key[0], key[1], key[2])
        except urllib.error.HTTPError as e:
            if e.code == 429:
                ctx.stopp.wait(120)
            else:
                fehl.update(k["id"] for k in gruppe)
            continue
        except ValueError:
            fehl.update(k["id"] for k in gruppe)
            continue
        except OSError:
            ctx.stopp.wait(60)
            continue
        for k in gruppe:
            w = wetter_fuer(std, k)
            if w is None:
                fehl.add(k["id"])
            else:
                ctx.extras.wetter[k["id"]] = w
        if len(ctx.extras.wetter) % 8 == 0 or len(gruppe) > 3:
            ctx.extras.speichern()
        ctx.stossen()
        ctx.stopp.wait(0.25)
    ctx.extras.speichern()


def demo_daten(jahre=3):
    """Erfundene Trainingshistorie (Triathlon-Muster) fuer Tests ohne Strava."""
    rnd = random.Random(7)
    heute = dt.date.today()
    start = heute - dt.timedelta(days=365 * jahre)
    out, nr = [], 1000
    tag = start
    while tag <= heute:
        wt = tag.weekday()
        jahrestag = tag.timetuple().tm_yday
        saison = 0.65 + 0.35 * math.sin((jahrestag - 60) / 365.0 * 2 * math.pi)
        plan = {0: ["Swim"], 1: ["Run", "Swim"], 2: ["Ride"], 3: ["Run"], 4: ["Swim"], 5: ["Ride"], 6: ["Run"]}[wt]
        if wt == 5 and rnd.random() < .6:
            plan = ["Ride", "Run"]
        for s in plan:
            if rnd.random() > .86 * (0.7 + saison * .4):
                continue
            nr += 1
            if s == "Swim":
                m = rnd.choice([1500, 2000, 2500, 3000, 3500]) * (0.8 + saison * .3)
                t = m / rnd.uniform(0.85, 1.05)
                e, hr = 0, rnd.uniform(118, 140)
            elif s == "Run":
                lang = wt == 6
                m = (rnd.uniform(14000, 24000) if lang else rnd.uniform(6000, 12000)) * (0.75 + saison * .35)
                t = m / rnd.uniform(2.75, 3.35)
                e, hr = m / 1000 * rnd.uniform(4, 14), rnd.uniform(138, 164)
            else:
                lang = wt == 5
                m = (rnd.uniform(70000, 140000) if lang else rnd.uniform(30000, 55000)) * (0.7 + saison * .45)
                t = m / rnd.uniform(7.2, 9.2)
                e, hr = m / 1000 * rnd.uniform(5, 13), rnd.uniform(125, 150)
            std = rnd.choice([6, 7, 17, 18]) if wt < 5 else rnd.choice([8, 9, 10])
            out.append({"id": str(nr), "n": {"Swim": "Schwimmen", "Run": "Lauf", "Ride": "Radfahrt"}[s] + " " + tag.strftime("%d.%m."),
                        "s": s if s != "Ride" else "Ride", "k": s, "d": "%sT%02d:%02d:00" % (tag.isoformat(), std, rnd.randint(0, 59)),
                        "m": round(m, 1), "t": int(t), "e": round(e, 1), "kud": rnd.randint(0, 25), "tr": False, "r": s != "Swim",
                        "hr": round(hr, 1), "mhr": round(hr + rnd.uniform(18, 32), 1)})
            if s == "Ride":
                out[-1]["w"] = round(rnd.uniform(150, 215), 1)
                out[-1]["nw"] = round(out[-1]["w"] * 1.06, 1)
        tag += dt.timedelta(days=1)
    return out


LAUF_DIST = (("400m", 400), ("1/2 mile", 804.67), ("1k", 1000), ("1 mile", 1609.34), ("2 mile", 3218.69), ("5k", 5000), ("10k", 10000),
             ("15k", 15000), ("10 mile", 16093.4), ("20k", 20000), ("Half-Marathon", 21097.5), ("30k", 30000), ("Marathon", 42195))


def demo_extras(akts):
    """Erfundene Bestzeiten und Wetterwerte passend zu demo_daten()."""
    ex = Extras.__new__(Extras)
    ex.be, ex.wetter, ex.lp, ex.tag, ex.anzahl = {}, {}, {}, "", 0
    for z in akts:
        rnd = random.Random(int(z["id"]))
        tag = dt.date.fromisoformat(z["d"][:10])
        if z["k"] == "Run":
            pace = z["t"] / max(1.0, z["m"])
            ex.be[z["id"]] = {n: int(m * pace * rnd.uniform(0.9, 0.99) * (1 + 0.06 * (m / max(1.0, z["m"])) ** 2))
                              for n, m in LAUF_DIST if m <= z["m"]}
        if z["k"] != "Swim" or rnd.random() < .3:
            jt = tag.timetuple().tm_yday
            temp = 10 + 10 * math.sin((jt - 110) / 365.0 * 2 * math.pi) + rnd.uniform(-5, 5)
            regen = rnd.random() < .22
            ex.wetter[z["id"]] = [round(temp, 1), round(rnd.uniform(.2, 3.5), 1) if regen else 0.0, round(rnd.uniform(4, 28), 1),
                                  61 if regen else rnd.choice([0, 1, 2, 3])]
    return ex


def demo_runden(z):
    """Erfundene Runden: jede dritte Laufeinheit als Intervalle (6 x 1 km), Schwimmen als Serien, sonst Kilometer-/5-km-Runden."""
    if not z or z["k"] not in RUNDEN_SPORT:
        return []
    n = int(z["id"])
    rnd = random.Random(n)
    hr = z.get("hr") or 140
    if z["k"] == "Run" and n % 3 == 0:
        out = [[600, 1800, hr - 15, 0]]
        for i in range(6):
            out += [[int(222 * rnd.uniform(.97, 1.03)), 1000, hr + 12, 0], [120, 300, hr - 10, 0]]
        return out[:-1] + [[480, 1400, hr - 12, 0]]
    if z["k"] == "Swim":
        return [[int(400 * 1.9 * rnd.uniform(.95, 1.05)), 400, 0, 0] for _ in range(max(2, int(z["m"] // 400)))]
    stueck = 1000 if z["k"] == "Run" else 5000
    k = max(2, int(z["m"] // stueck))
    return [[int(z["t"] / k * rnd.uniform(.95, 1.05)), round(z["m"] / k, 1), int(hr * rnd.uniform(.97, 1.03)), int(z.get("w") or 0)] for _ in range(k)]


def demo_route(zid):
    """Erfundene Runde rund um Trier; ein Teil der Einheiten nutzt dieselben Lieblingsstrecken."""
    n = int(zid)
    rnd = random.Random(n % 9 if n % 3 else n)
    lat, lng = 49.75 + rnd.uniform(-.02, .02), 6.64 + rnd.uniform(-.03, .03)
    r = rnd.uniform(.006, .035)
    ph = rnd.uniform(0, 6)
    pts = []
    for i in range(140):
        a = i / 140.0 * 2 * math.pi
        pts.append([round(lat + r * math.sin(a + ph) * (1 + .3 * math.sin(3 * a)), 5), round(lng + r * 1.5 * math.cos(a) * (1 + .2 * math.cos(2 * a + ph)), 5)])
    pts.append(pts[0])
    return pts
