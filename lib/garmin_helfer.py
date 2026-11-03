#!/usr/bin/env python3
"""Garmin-Connect-Helfer: laeuft mit einem neuen Python (>= 3.12), weil `garminconnect` das verlangt.

Das Strava-Dashboard startet dieses Skript als Unterprozess und liest nur dessen Ausgabe:
je Zeile ein JSON-Objekt  {"ereignis": ...}  auf stdout.

  pruefen                          -> {"ereignis":"pruefen","ok":bool,"version":"...","fehler":"..."}
  login                            -> erwartet auf stdin {"email","passwort"}; sendet ggf. {"ereignis":"mfa"} und
                                      wartet dann auf eine stdin-Zeile {"code":"123456"}; sendet {"ereignis":"tokens","daten":"..."},
                                      Ende: "fertig" oder "fehler"
  sync   --cache DATEI [--tage N] [--ab YYYY-MM-DD]
                                   -> erwartet auf stdin {"tokens":"..."}; holt Tageswerte (Schlaf, HRV, Ruhepuls, Body Battery,
                                      Stress, Schritte, Trainingsbereitschaft) und VO2max, schreibt sie nach DATEI und sendet am
                                      Ende den (ggf. erneuerten) Zugang als {"ereignis":"tokens"}

Hier wird nichts Geheimes auf die Platte geschrieben: Passwort und Zugang gehen nur ueber stdin/stdout. Das Dashboard
speichert den Zugang verschluesselt (lib/tresor.py).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time

# garminconnect nimmt ohne Angabe den Pfad aus GARMINTOKENS und schreibt den Zugang dann im Klartext dorthin
os.environ.pop("GARMINTOKENS", None)


def sende(**kw):
    sys.stdout.write(json.dumps(kw, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def lies_zeile():
    z = sys.stdin.readline()
    if not z:
        raise EOFError("Eingabe geschlossen")
    return json.loads(z)


def zugang_senden(client):
    """Aktuellen Zugang (nach Anmeldung oder Erneuerung) ans Dashboard geben; der Text ist JSON von garminconnect."""
    try:
        sende(ereignis="tokens", daten=client.client.dumps())
    except Exception:    # noqa: BLE001  ohne neuen Zugang bleibt der alte gespeichert
        pass


def g(d, *ks, std=None):
    """Sicherer Zugriff auf verschachtelte dicts."""
    for k in ks:
        if isinstance(d, dict) and k in d:
            d = d[k]
        else:
            return std
    return d if d is not None else std


def zahl(v, nd=None):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return round(f, nd) if nd is not None else f


def finde(obj, schluessel):
    """Erster Wert zu `schluessel` irgendwo in verschachtelten Strukturen."""
    if isinstance(obj, dict):
        if schluessel in obj and obj[schluessel] is not None:
            return obj[schluessel]
        for v in obj.values():
            r = finde(v, schluessel)
            if r is not None:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = finde(v, schluessel)
            if r is not None:
                return r
    return None


def cmd_pruefen(_a):
    try:
        import garminconnect  # noqa: F401
        from importlib import metadata
        try:
            v = metadata.version("garminconnect")
        except Exception:    # noqa: BLE001
            v = ""
        sende(ereignis="pruefen", ok=True, version=v, python=sys.version.split()[0])
    except Exception as e:    # noqa: BLE001
        sende(ereignis="pruefen", ok=False, fehler="%s: %s" % (type(e).__name__, e), python=sys.version.split()[0])
    return 0


def cmd_login(a):
    try:
        from garminconnect import Garmin
        zd = lies_zeile()

        def mfa():
            sende(ereignis="mfa")
            return str(lies_zeile().get("code", "")).strip()
        client = Garmin(zd.get("email"), zd.get("passwort"), prompt_mfa=mfa)
        client.login()
        zugang_senden(client)
        sende(ereignis="fertig")
        return 0
    except Exception as e:    # noqa: BLE001
        sende(ereignis="fehler", text=fehlertext(e))
        return 1


def fehlertext(e):
    n = type(e).__name__
    s = str(e)
    if "TooMany" in n or "429" in s:
        return "Garmin bremst gerade (zu viele Anfragen). Später noch einmal versuchen."
    if "Authentication" in n or "401" in s or "403" in s:
        return "Anmeldung bei Garmin fehlgeschlagen oder abgelaufen (%s)." % (s[:160] or n)
    return "%s: %s" % (n, s[:200])


def tageswerte(client, tag):
    """Alle Werte eines Tages. Jeder Aufruf einzeln abgesichert, damit ein fehlender Wert den Rest nicht verhindert."""
    out = {}
    fehler = []

    def hol(name, f):
        try:
            return f()
        except Exception as e:    # noqa: BLE001
            if "TooMany" in type(e).__name__ or "429" in str(e):
                raise
            fehler.append(name)
            return None

    st = hol("stats", lambda: client.get_stats(tag)) or {}
    if st:
        out["rhr"] = zahl(st.get("restingHeartRate"))
        out["bbh"] = zahl(st.get("bodyBatteryHighestValue"))
        out["bbl"] = zahl(st.get("bodyBatteryLowestValue"))
        out["bbw"] = zahl(st.get("bodyBatteryAtWakeTime"))
        out["str"] = zahl(st.get("averageStressLevel"))
        out["schritte"] = zahl(st.get("totalSteps"))
    time.sleep(0.4)
    sl = hol("schlaf", lambda: client.get_sleep_data(tag)) or {}
    dto = g(sl, "dailySleepDTO", std={}) or {}
    if dto.get("sleepTimeSeconds"):
        out["sl"] = zahl(dto.get("sleepTimeSeconds"))
        out["tief"] = zahl(dto.get("deepSleepSeconds"))
        out["leicht"] = zahl(dto.get("lightSleepSeconds"))
        out["rem"] = zahl(dto.get("remSleepSeconds"))
        out["wach"] = zahl(dto.get("awakeSleepSeconds"))
        out["slscore"] = zahl(g(dto, "sleepScores", "overall", "value"))
        if out.get("rhr") is None:
            out["rhr"] = zahl(sl.get("restingHeartRate"))
        out["hrvn"] = zahl(sl.get("avgOvernightHrv"))
    time.sleep(0.4)
    hv = hol("hrv", lambda: client.get_hrv_data(tag)) or {}
    if hv:
        out["hrv"] = zahl(g(hv, "hrvSummary", "lastNightAvg")) or out.get("hrvn")
        out["hrvw"] = zahl(g(hv, "hrvSummary", "weeklyAvg"))
        out["hrvs"] = g(hv, "hrvSummary", "status")
    time.sleep(0.4)
    tr = hol("bereitschaft", lambda: client.get_training_readiness(tag))
    eintraege = tr if isinstance(tr, list) else ([tr] if isinstance(tr, dict) else [])
    if eintraege:
        wahl = next((e for e in eintraege if e.get("inputContext") == "AFTER_WAKEUP_RESET"), eintraege[0])
        out["tr"] = zahl(wahl.get("score"))
        out["trl"] = wahl.get("level")
    time.sleep(0.4)
    out = {k: v for k, v in out.items() if v is not None}
    return out, fehler


def vo2max(client, tag):
    try:
        r = client.get_max_metrics_latest(tag)
    except Exception:    # noqa: BLE001
        try:
            r = client.get_max_metrics(tag)
        except Exception:    # noqa: BLE001
            return None
    v = finde(r, "vo2MaxPreciseValue") or finde(r, "vo2MaxValue")
    return zahl(v, 1)


def lade_cache(datei):
    try:
        with open(datei, "r", encoding="utf-8") as f:
            j = json.load(f)
        if isinstance(j, dict) and isinstance(j.get("tage"), dict):
            return j
    except (OSError, ValueError):
        pass
    return {"tage": {}, "vo2": {}, "stand": 0}


def speichere_cache(datei, j):
    os.makedirs(os.path.dirname(datei) or ".", exist_ok=True)
    tmp = datei + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(j, f, ensure_ascii=False)
    os.replace(tmp, datei)


def cmd_sync(a):
    try:
        from garminconnect import Garmin
    except Exception as e:    # noqa: BLE001
        sende(ereignis="fehler", text="garminconnect fehlt: %s" % e)
        return 1
    try:
        tokens = str(lies_zeile().get("tokens") or "")
        if not tokens.strip().startswith("{"):
            raise RuntimeError("Authentication: kein gespeicherter Zugang")
        client = Garmin()
        client.login(tokens)
        zugang_senden(client)          # beim Anmelden ggf. schon erneuert
    except Exception as e:    # noqa: BLE001
        sende(ereignis="fehler", text=fehlertext(e), anmelden=True)
        return 1
    cache = lade_cache(a.cache)
    heute = dt.date.today()
    if a.ab:
        start = dt.date.fromisoformat(a.ab)
    elif cache["tage"]:
        letzter = max(cache["tage"])
        start = max(dt.date.fromisoformat(letzter) - dt.timedelta(days=3), heute - dt.timedelta(days=a.tage))
    else:
        start = heute - dt.timedelta(days=a.tage)
    tage = []
    d = start
    while d <= heute:
        tage.append(d)
        d += dt.timedelta(days=1)
    tage.reverse()                                  # neueste zuerst, damit die Ansicht schnell etwas zeigt
    sende(ereignis="start", gesamt=len(tage))
    try:
        for i, d in enumerate(tage):
            iso = d.isoformat()
            werte, fehler = tageswerte(client, iso)
            if werte:
                cache["tage"][iso] = werte
            if i % 7 == 0 or d == heute:
                v = vo2max(client, iso)
                if v:
                    cache["vo2"][iso] = v
            if (i + 1) % 5 == 0 or i + 1 == len(tage):
                cache["stand"] = time.time()
                speichere_cache(a.cache, cache)
            sende(ereignis="fortschritt", fertig=i + 1, gesamt=len(tage), tag=iso, fehlend=fehler)
    except Exception as e:    # noqa: BLE001
        cache["stand"] = time.time()
        speichere_cache(a.cache, cache)
        zugang_senden(client)
        sende(ereignis="fehler", text=fehlertext(e))
        return 1
    cache["stand"] = time.time()
    speichere_cache(a.cache, cache)
    zugang_senden(client)
    sende(ereignis="fertig", tage=len(cache["tage"]))
    return 0


def main():
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest="cmd", required=True)
    sp.add_parser("pruefen")
    sp.add_parser("login")
    p = sp.add_parser("sync")
    p.add_argument("--cache", required=True)
    p.add_argument("--tage", type=int, default=120)
    p.add_argument("--ab", default="")
    a = ap.parse_args()
    return {"pruefen": cmd_pruefen, "login": cmd_login, "sync": cmd_sync}[a.cmd](a)


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stdin.reconfigure(encoding="utf-8")
    except Exception:    # noqa: BLE001
        pass
    sys.exit(main())
