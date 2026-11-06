# -*- coding: utf-8 -*-
"""
Zwei Zusatzclips fuer Picture-in-Picture (Dark Mode, gleiche Technik wie aufnahme.py):

  pip_hook.mp4     1920x1080, 261 Frames: Highlight-Montage, Strava/Garmin verbinden, Zugangsdaten bleiben lokal
                   (Dashboard-Inhalt bildfuellend, ohne Fensterrahmen)
  pip_vorlauf.mp4  1920x1920, 53 Frames: ruhiger Zoom heraus, endet exakt mit Frame 0 von strava_dashboard_aufnahme.mp4

  python pip.py hook|vorlauf <url_verbunden> <url_unverbunden> <ausgabe.mp4> <kontrollordner>
"""
import io
import math
import re
import subprocess
import sys
import time

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

import aufnahme as A

MODUS, URL1, URL2, AUSGABE, KONTROLLE = sys.argv[1:6]
F, ease_io = A.F, A.ease_io


def ffmpeg(w, h):
    return subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}",
                             "-r", "25", "-i", "-", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "15",
                             "-pix_fmt", "yuv420p", "-r", "25", "-movflags", "+faststart", AUSGABE], stdin=subprocess.PIPE)


def browser(p):
    return p.chromium.launch(executable_path=A.CHROME, headless=True)


STIL = ("*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important;"
        "user-select:none!important} ::-webkit-scrollbar{display:none}")


def nav(pg, txt):
    return pg.locator("button").filter(has_text=re.compile("^" + txt)).first


# ====================================================================== Vorlauf (1920x1920)
def vorlauf():
    base = A.szene_bauen()
    ff = ffmpeg(A.OUT, A.OUT)
    with sync_playwright() as p:
        b = browser(p)
        pg = b.new_page(viewport={"width": A.VW, "height": A.VH}, device_scale_factor=A.DSF, color_scheme="dark")
        pg.goto(URL1)
        pg.wait_for_timeout(3000)
        pg.add_style_tag(content=STIL)
        # exakt wie in aufnahme.py
        nav(pg, "Körperdaten").click()
        pg.wait_for_timeout(600)
        pg.locator("main button", has_text="12 Wochen").first.click()
        pg.wait_for_timeout(600)
        nav(pg, "Aktivitäten").click()
        pg.wait_for_timeout(600)
        pg.locator("main button", has_text="‹").first.click()
        pg.wait_for_timeout(800)
        pg.mouse.move(980, 780)

        r = A.Regie(pg)
        r.maus = (980, 780)
        r.cam = A.kamera_klemmen(*A.szene_von_seite(640, 560), 1.8)
        r.kamera(0.0, 52 / 25, A.GANZ)
        r.maus_zu(0.3, 1.9, (760, 640))
        r.letztes_bild = None
        N = 53
        for f in range(N):
            r.schritt(f)
            if f == N - 1:
                r.cam, r.maus = A.GANZ, (760, 640)
                pg.mouse.move(760, 640)
            pg.wait_for_timeout(25)
            seite = Image.open(io.BytesIO(pg.screenshot(type="png"))).convert("RGB")
            out = A.rendern(base, seite, r.cam, r.maus, [])
            ff.stdin.write(out.tobytes())
            if f in (0, 26, N - 1):
                out.save(f"{KONTROLLE}/vorlauf_f{f:02d}.png")
        b.close()
    ff.stdin.close()
    ff.wait()


# ====================================================================== Hook (1920x1080, bildfuellend)
HW, HH = 1440, 810          # Viewport (CSS-px), 16:9
OW, OH = 1920, 1080


def cam_klemmen(cx, cy, z):
    hw, hh = HW / 2 / z, HH / 2 / z
    return (min(max(cx, hw), HW - hw), min(max(cy, hh), HH - hh), z)


def cam_box(box, pad=0.08, zmax=2.6, zmin=1.0):
    x, y, w, h = box
    z = min(HW / (w * (1 + pad)), HH / (h * (1 + pad)))
    return cam_klemmen(x + w / 2, y + h / 2, max(zmin, min(zmax, z)))


def hook_rendern(seite, cam, maus, wellen):
    cx, cy, z = cam_klemmen(*cam)
    s = OW * z / HW                    # Ausgabe-px je CSS-px
    f = A.DSF / s
    x0, y0 = (cx - OW / 2 / s) * A.DSF, (cy - OH / 2 / s) * A.DSF
    out = seite.transform((OW, OH), Image.AFFINE, (f, 0, x0, 0, f, y0), resample=Image.BICUBIC).convert("RGBA")
    from PIL import ImageDraw
    over = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    for (wx, wy, u) in wellen:
        ox, oy = (wx - cx) * s + OW / 2, (wy - cy) * s + OH / 2
        rr = (6 + 26 * ease_io(u)) * s * 0.75
        al = int(150 * (1 - u))
        d.ellipse([ox - rr, oy - rr, ox + rr, oy + rr], outline=(255, 255, 255, al), width=max(2, int(2 * z)))
        d.ellipse([ox - rr * .55, oy - rr * .55, ox + rr * .55, oy + rr * .55], fill=(30, 90, 255, int(al * .35)))
    out = Image.alpha_composite(out, over)
    if maus is not None:
        ox, oy = (maus[0] - cx) * s + OW / 2, (maus[1] - cy) * s + OH / 2
        skal = min(25 * s / (22 * A.ZEIGER_S), 0.42)
        sp = A.ZEIGER.resize((max(1, int(A.ZEIGER.width * skal)), max(1, int(A.ZEIGER.height * skal))), Image.LANCZOS)
        out.paste(sp, (int(ox - A.ZEIGER_SPITZE[0] * skal), int(oy - A.ZEIGER_SPITZE[1] * skal)), sp)
    return out.convert("RGB")


def wischen(alt, neu, u):
    """Slide: altes Bild schiebt nach links raus, neues kommt von rechts (u = 0..1)."""
    e = ease_io(u)
    dx = int(round(OW * e))
    bild = Image.new("RGB", (OW, OH))
    bild.paste(alt, (-dx, 0))
    bild.paste(neu, (OW - dx, 0))
    return bild


def hook():
    ff = ffmpeg(OW, OH)
    N = 261
    S1, S2, S3, S4, T2, T3 = 0, F(1.08), F(2.2), F(3.36), 116, 191
    WISCH = 7
    kontroll = {14: "hook_1_karte", 41: "hook_2_share", 70: "hook_3_koerper", 100: "hook_4_uebersicht",
                135: "hook_5_strava_verbunden", 178: "hook_6_garmin_verbunden", 255: "hook_7_lokal"}
    with sync_playwright() as p:
        b = browser(p)
        pa = b.new_page(viewport={"width": HW, "height": HH}, device_scale_factor=A.DSF, color_scheme="dark")
        pb = b.new_page(viewport={"width": HW, "height": HH}, device_scale_factor=A.DSF, color_scheme="dark")
        offen = {"n": 0}
        kachel = lambda q: "tile.openstreetmap.org" in q.url  # noqa: E731
        pa.on("request", lambda q: offen.__setitem__("n", offen["n"] + 1) if kachel(q) else None)
        pa.on("requestfinished", lambda q: offen.__setitem__("n", offen["n"] - 1) if kachel(q) else None)
        pa.on("requestfailed", lambda q: offen.__setitem__("n", offen["n"] - 1) if kachel(q) else None)

        def tiles(maxms=2500):
            t0 = time.time()
            pa.wait_for_timeout(60)
            while offen["n"] > 0 and (time.time() - t0) * 1000 < maxms:
                pa.wait_for_timeout(40)
            pa.wait_for_timeout(60)

        for pg, url in ((pa, URL1), (pb, URL2)):
            pg.goto(url)
            pg.wait_for_timeout(3000)
            pg.add_style_tag(content=STIL)

        # Seite B (nicht verbunden): Einrichtung schon offen
        nav(pb, "Aktivitäten").click()
        pb.wait_for_timeout(400)
        nav(pb, "Einrichtung").click()
        pb.wait_for_timeout(600)
        pb.locator(".ob input").first.evaluate("e => e.blur()")
        pb.mouse.move(1150, 640)

        def wheel(dy, x, y):
            pa.evaluate("""([dy,x,y])=>{const c=document.querySelector('.kartenflaeche canvas');
              c.dispatchEvent(new WheelEvent('wheel',{deltaY:dy,clientX:x,clientY:y,bubbles:true,cancelable:true}))}""", [dy, x, y])

        # Seite A: Karte vorbereiten (alle Routen, auf Raum Paderborn gezoomt)
        nav(pa, "Karte").click()
        pa.wait_for_timeout(600)
        pa.locator("main button", has_text="Gesamt").first.click()
        pa.wait_for_timeout(300)
        pa.locator("main button", has_text="Alles zeigen").first.click()
        pa.wait_for_timeout(2000)
        tiles(4000)
        k = pa.locator(".kartenflaeche").bounding_box()
        a = np.asarray(Image.open(io.BytesIO(pa.screenshot(clip=k, scale="css"))).convert("RGB")).astype(int)
        ys, xs = np.nonzero(A.routen_maske(a))
        clu = (k["x"] + float(np.median(xs)), k["y"] + float(np.median(ys))) if len(xs) else (k["x"] + k["width"] / 2, k["y"] + k["height"] / 2)
        for _ in range(10):
            wheel(-math.log(2 ** 4.4) / 0.0016 / 10, *clu)
            pa.wait_for_timeout(50)
        tiles(4000)
        # Cluster nach dem Zoom in die Bildmitte schieben (ziehen)
        mx, my = k["x"] + k["width"] / 2, k["y"] + k["height"] / 2
        pa.mouse.move(*clu)
        pa.mouse.down()
        pa.mouse.move((clu[0] + mx) / 2, (clu[1] + my) / 2, steps=5)
        pa.mouse.move(mx, my, steps=5)
        pa.mouse.up()
        pa.mouse.move(HW - 5, HH - 5)
        tiles(4000)

        r = A.Regie(pa)
        r.cam = cam_klemmen(mx, my, 1.25)
        r.maus = (HW - 5, HH - 5)
        zeige_maus = {"an": False}

        # ---- Montage
        r.kamera(0.0, 1.08, cam_klemmen(mx, my, 1.7))
        for i in range(S1, S2):
            r.bei(i, (lambda: wheel(-14, mx, my)))

        def zum_studio():
            nav(pa, "Zeiten").click()
            pa.wait_for_timeout(500)
            pa.locator("tr").filter(has_text=re.compile("^10 km")).first.click()
            pa.wait_for_timeout(400)
            ks = pa.evaluate("""()=>{const s=document.querySelectorAll('.chartbox svg')[0];
              return [...s.querySelectorAll('circle')].map(c=>{const b=c.getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})}""")
            best = min(ks, key=lambda q: q[1])
            pa.mouse.move(*best)
            pa.wait_for_timeout(200)
            pa.mouse.click(*best)
            pa.wait_for_timeout(900)
            pa.locator("button").filter(has_text=re.compile("^Teilen")).last.click()
            pa.wait_for_timeout(1000)
            pa.locator("button", has_text="Studio …").last.click()
            pa.wait_for_timeout(1500)
            pa.locator("button", has_text="Dunkel").first.click()
            pa.locator('button[aria-label="#2d9cdb"]').last.click()
            pa.mouse.move(HW - 5, HH - 5)
            pa.wait_for_timeout(700)
            vb = pa.locator("canvas").first.bounding_box()
            r.cam = cam_klemmen(vb["x"] + vb["width"] / 2, vb["y"] + vb["height"] * 0.22, 2.5)
            r.kamera(S2 / 25 + 0.05, S3 / 25, cam_klemmen(vb["x"] + vb["width"] / 2, vb["y"] + vb["height"] * 0.62, 1.9))
        r.bei(S2, zum_studio)

        def zum_koerper():
            pa.locator('button[aria-label="Zurück"]').first.click()
            pa.wait_for_timeout(400)
            v = pa.locator("button", has_text="Verwerfen")
            if v.count():
                v.first.click()
                pa.wait_for_timeout(400)
            nav(pa, "Körperdaten").click()
            pa.wait_for_timeout(600)
            pa.locator("main button", has_text="12 Wochen").first.click()
            pa.wait_for_timeout(600)
            b0 = r.box("main section.feld", nth=0)
            b2 = r.box("main section.feld", nth=2)
            r.cam = cam_klemmen(b0[0] + b0[2] / 2, b0[1] + b0[3] / 2, 2.4)
            r.kamera(S3 / 25 + 0.05, S4 / 25, cam_klemmen(b2[0] + b2[2] / 2, b2[1] + b2[3] / 2, 2.2))
        r.bei(S3, zum_koerper)

        def zur_uebersicht():
            nav(pa, "Übersicht").click()
            pa.wait_for_timeout(900)
            b0 = r.box("main section.feld", nth=0)
            b1 = r.box("main section.feld", nth=1)
            r.cam = cam_klemmen(b0[0] + b0[2] * 0.2, b0[1] + b0[3] * 0.5, 2.6)
            r.kamera(S4 / 25 + 0.05, T2 / 25, cam_klemmen(b1[0] + b1[2] / 2, b1[1] + b1[3] / 2, 1.75))
        r.bei(S4, zur_uebersicht)

        # ---- Teil 2: Strava + Garmin verbinden (Seite A)
        def zur_einrichtung():
            nav(pa, "Einrichtung").click()
            pa.wait_for_timeout(700)
            r.maus = (1080, 640)
            pa.mouse.move(*r.maus)
            zeige_maus["an"] = True
            ob = r.box(".ob")
            r.cam = cam_box(ob, pad=0.02)
            r.kamera(T2 / 25 + 0.2, T2 / 25 + 1.0, lambda: cam_box((ob[0] + 230, ob[1], ob[2] - 230, 200), pad=0.05, zmax=2.3))
        r.bei(T2, zur_einrichtung)
        r.maus_zu(T2 / 25 + 0.5, 6.0, lambda: r.mitte(".ob button", text="Weiter"))
        r.klick(6.12, fade=4, warten=600)
        r.kamera(6.2, 6.9, lambda: cam_box((r.box(".ob")[0] + 230, r.box(".ob")[1], r.box(".ob")[2] - 230, 300), pad=0.04, zmax=2.3))
        r.maus_zu(6.4, 7.2, lambda: (r.box(".ob .ob-status")[0] + 300, r.mitte(".ob .ob-status")[1] + 4))

        # ---- Teil 3: Zugangsdaten bleiben lokal (Seite B, nicht verbunden)
        def zu_b():
            r.pg = pb
            r.maus = (1150, 640)
            ob = r.box(".ob")
            r.cam = cam_box(ob, pad=0.02)
        r.bei(T3, zu_b)
        r.kamera(T3 / 25 + 0.1, T3 / 25 + 1.1, lambda: cam_box(
            (r.box(".ob .ob-form")[0] - 10, r.box(".ob .ob-form")[1] - 10, r.box(".ob .ob-form")[2] + 20,
             r.box(".ob .ob-sicher")[1] + r.box(".ob .ob-sicher")[3] - r.box(".ob .ob-form")[1] + 30), pad=0.06, zmax=2.4))
        r.maus_zu(T3 / 25 + 0.15, T3 / 25 + 0.8, lambda: r.mitte(".ob input[type=password]"))
        r.klick(T3 / 25 + 0.9, fade=0, warten=150)
        for j in range(14):     # erfundenes Secret, erscheint nur maskiert
            r.bei(F(T3 / 25 + 1.0) + j * 2, (lambda: pb.keyboard.type("x")))
        r.maus_zu(T3 / 25 + 1.9, T3 / 25 + 2.5, lambda: (r.box(".ob .ob-sicher")[0] + 300, r.mitte(".ob .ob-sicher")[1] + 6))

        # ---- Frames
        r.letztes_bild = None
        letzte_out = None
        wisch_von = None
        t0 = time.time()
        for f in range(N):
            r.schritt(f)
            if f < S2:
                tiles(1500)
            else:
                r.pg.wait_for_timeout(25)
            seite = Image.open(io.BytesIO(r.pg.screenshot(type="png"))).convert("RGB")
            bild = seite
            if r.fade and r.fade[0] is not None and r.fade[0].size == seite.size:
                alt, fs, dauer = r.fade
                u = (f - fs) / dauer
                if u < 1:
                    bild = Image.blend(alt, seite, ease_io(u))
                else:
                    r.fade = None
            r.letztes_bild = seite
            wellen = [(x, y, (f - fs) / 9) for (x, y, fs) in r.wellen if 0 <= f - fs < 9]
            out = hook_rendern(bild, r.cam, r.maus if zeige_maus["an"] else None, wellen)
            if f in (T2, T3):
                wisch_von = (letzte_out, f)
            if wisch_von and f - wisch_von[1] < WISCH:
                gezeigt = wischen(wisch_von[0], out, (f - wisch_von[1] + 1) / WISCH)
            else:
                gezeigt = out
            letzte_out = out
            ff.stdin.write(gezeigt.tobytes())
            if f in kontroll:
                gezeigt.save(f"{KONTROLLE}/{kontroll[f]}.png")
            if f % 25 == 0:
                print(f"Frame {f}/{N}  {time.time() - t0:.0f}s", flush=True)
        b.close()
    ff.stdin.close()
    ff.wait()



if __name__ == "__main__":
    vorlauf() if MODUS == "vorlauf" else hook()
    print("fertig", AUSGABE)
