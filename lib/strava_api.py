# -*- coding: utf-8 -*-
"""
Strava-Zugang: Zugangsdaten laden/speichern, Anmeldung im Browser (OAuth) und API-Abrufe.

Die Zugangsdaten (Client ID, Client Secret, Tokens) liegen verschluesselt im Tresor (lib/tresor.py, Name "strava") und verlassen
den PC nie.
Anmeldung: Strava leitet nach der Bestaetigung auf http://localhost:8123/callback zurueck; deshalb muss in der eigenen
Strava-API-App als "Authorization Callback Domain" localhost eingetragen sein.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

import orte
import tresor

ALT_KLARTEXT = orte.CONFIG / "strava.secrets.json"     # fruehere Versionen; wird beim Laden uebernommen und geloescht
OAUTH_PORT = 8123
REDIRECT_URI = "http://localhost:%d/callback" % OAUTH_PORT
API = "https://www.strava.com/api/v3"


class StravaError(Exception):
    pass


def _alt_lesen(text):
    j = json.loads(text)
    return j if isinstance(j, dict) and (j.get("refresh_token") or j.get("client_secret")) else None


def load_config():
    cfg = {"client_id": "", "client_secret": "", "refresh_token": "", "access_token": "", "expires_at": 0}
    tresor.uebernehmen("strava", ALT_KLARTEXT, _alt_lesen)
    cfg.update({k: v for k, v in (tresor.lesen("strava") or {}).items() if k in cfg})     # unbekannte alte Felder fallen weg
    return cfg


def save_config(cfg):
    try:
        tresor.schreiben("strava", cfg)
    except OSError as e:
        raise StravaError("Strava-Zugang ließ sich nicht verschlüsselt speichern: %s" % e)


def _http(req):
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", "replace")[:300]
        except Exception:       # noqa: BLE001
            body = ""
        raise StravaError("Strava antwortete mit HTTP %d. %s" % (e.code, body))
    except urllib.error.URLError as e:
        raise StravaError("Keine Verbindung zu Strava: %s" % e.reason)


def token_request(payload):
    data = urllib.parse.urlencode(payload).encode()
    return _http(urllib.request.Request("https://www.strava.com/oauth/token", data=data))


def store_tokens(cfg, tok):
    cfg["access_token"] = tok.get("access_token", "")
    cfg["expires_at"] = tok.get("expires_at", 0)
    if tok.get("refresh_token"):
        cfg["refresh_token"] = tok["refresh_token"]
    save_config(cfg)


def get_access_token(cfg):
    if cfg.get("access_token") and cfg.get("expires_at", 0) > time.time() + 60:
        return cfg["access_token"]
    if not (cfg.get("client_id") and cfg.get("client_secret") and cfg.get("refresh_token")):
        raise StravaError("Strava ist noch nicht verbunden.")
    tok = token_request({"client_id": cfg["client_id"], "client_secret": cfg["client_secret"],
                         "grant_type": "refresh_token", "refresh_token": cfg["refresh_token"]})
    store_tokens(cfg, tok)      # Strava kann einen neuen Refresh-Token liefern
    return cfg["access_token"]


def api_get(cfg, path, params=None):
    token = get_access_token(cfg)
    url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
    return _http(urllib.request.Request(url, headers={"Authorization": "Bearer " + token}))


def oauth_authorize(cfg, timeout=180):
    """Oeffnet den Browser, faengt den Code auf localhost:8123 ab und tauscht ihn gegen Tokens. -> Vorname"""
    if not (cfg.get("client_id") and cfg.get("client_secret")):
        raise StravaError("Bitte zuerst Client ID und Client Secret eintragen.")
    result = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.urlparse(self.path)
            if q.path != "/callback":
                self.send_response(404)
                self.end_headers()
                return
            result.update({k: v[0] for k, v in urllib.parse.parse_qs(q.query).items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write("<html><body style='font-family:sans-serif;background:#111;color:#eee;text-align:center;padding-top:80px'>"
                             "<h2>Mit Strava verbunden ✔</h2><p>Du kannst dieses Fenster schließen und zum Dashboard zurückgehen.</p>"
                             "</body></html>".encode("utf-8"))

        def log_message(self, *a):
            pass

    try:
        srv = HTTPServer(("127.0.0.1", OAUTH_PORT), Handler)
    except OSError as e:
        raise StravaError("Port %d ist belegt (läuft das Dashboard zweimal?): %s" % (OAUTH_PORT, e))
    srv.timeout = 5
    params = urllib.parse.urlencode({"client_id": cfg["client_id"], "response_type": "code", "redirect_uri": REDIRECT_URI,
                                     "approval_prompt": "auto", "scope": "read,activity:read_all"})
    webbrowser.open("https://www.strava.com/oauth/authorize?" + params)
    deadline = time.time() + timeout
    while "code" not in result and "error" not in result and time.time() < deadline:
        srv.handle_request()
    srv.server_close()
    if "error" in result:
        raise StravaError("Anmeldung bei Strava abgelehnt: " + result["error"])
    if "code" not in result:
        raise StravaError("Zeitüberschreitung bei der Anmeldung (3 Minuten).")
    if "activity:read" not in result.get("scope", ""):
        raise StravaError("Der Zugriff auf Aktivitäten wurde nicht freigegeben (Haken bei „Aktivitätsdaten ansehen“ setzen).")
    tok = token_request({"client_id": cfg["client_id"], "client_secret": cfg["client_secret"], "code": result["code"],
                         "grant_type": "authorization_code"})
    store_tokens(cfg, tok)
    return tok.get("athlete", {}).get("firstname", "")
