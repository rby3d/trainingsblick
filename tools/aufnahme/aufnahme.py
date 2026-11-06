# -*- coding: utf-8 -*-
"""
Animierte Bildschirmaufnahme des Strava Dashboards fuer ein Reel (1920x1920, 25 fps, 528 Frames).

Der Server muss offline laufen (tools/aufnahme/server_offline.py). Das Skript steuert die Seite mit Playwright
Bild fuer Bild (virtuelle Zeit), macht je Frame einen Screenshot und setzt ihn in Python zusammen:
abgerundetes Fenster auf dunklem Grund, weiche Kamera-Zooms, gezeichneter Mauszeiger mit Klick-Welle, Ueberblendungen.
Die Frames gehen direkt an ffmpeg (H.264, ohne Ton).

  python aufnahme.py <url> <ausgabe.mp4> <kontrollordner>
"""
import io
import math
import re
import subprocess
import sys
import time

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from playwright.sync_api import sync_playwright

URL, AUSGABE, KONTROLLE = (sys.argv[1:4] + [None] * 3)[:3] if __name__ == "__main__" else (None, None, None)
CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe"
FPS, N = 25, 528
OUT = 1920
VW, VH, DSF = 1280, 1100, 3            # Seiten-Viewport (CSS-px) und Screenshot-Skalierung
WIN_W = 1760                           # Fensterbreite in der Szene (Szene = 1920x1920)
K = WIN_W / VW                         # Szene-px je CSS-px
TITEL_H = 44
PAGE_H = VH * K
WIN_H = TITEL_H + PAGE_H
WIN_X = (OUT - WIN_W) / 2
WIN_Y = (OUT - WIN_H) / 2
PAGE_X, PAGE_Y = WIN_X, WIN_Y + TITEL_H
RADIUS = 22
SS = 2                                 # Ueberabtastung der statischen Szene


def F(t):
    return int(round(t * FPS))


def ease(u):
    u = max(0.0, min(1.0, u))
    return u * u * (3 - 2 * u) if u < 0 else (1 - math.cos(math.pi * u)) / 2


def ease_io(u):  # weicher (quintisch)
    u = max(0.0, min(1.0, u))
    return u * u * u * (u * (u * 6 - 15) + 10)


# ------------------------------------------------------------------ statische Szene (Hintergrund + Fenster)
def szene_bauen():
    S = OUT * SS
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32) / S
    # ruhiger dunkler Verlauf mit leichtem Glimmen oben links (Strava-Orange) und unten rechts (Blau)
    basis = np.array([12, 14, 19], np.float32)
    g1 = np.exp(-(((xx - 0.18) ** 2 + (yy - 0.10) ** 2) / 0.10))[..., None] * np.array([70, 32, 10], np.float32) * 0.55
    g2 = np.exp(-(((xx - 0.90) ** 2 + (yy - 0.95) ** 2) / 0.14))[..., None] * np.array([18, 34, 80], np.float32) * 0.55
    img = np.clip(basis + g1 + g2, 0, 255).astype(np.uint8)
    bg = Image.fromarray(img, "RGB").convert("RGBA")
    # Schatten
    sh = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(sh)
    d.rounded_rectangle([WIN_X * SS, (WIN_Y + 24) * SS, (WIN_X + WIN_W) * SS, (WIN_Y + WIN_H + 24) * SS], RADIUS * SS, fill=200)
    sh = sh.filter(ImageFilter.GaussianBlur(46 * SS))
    schwarz = Image.new("RGBA", (S, S), (0, 0, 0, 255))
    bg = Image.composite(schwarz, bg, sh)
    # Fensterrahmen + Titelleiste
    fen = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(fen)
    x0, y0, x1, y1 = WIN_X * SS, WIN_Y * SS, (WIN_X + WIN_W) * SS, (WIN_Y + WIN_H) * SS
    d.rounded_rectangle([x0 - 2 * SS, y0 - 2 * SS, x1 + 2 * SS, y1 + 2 * SS], (RADIUS + 2) * SS, fill=(255, 255, 255, 28))
    d.rounded_rectangle([x0, y0, x1, y1], RADIUS * SS, fill=(32, 33, 36, 255))
    d.line([x0, (WIN_Y + TITEL_H) * SS - SS, x1, (WIN_Y + TITEL_H) * SS - SS], fill=(52, 54, 58, 255), width=SS)
    f = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 17 * SS)
    # kleines Strava-farbenes Symbol + Titel
    cy = (WIN_Y + TITEL_H / 2) * SS
    d.rounded_rectangle([x0 + 18 * SS, cy - 9 * SS, x0 + 36 * SS, cy + 9 * SS], 5 * SS, fill=(252, 76, 2, 255))
    d.polygon([(x0 + 22 * SS, cy + 5 * SS), (x0 + 27 * SS, cy - 5 * SS), (x0 + 32 * SS, cy + 5 * SS)], fill=(255, 255, 255, 255))
    d.text((x0 + 46 * SS, cy), "Strava-Dashboard", font=f, fill=(225, 225, 228, 255), anchor="lm")
    # Fenstersteuerung (Windows-Stil)
    gx = x1 - 30 * SS
    col = (200, 200, 204, 255)
    w = 1.3 * SS
    d.line([gx - 6 * SS, cy - 6 * SS, gx + 6 * SS, cy + 6 * SS], fill=col, width=int(w))
    d.line([gx - 6 * SS, cy + 6 * SS, gx + 6 * SS, cy - 6 * SS], fill=col, width=int(w))
    gx -= 56 * SS
    d.rectangle([gx - 6 * SS, cy - 6 * SS, gx + 6 * SS, cy + 6 * SS], outline=col, width=int(w))
    gx -= 56 * SS
    d.line([gx - 6 * SS, cy, gx + 6 * SS, cy], fill=col, width=int(w))
    return Image.alpha_composite(bg, fen).convert("RGB")


# ------------------------------------------------------------------ Mauszeiger
def zeiger_bauen():
    s = 16  # Einheiten -> sprite px
    pts = [(0, 0), (0, 16.5), (4.2, 12.6), (7.0, 19.0), (9.6, 17.9), (6.9, 11.7), (12.4, 11.7)]
    W, H = 15 * s, 22 * s
    sp = Image.new("RGBA", (W + 4 * s, H + 4 * s), (0, 0, 0, 0))
    sh = Image.new("RGBA", sp.size, (0, 0, 0, 0))
    o = 1.5 * s
    ImageDraw.Draw(sh).polygon([(x * s + o + 0.8 * s, y * s + o + 1.4 * s) for x, y in pts], fill=(0, 0, 0, 110))
    sh = sh.filter(ImageFilter.GaussianBlur(1.2 * s))
    d = ImageDraw.Draw(sp)
    d.polygon([(x * s + o, y * s + o) for x, y in pts], fill=(20, 20, 20, 255))
    # weisser Rand durch zweite, groessere Kontur
    rand = Image.new("RGBA", sp.size, (0, 0, 0, 0))
    ImageDraw.Draw(rand).line([(x * s + o, y * s + o) for x, y in pts + [pts[0]]], fill=(255, 255, 255, 255), width=int(1.6 * s), joint="curve")
    out = Image.alpha_composite(sh, rand)
    out = Image.alpha_composite(out, sp)
    return out, (o, o), s   # sprite, Spitze (px), px je Einheit


ZEIGER, ZEIGER_SPITZE, ZEIGER_S = zeiger_bauen()


# ------------------------------------------------------------------ Kamera / Abbildung
def szene_von_seite(px, py):
    return PAGE_X + px * K, PAGE_Y + py * K


def kamera_klemmen(cx, cy, z):
    half = OUT / 2 / z
    rand = 30
    lo_x, hi_x = WIN_X - rand + half, WIN_X + WIN_W + rand - half
    lo_y, hi_y = WIN_Y - rand + half, WIN_Y + WIN_H + rand - half
    cx = (lo_x + hi_x) / 2 if lo_x > hi_x else min(max(cx, lo_x), hi_x)
    cy = (lo_y + hi_y) / 2 if lo_y > hi_y else min(max(cy, lo_y), hi_y)
    return cx, cy, z


def kamera_auf_box(box, pad=0.10, zmax=2.1, zmin=1.0):
    """box = (x, y, w, h) in CSS-px -> Kamera (Szene-Mitte, Zoom)."""
    x, y, w, h = box
    z = min(OUT / (w * K * (1 + pad)), OUT / (h * K * (1 + pad)))
    z = max(zmin, min(zmax, z))
    cx, cy = szene_von_seite(x + w / 2, y + h / 2)
    return kamera_klemmen(cx, cy, z)


GANZ = kamera_klemmen(OUT / 2, OUT / 2, 1.0)


def rendern(base, seite, cam, maus, wellen):
    cx, cy, z = cam
    # Szene -> Ausgabe: out = (p - c) * z + 960 ;  Ausgabe -> Szene: p = (out - 960) / z + c
    a = 1 / z
    bx, by = (cx - OUT / 2 * a), (cy - OUT / 2 * a)
    frame = base.transform((OUT, OUT), Image.AFFINE, (a * SS, 0, bx * SS, 0, a * SS, by * SS), resample=Image.BILINEAR)
    # Seitenbereich in Ausgabe-Koordinaten
    ox0 = (PAGE_X - cx) * z + OUT / 2
    oy0 = (PAGE_Y - cy) * z + OUT / 2
    ox1 = (PAGE_X + WIN_W - cx) * z + OUT / 2
    oy1 = (PAGE_Y + PAGE_H - cy) * z + OUT / 2
    rx0, ry0 = max(0, int(math.floor(ox0))), max(0, int(math.floor(oy0)))
    rx1, ry1 = min(OUT, int(math.ceil(ox1))), min(OUT, int(math.ceil(oy1)))
    if rx1 > rx0 and ry1 > ry0:
        # Ausgabe-Pixel -> Screenshot-Pixel: sp = ((out - 960)/z + c - PAGE) / K * DSF
        f = DSF / (K * z)
        sx0 = ((rx0 - OUT / 2) / z + cx - PAGE_X) / K * DSF
        sy0 = ((ry0 - OUT / 2) / z + cy - PAGE_Y) / K * DSF
        teil = seite.transform((rx1 - rx0, ry1 - ry0), Image.AFFINE, (f, 0, sx0, 0, f, sy0),
                               resample=Image.BICUBIC if f < 1.2 else Image.LANCZOS if False else Image.BICUBIC)
        # Maske mit runden unteren Ecken (2x fuer Kantenglaettung)
        mw, mh = (rx1 - rx0) * 2, (ry1 - ry0) * 2
        m = Image.new("L", (mw, mh), 0)
        r = RADIUS * z * 2
        ImageDraw.Draw(m).rounded_rectangle([(ox0 - rx0) * 2, (oy0 - ry0) * 2 - r * 2, (ox1 - rx0) * 2, (oy1 - ry0) * 2], r, fill=255)
        m = m.resize((rx1 - rx0, ry1 - ry0), Image.BILINEAR)
        frame.paste(teil, (rx0, ry0), m)
    frame = frame.convert("RGBA")
    over = Image.new("RGBA", (OUT, OUT), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    for (wx, wy, u) in wellen:     # Klick-Wellen, u = 0..1
        sxw, syw = szene_von_seite(wx, wy)
        oxw, oyw = (sxw - cx) * z + OUT / 2, (syw - cy) * z + OUT / 2
        rr = (6 + 26 * ease_io(u)) * K * z
        al = int(150 * (1 - u))
        d.ellipse([oxw - rr, oyw - rr, oxw + rr, oyw + rr], outline=(255, 255, 255, al), width=max(2, int(3 * z)))
        d.ellipse([oxw - rr * 0.55, oyw - rr * 0.55, oxw + rr * 0.55, oyw + rr * 0.55], fill=(30, 90, 255, int(al * 0.35)))
    frame = Image.alpha_composite(frame, over)
    if maus is not None:
        mx, my = maus
        sxm, sym = szene_von_seite(mx, my)
        oxm, oym = (sxm - cx) * z + OUT / 2, (sym - cy) * z + OUT / 2
        hoehe_css = 25                              # Zeigergroesse in CSS-px
        skal = hoehe_css * K * z / (22 * ZEIGER_S)
        skal = min(skal, 0.42)
        w, h = int(ZEIGER.width * skal), int(ZEIGER.height * skal)
        sp = ZEIGER.resize((max(1, w), max(1, h)), Image.LANCZOS)
        px, py = int(oxm - ZEIGER_SPITZE[0] * skal), int(oym - ZEIGER_SPITZE[1] * skal)
        frame.alpha_composite(sp, (px, py)) if 0 <= px and 0 <= py and px + w <= OUT and py + h <= OUT else frame.paste(sp, (px, py), sp)
    return frame.convert("RGB")


def routen_maske(a):
    """Routenpixel auf der (dunklen, entsaettigten) Karte: kraeftig gesaettigt und hell genug."""
    mx, mn = a.max(axis=2), a.min(axis=2)
    return (((mx - mn) > 80) & (mx > 130)) | (mx > 238)


# ------------------------------------------------------------------ Ablauf
class Regie:
    def __init__(self, pg):
        self.pg = pg
        self.cam_moves = []      # (f0, f1, ziel_fn)
        self.maus_moves = []     # (f0, f1, ziel_fn)
        self.scroll_moves = []   # (f0, f1, ziel_fn)
        self.aktionen = {}       # f -> [fn]
        self.cam = GANZ
        self.maus = (760, 640)
        self.scroll = 0.0
        self._aktiv_cam = None
        self._aktiv_maus = None
        self._aktiv_scroll = None
        self.wellen = []         # (x, y, f_start)
        self.fade = None         # (bild, f_start, dauer)

    def bei(self, f, fn):
        self.aktionen.setdefault(f, []).append(fn)

    def kamera(self, t0, t1, ziel):
        self.cam_moves.append((F(t0), F(t1), ziel))

    def maus_zu(self, t0, t1, ziel):
        self.maus_moves.append((F(t0), F(t1), ziel))

    def scrollen(self, t0, t1, ziel):
        self.scroll_moves.append((F(t0), F(t1), ziel))

    def klick(self, t, fade=5, warten=350):
        def fn(r=self, fade=fade, warten=warten):
            r.pg.mouse.move(*r.maus)
            r.pg.mouse.down()
            r.pg.mouse.up()
            r.wellen.append((r.maus[0], r.maus[1], r.f))
            if fade:
                r.fade_anfordern(fade)
            r.pg.wait_for_timeout(warten)
        self.bei(F(t), fn)

    def fade_anfordern(self, dauer):
        self.fade = (self.letztes_bild, self.f, dauer)

    # Hilfen fuer Ziele (CSS-px)
    def box(self, sel, text=None, nth=0, regex=None):
        loc = self.pg.locator(sel)
        if text is not None:
            loc = loc.filter(has_text=re.compile(regex) if regex else text)
        b = loc.nth(nth).bounding_box()
        return (b["x"], b["y"], b["width"], b["height"])

    def mitte(self, *a, **kw):
        x, y, w, h = self.box(*a, **kw)
        return (x + w / 2, y + h / 2)

    def _schritt(self, moves, aktiv_attr, wert_attr, f, mischen):
        aktiv = getattr(self, aktiv_attr)
        for (f0, f1, ziel) in moves:
            if f == f0:
                start = getattr(self, wert_attr)
                z = ziel() if callable(ziel) else ziel
                aktiv = (f0, f1, start, z)
                setattr(self, aktiv_attr, aktiv)
        if aktiv:
            f0, f1, start, z = aktiv
            u = ease_io((f - f0) / max(1, f1 - f0))
            setattr(self, wert_attr, mischen(start, z, u))
            if f >= f1:
                setattr(self, aktiv_attr, None)

    def schritt(self, f):
        self.f = f
        lerp = lambda a, b, u: tuple(x + (y - x) * u for x, y in zip(a, b))  # noqa: E731

        def cam_mix(a, b, u):
            # Zoom logarithmisch mischen, Mitte linear -> ruhige Fahrt
            z = math.exp(math.log(a[2]) + (math.log(b[2]) - math.log(a[2])) * u)
            return (a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, z)

        self._schritt(self.cam_moves, "_aktiv_cam", "cam", f, cam_mix)
        alt_maus = self.maus
        self._schritt(self.maus_moves, "_aktiv_maus", "maus", f, lerp)
        alt_scroll = self.scroll
        self._schritt(self.scroll_moves, "_aktiv_scroll", "scroll", f, lambda a, b, u: a + (b - a) * u)
        if self.scroll != alt_scroll:
            self.pg.evaluate("(v)=>{const m=document.querySelector('main.main'); if(m) m.scrollTop=v}", self.scroll)
        if self.maus != alt_maus:
            self.pg.mouse.move(*self.maus)
        for fn in self.aktionen.get(f, []):
            fn()


def main():
    base = szene_bauen()
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{OUT}x{OUT}",
                           "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "15",
                           "-pix_fmt", "yuv420p", "-r", str(FPS), "-movflags", "+faststart", AUSGABE], stdin=subprocess.PIPE)
    kontroll = {F(1.6): "1_aktivitaeten", F(4.2): "2_koerperdaten", F(7.4): "3_bestzeiten", F(10.4): "4_einheit",
                F(13.6): "5_share_studio", F(17.0): "6a_karte", F(20.9): "6b_karte"}
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, headless=True)
        pg = b.new_page(viewport={"width": VW, "height": VH}, device_scale_factor=DSF, color_scheme="dark")
        offen = {"n": 0}
        ist_kachel = lambda r: "tile.openstreetmap.org" in r.url  # noqa: E731
        pg.on("request", lambda r: offen.__setitem__("n", offen["n"] + 1) if ist_kachel(r) else None)
        pg.on("requestfinished", lambda r: offen.__setitem__("n", offen["n"] - 1) if ist_kachel(r) else None)
        pg.on("requestfailed", lambda r: offen.__setitem__("n", offen["n"] - 1) if ist_kachel(r) else None)
        pg.goto(URL)
        pg.wait_for_timeout(3000)
        pg.add_style_tag(content="*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important;user-select:none!important} ::-webkit-scrollbar{display:none}")
        nav = lambda txt: pg.locator("aside button, nav button, button").filter(has_text=re.compile("^" + txt)).first  # noqa: E731
        nav("Körperdaten").click()            # gemeinsamen Zeitraum auf 12 Wochen stellen
        pg.wait_for_timeout(600)
        pg.locator("main button", has_text="12 Wochen").first.click()
        pg.wait_for_timeout(600)
        nav("Aktivitäten").click()
        pg.wait_for_timeout(600)
        pg.locator("main button", has_text="‹").first.click()
        pg.wait_for_timeout(800)
        pg.mouse.move(760, 640)

        r = Regie(pg)
        main_box = lambda: r.box("main.main")  # noqa: E731

        # ---------- A 0,0-2,7 s: vergangene Einheiten (Aktivitaeten KW 44)
        r.kamera(0.15, 1.25, lambda: kamera_auf_box((262, 220, 680, 640), pad=0.04))
        r.maus_zu(0.1, 1.0, lambda: r.mitte("main button.akt", text="Abendlauf"))
        r.maus_zu(1.05, 1.7, lambda: r.mitte("main button.akt", text="MyWhoosh - Nomad"))
        r.scrollen(1.2, 2.25, lambda: min(r.pg.evaluate("()=>{const m=document.querySelector('main.main');return m.scrollHeight-m.clientHeight}"), 560))
        r.kamera(1.3, 2.2, lambda: kamera_auf_box((262, 300, 920, 700), pad=0.02))
        r.maus_zu(1.75, 2.55, lambda: r.mitte("button", text="Körperdaten", regex="^Körperdaten"))
        r.kamera(2.2, 2.85, GANZ)
        r.klick(2.62)

        # ---------- B 2,8-4,8 s: Koerperdaten
        def koerper_box():
            x0, y0, w0, h0 = r.box("main section.feld", nth=0)
            x2, y2, w2, h2 = r.box("main section.feld", nth=2)
            return (x0, y0 - 30, x2 + w2 - x0, h0 + 60)
        r.kamera(2.85, 3.6, lambda: kamera_auf_box(koerper_box(), pad=0.04))

        def hrv_punkt(u):
            def fn():
                x, y, w, h = r.box(".chartbox", nth=0)
                return (x + w * (0.25 + 0.6 * u), y + h * 0.45)
            return fn
        r.maus_zu(2.9, 3.45, hrv_punkt(0.0))
        r.maus_zu(3.45, 4.1, hrv_punkt(1.0))
        r.maus_zu(4.15, 4.62, lambda: r.mitte("button", text="Zeiten", regex="^Zeiten"))
        r.kamera(4.0, 4.7, GANZ)
        r.klick(4.64)

        # ---------- C 4,8-8,0 s: Bestzeiten und Verlauf
        tab_box = lambda: r.box("main section.feld", nth=0)  # noqa: E731
        r.kamera(4.75, 5.5, lambda: kamera_auf_box(tab_box(), pad=0.08))
        zeile = lambda txt: (lambda: r.mitte("tr", text=txt, regex="^" + txt))  # noqa: E731
        r.maus_zu(4.75, 5.45, zeile("5 km"))
        r.maus_zu(5.6, 6.15, zeile("10 km"))
        r.klick(6.25, fade=3, warten=300)

        def beide_box():
            x0, y0, w0, h0 = r.box("main section.feld", nth=0)
            x1, y1, w1, h1 = r.box("main section.feld", nth=1)
            return (x0, y0, x1 + w1 - x0, max(h0, h1))
        r.kamera(6.3, 7.1, lambda: kamera_auf_box(beide_box(), pad=0.03))

        # ---------- D 8,0-10,7 s: Punkt anklicken -> Einheit
        def kreise():
            return r.pg.evaluate("""()=>{const s=document.querySelectorAll('.chartbox svg')[0];
              return [...s.querySelectorAll('circle')].map(c=>{const b=c.getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})}""")

        def kreis(wahl):
            def fn():
                ks = kreise()
                if wahl == "best":
                    return min(ks, key=lambda k: k[1])
                ks = sorted(ks, key=lambda k: k[0])
                return ks[int(len(ks) * wahl)]
            return fn
        r.maus_zu(7.1, 7.85, kreis(0.97))
        r.kamera(7.4, 8.2, lambda: kamera_auf_box(r.box("main section.feld", nth=1), pad=0.04, zmax=1.9))
        r.maus_zu(8.0, 8.6, kreis(0.55))
        r.maus_zu(8.7, 9.45, kreis("best"))
        r.klick(9.7, fade=5, warten=900)
        r.kamera(9.75, 10.4, lambda: kamera_auf_box(r.box(".modal"), pad=0.04))

        # ---------- E 10,8-13,8 s: Share-Editor
        r.maus_zu(10.0, 10.6, lambda: r.mitte("button", text="Teilen …", regex="^Teilen"))
        r.klick(10.68, fade=4, warten=1200)
        r.maus_zu(10.95, 11.5, lambda: r.mitte("button", text="Studio …"))
        r.klick(11.6, fade=5, warten=1500)

        def studio_box():
            return (60, 60, VW - 120, VH - 60)
        r.kamera(11.65, 12.2, lambda: kamera_auf_box(studio_box(), pad=0.0, zmax=1.12))
        r.maus_zu(11.75, 12.35, lambda: r.mitte("button", text="Dunkel", nth=0))
        r.klick(12.45, fade=3, warten=700)
        r.maus_zu(12.6, 13.05, lambda: r.mitte('button[aria-label="#2d9cdb"]'))
        r.klick(13.12, fade=3, warten=700)

        # ---------- F 13,8-21,12 s: interaktive Karte
        def zur_karte():
            r.fade_anfordern(7)
            pg.locator('button[aria-label="Zurück"]').first.click()
            pg.wait_for_timeout(500)
            verwerfen = pg.locator("button", has_text="Verwerfen")
            if verwerfen.count():
                verwerfen.first.click()
                pg.wait_for_timeout(500)
            nav("Karte").click()
            pg.wait_for_timeout(700)
            pg.locator("main button", has_text="Gesamt").first.click()
            pg.wait_for_timeout(500)
            pg.locator("main button", has_text="Alles zeigen").first.click()
            pg.wait_for_timeout(2500)
            r.cam = kamera_auf_box(r.box(".kartenflaeche"), pad=0.0, zmax=1.0)
            k = r.box(".kartenflaeche")
            r.maus = (k[0] + k[2] * 0.62, k[1] + k[3] * 0.62)
            pg.mouse.move(*r.maus)
            tiles_abwarten(4000)
        r.bei(F(13.8), zur_karte)

        def tiles_abwarten(maxms=2500):
            t0 = time.time()
            pg.wait_for_timeout(60)
            while offen["n"] > 0 and (time.time() - t0) * 1000 < maxms:
                pg.wait_for_timeout(40)
            pg.wait_for_timeout(60)

        def cluster():
            """Dichteste Stelle der Routen auf der Karte (aus einem Screenshot)."""
            k = r.box(".kartenflaeche")
            png = pg.screenshot(clip={"x": k[0], "y": k[1], "width": k[2], "height": k[3]}, scale="css")
            a = np.asarray(Image.open(io.BytesIO(png)).convert("RGB")).astype(int)
            rr, gg, bb = a[..., 0], a[..., 1], a[..., 2]
            ys, xs = np.nonzero(routen_maske(a))
            if len(xs) == 0:
                return (k[0] + k[2] / 2, k[1] + k[3] / 2)
            return (k[0] + float(np.median(xs)), k[1] + float(np.median(ys)))

        r.maus_zu(14.05, 14.8, cluster)
        r.kamera(14.0, 15.0, lambda: kamera_auf_box(r.box(".kartenflaeche"), pad=0.0, zmax=1.18))
        # sanft hineinzoomen (Mausrad, Punkt unter dem Zeiger bleibt stehen)
        Z0, Z1 = F(14.9), F(18.6)
        gesamt = -math.log(2 ** 5.6) / 0.0016
        gew = [ease_io((i + 1) / (Z1 - Z0)) - ease_io(i / (Z1 - Z0)) for i in range(Z1 - Z0)]

        def wheel_fn(i):
            def fn():
                pg.evaluate("""([dy,x,y])=>{const c=document.querySelector('.kartenflaeche canvas');
                  c.dispatchEvent(new WheelEvent('wheel',{deltaY:dy,clientX:x,clientY:y,bubbles:true,cancelable:true}))}""",
                            [gesamt * gew[i], r.maus[0], r.maus[1]])
            return fn
        for i in range(Z1 - Z0):
            r.bei(Z0 + i, wheel_fn(i))
        # Kamera folgt leicht
        r.kamera(16.6, 18.9, lambda: kamera_klemmen(*szene_von_seite(*r.maus), 1.45))

        # leicht verschieben (ziehen) und eine Tour anfahren
        def ziehen_start():
            pg.mouse.down()
        r.bei(F(18.75), ziehen_start)
        r.maus_zu(18.75, 19.6, lambda: (r.maus[0] - 70, r.maus[1] - 25))

        def ziehen_ende():
            pg.mouse.up()
        r.bei(F(19.62), ziehen_ende)

        def route_nah():
            k = r.box(".kartenflaeche")
            png = pg.screenshot(clip={"x": k[0], "y": k[1], "width": k[2], "height": k[3]}, scale="css")
            a = np.asarray(Image.open(io.BytesIO(png)).convert("RGB")).astype(int)
            rr, gg, bb = a[..., 0], a[..., 1], a[..., 2]
            ys, xs = np.nonzero(routen_maske(a))
            zx, zy = r.maus[0] + 60 - k[0], r.maus[1] + 20 - k[1]
            if len(xs) == 0:
                return (r.maus[0] + 60, r.maus[1] + 20)
            i = int(np.argmin((xs - zx) ** 2 + (ys - zy) ** 2))
            return (k[0] + xs[i], k[1] + ys[i])
        r.maus_zu(19.7, 20.4, route_nah)

        # ---------- Frames
        r.letztes_bild = None
        t_start = time.time()
        for f in range(N):
            r.schritt(f)
            if F(13.8) <= f:
                tiles_abwarten(2500 if f >= Z0 else 1500)
            else:
                pg.wait_for_timeout(25)
            seite = Image.open(io.BytesIO(pg.screenshot(type="png"))).convert("RGB")
            bild = seite
            if r.fade and r.fade[0] is not None:
                alt, fs, dauer = r.fade
                u = (f - fs) / dauer
                if u < 1:
                    bild = Image.blend(alt, seite, ease_io(u))
                else:
                    r.fade = None
            r.letztes_bild = seite
            wellen = [(x, y, (f - fs) / 9) for (x, y, fs) in r.wellen if 0 <= f - fs < 9]
            out = rendern(base, bild, r.cam, r.maus, wellen)
            ff.stdin.write(out.tobytes())
            if f in kontroll:
                out.save(f"{KONTROLLE}/{kontroll[f]}.png")
            if f % 25 == 0:
                print(f"Frame {f}/{N}  {time.time() - t_start:.0f}s", flush=True)
        b.close()
    ff.stdin.close()
    ff.wait()
    print("fertig", AUSGABE)


if __name__ == "__main__":
    main()
