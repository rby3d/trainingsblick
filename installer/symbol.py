# -*- coding: utf-8 -*-
"""
Programmsymbol (trainingsblick.ico) ohne Zusatzpakete zeichnen: tuerkis-blaues Quadrat mit runden Ecken und einer weissen
Streckenlinie. Jede Groesse wird einzeln gerechnet (Abstandsfelder, weiche Kanten) und als PNG in die ICO-Datei gelegt.

Aufruf:  python installer/symbol.py <ziel.ico>     (macht installer/bauen.ps1)
"""
from __future__ import annotations

import math
import struct
import sys
import zlib

GROESSEN = (16, 24, 32, 48, 64, 128, 256)
OBEN, UNTEN = (0x22, 0xC3, 0xB4), (0x1F, 0x5F, 0xD6)     # Tuerkis nach Blau (bewusst nicht Strava-Orange)
LINIE = ((0.20, 0.68), (0.37, 0.44), (0.50, 0.57), (0.65, 0.31), (0.81, 0.63))


def _abstand_strecke(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def _abstand_rundrechteck(px, py, r):
    qx, qy = abs(px - 0.5) - (0.5 - r), abs(py - 0.5) - (0.5 - r)
    return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - r


def _deckung(d, pixel):
    """Abstand (negativ = innen) -> Deckung 0..1 mit einem Pixel weicher Kante."""
    return max(0.0, min(1.0, 0.5 - d / pixel))


def bild(n):
    pixel = 1.0 / n
    rand = 0.04 if n >= 32 else 0.0
    breite = 0.095 if n >= 32 else 0.12
    zeilen = []
    for y in range(n):
        z = bytearray([0])
        for x in range(n):
            px, py = (x + 0.5) / n, (y + 0.5) / n
            a = _deckung(_abstand_rundrechteck((px - rand) / (1 - 2 * rand), (py - rand) / (1 - 2 * rand), 0.22) * (1 - 2 * rand), pixel)
            f = py
            r, g, b = (round(OBEN[i] + (UNTEN[i] - OBEN[i]) * f) for i in range(3))
            d = min(_abstand_strecke(px, py, *LINIE[i], *LINIE[i + 1]) for i in range(len(LINIE) - 1)) - breite / 2
            w = _deckung(d, pixel) * a
            r, g, b = (round(c + (255 - c) * w) for c in (r, g, b))
            z += bytes((r, g, b, round(255 * a)))
        zeilen.append(bytes(z))
    return png(n, n, b"".join(zeilen))


def png(w, h, roh):
    def stueck(art, daten):
        return struct.pack(">I", len(daten)) + art + daten + struct.pack(">I", zlib.crc32(art + daten) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + stueck(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + stueck(b"IDAT", zlib.compress(roh, 9)) + stueck(b"IEND", b""))


def ico(groessen=GROESSEN):
    bilder = [bild(n) for n in groessen]
    kopf = struct.pack("<HHH", 0, 1, len(bilder))
    versatz = 6 + 16 * len(bilder)
    eintraege, daten = b"", b""
    for n, b in zip(groessen, bilder):
        eintraege += struct.pack("<BBBBHHII", n % 256, n % 256, 0, 0, 1, 32, len(b), versatz + len(daten))
        daten += b
    return kopf + eintraege + daten


if __name__ == "__main__":
    with open(sys.argv[1], "wb") as f:
        f.write(ico())
