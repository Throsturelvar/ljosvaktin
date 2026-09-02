"""Ljósvaktin - bakendi. Sækir gögn frá NOAA SWPC, Open-Meteo,
sunrisesunset.io og Veðurstofu Íslands í bakgrunnsþráðum á föstu
millibili og reiknar skor á fyrirspurn úr því sem síðast tókst að
sækja. Fyrirspurnir sjálfar gera aldrei netkall - það heldur svörun
hraðri og virðir "hófsemi" sem Veðurstofan biður um."""

import json
import os
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import scoring
import sources
from cache import TTLCache
from locations import STADIR

CACHE = TTLCache()
STATIC_DIR = Path(__file__).parent / "static"

OVATION_INTERVAL = 20 * 60
KP_INTERVAL = 3 * 60 * 60
CLOUD_INTERVAL = 30 * 60
SUNMOON_INTERVAL = 6 * 60 * 60
VEDUR_INTERVAL = 60 * 60
KURTEISISTOF = 1  # sek. milli kalla á sama veitu fyrir mismunandi staði


def _refresh_loop(lykill, bil, fall):
    while True:
        time.sleep(bil)
        gildi = fall()
        if gildi is not None:
            CACHE.set(lykill, gildi)


def _refresh_per_stad(lykilforskeyti, bil, fall):
    while True:
        time.sleep(bil)
        for stadur in STADIR:
            gildi = fall(stadur["lat"], stadur["lon"])
            if gildi is not None:
                CACHE.set(f"{lykilforskeyti}:{stadur['id']}", gildi)
            time.sleep(KURTEISISTOF)


def hefja_baksvidsuppfaerslur():
    threading.Thread(target=_refresh_loop, args=("ovation", OVATION_INTERVAL, sources.sott_ovation), daemon=True).start()
    threading.Thread(target=_refresh_loop, args=("kp", KP_INTERVAL, sources.sott_kp_spa), daemon=True).start()
    threading.Thread(target=_refresh_loop, args=("vedur", VEDUR_INTERVAL, sources.sott_vedurstofa_nordurljos), daemon=True).start()
    threading.Thread(target=_refresh_per_stad, args=("cloud", CLOUD_INTERVAL, sources.sott_skyjahula), daemon=True).start()
    threading.Thread(target=_refresh_per_stad, args=("sunmoon", SUNMOON_INTERVAL, sources.sott_myrkur_tungl), daemon=True).start()


def sott_upphafsgogn():
    CACHE.set("ovation", sources.sott_ovation())
    CACHE.set("kp", sources.sott_kp_spa())
    CACHE.set("vedur", sources.sott_vedurstofa_nordurljos())
    for stadur in STADIR:
        cloud = sources.sott_skyjahula(stadur["lat"], stadur["lon"])
        if cloud is not None:
            CACHE.set(f"cloud:{stadur['id']}", cloud)
        sunmoon = sources.sott_myrkur_tungl(stadur["lat"], stadur["lon"])
        if sunmoon is not None:
            CACHE.set(f"sunmoon:{stadur['id']}", sunmoon)
        time.sleep(KURTEISISTOF)


def reikna_alla_stadi():
    ovation = CACHE.get("ovation")
    kp_spa = CACHE.get("kp")
    nidurstodur = []

    for stadur in STADIR:
        sunmoon = CACHE.get(f"sunmoon:{stadur['id']}")
        cloud = CACHE.get(f"cloud:{stadur['id']}")
        myrkur_fra = sunmoon["myrkur_fra"] if sunmoon else None
        myrkur_til = sunmoon["myrkur_til"] if sunmoon else None
        tungl_pct = sunmoon["tungl_birta_pct"] if sunmoon else None

        virkni = scoring.ovation_virkni(stadur["lat"], stadur["lon"], ovation)
        kp = scoring.kp_leitni(kp_spa, myrkur_fra, myrkur_til)
        sky_pct = scoring.medal_skyjahula(cloud, myrkur_fra, myrkur_til)

        ut = scoring.reikna_skor(virkni, kp, sky_pct, tungl_pct, myrkur_fra, myrkur_til)

        nidurstodur.append({
            "id": stadur["id"],
            "nafn": stadur["nafn"],
            "lat": stadur["lat"],
            "lon": stadur["lon"],
            "skor": ut["skor"],
            "sundurlidun": ut.get("sundurlidun"),
            "ástæða": ut.get("ástæða"),
            "hra_gogn": {
                "virkni_ovation": virkni,
                "kp_leitni": kp,
                "sky_hlutfall": sky_pct,
                "tungl_birta_pct": tungl_pct,
                "myrkur_fra": myrkur_fra.isoformat() if myrkur_fra else None,
                "myrkur_til": myrkur_til.isoformat() if myrkur_til else None,
            },
        })

    nidurstodur.sort(key=lambda x: x["skor"], reverse=True)
    return nidurstodur


class Handler(BaseHTTPRequestHandler):
    def _senda_json(self, gogn, stada=200):
        payload = json.dumps(gogn, ensure_ascii=False).encode("utf-8")
        self.send_response(stada)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/api/skor":
            self._senda_json({
                "reiknad": datetime.now(timezone.utc).isoformat(),
                "stadir": reikna_alla_stadi(),
            })
        elif self.path == "/api/heilsa":
            self._senda_json({
                "ok": True,
                "aldur_sek": {
                    lykill: CACHE.age_seconds(lykill) for lykill in ("ovation", "kp", "vedur")
                },
            })
        elif self.path in ("/", "/index.html"):
            self._senda_skra(STATIC_DIR / "index.html", "text/html; charset=utf-8")
        else:
            self._senda_json({"villa": "fannst ekki"}, stada=404)

    def _senda_skra(self, slod, tegund):
        if not slod.is_file():
            self._senda_json({"villa": "fannst ekki"}, stada=404)
            return
        payload = slod.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", tegund)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, form, *args):
        pass  # hljóðlátt - sources.py prentar sínar eigin viðvaranir


def main():
    print("Ljósvaktin bakendi — sæki upphafsgögn áður en hlustun hefst ...")
    sott_upphafsgogn()
    hefja_baksvidsuppfaerslur()

    port = int(os.environ.get("PORT", 8000))
    print(f"Hlusta á http://localhost:{port}/api/skor")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
