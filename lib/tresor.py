# -*- coding: utf-8 -*-
"""
Verschluesselter Speicher fuer Zugangsdaten (Strava: Client Secret und Tokens, Garmin: Token).

Windows: DPAPI (CryptProtectData), dasselbe Verfahren, mit dem Edge und Chrome Passwoerter schuetzen. Die Dateien lassen sich
nur unter diesem Windows-Konto auf diesem PC entschluesseln; ein Backup, ein kopierter Ordner oder ein anderes Konto
koennen damit nichts anfangen. Gegen Programme, die unter demselben Konto laufen, schuetzt das (wie bei jedem Browser) nicht.
Andere Systeme: nichts wird gespeichert (schreiben wirft OSError), Zugangsdaten gibt es nie im Klartext auf der Platte.

Ablage: <GEHEIM>\\<name>.bin (lib/orte.py, %LOCALAPPDATA%\\Trainingsblick\\geheim: wandert nicht mit dem Profil).
Das Programm hiess frueher "Strava Dashboard"; _ENTROPIE behaelt den alten Namen, sonst liessen sich gespeicherte Zugaenge nicht mehr lesen.
Alte Klartext-Dateien frueherer Versionen uebernimmt `uebernehmen` einmalig und loescht sie danach.
"""
from __future__ import annotations

import json
import os

import orte

_ENTROPIE = b"StravaDashboard/Tresor/1"     # zusaetzlicher Schluesselanteil: andere Programme koennen die Daten nicht einfach entschluesseln


def _pfad(name):
    return orte.GEHEIM / (name + ".bin")


if os.name == "nt":
    import ctypes
    from ctypes import wintypes

    class _Blob(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    _crypt32 = ctypes.windll.crypt32
    _kernel32 = ctypes.windll.kernel32
    _kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    _kernel32.LocalFree.restype = ctypes.c_void_p
    _CRYPTPROTECT_UI_FORBIDDEN = 0x01

    def _blob(daten):
        puffer = ctypes.create_string_buffer(daten, len(daten))
        return _Blob(len(daten), ctypes.cast(puffer, ctypes.POINTER(ctypes.c_char))), puffer

    def _aus(blob):
        try:
            return ctypes.string_at(blob.pbData, blob.cbData)
        finally:
            _kernel32.LocalFree(blob.pbData)

    def _verschluesseln(klar):
        ein, _p1 = _blob(klar)
        ent, _p2 = _blob(_ENTROPIE)
        aus = _Blob()
        if not _crypt32.CryptProtectData(ctypes.byref(ein), "StravaDashboard", ctypes.byref(ent), None, None,
                                         _CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(aus)):
            raise OSError("Verschlüsseln fehlgeschlagen (Fehler %d)" % ctypes.GetLastError())
        return _aus(aus)

    def _entschluesseln(geheim):
        ein, _p1 = _blob(geheim)
        ent, _p2 = _blob(_ENTROPIE)
        aus = _Blob()
        if not _crypt32.CryptUnprotectData(ctypes.byref(ein), None, ctypes.byref(ent), None, None,
                                           _CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(aus)):
            raise OSError("Entschlüsseln fehlgeschlagen (andere Windows-Anmeldung oder anderer PC?)")
        return _aus(aus)
else:
    def _verschluesseln(klar):
        raise OSError("Zugangsdaten lassen sich nur unter Windows verschlüsselt speichern")

    def _entschluesseln(geheim):
        raise OSError("Zugangsdaten lassen sich nur unter Windows entschlüsseln")


def lesen(name):
    """Gespeichertes Objekt oder None (fehlt oder laesst sich nicht entschluesseln)."""
    try:
        return json.loads(_entschluesseln(_pfad(name).read_bytes()).decode("utf-8"))
    except (OSError, ValueError):
        return None


def schreiben(name, obj):
    p = _pfad(name)
    p.parent.mkdir(parents=True, exist_ok=True)
    daten = _verschluesseln(json.dumps(obj, ensure_ascii=False).encode("utf-8"))
    tmp = p.with_suffix(".tmp")
    tmp.write_bytes(daten)
    tmp.replace(p)


def vorhanden(name):
    return _pfad(name).is_file()


def loeschen(name):
    try:
        _pfad(name).unlink()
    except OSError:
        pass


def uebernehmen(name, alt, umwandeln):
    """Alte Klartext-Datei `alt` einmalig in den Tresor uebernehmen und loeschen (samt .tmp-Rest).
    umwandeln(text) -> Objekt fuer den Tresor oder None (unbrauchbar). Steht schon etwas im Tresor, gewinnt das;
    die alte Datei wird trotzdem geloescht. Nur wenn Verschluesseln scheitert, bleibt sie liegen, damit nichts verloren geht."""
    if not alt.is_file():
        return
    if not vorhanden(name):
        try:
            obj = umwandeln(alt.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            obj = None
        if obj:
            try:
                schreiben(name, obj)
            except OSError:
                return
    for p in (alt, alt.with_suffix(".tmp")):
        try:
            p.unlink()
        except OSError:
            pass
