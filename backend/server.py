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
from urllib.parse import urlparse, parse_qs

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
SOLVINDUR_INTERVAL = 3 * 60
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
    threading.Thread(target=_refresh_loop, args=("solvindur_mag", SOLVINDUR_INTERVAL, sources.sott_solvindur_segulsvid), daemon=True).start()
    threading.Thread(target=_refresh_loop, args=("solvindur_wind", SOLVINDUR_INTERVAL, sources.sott_solvindur_plasma), daemon=True).start()
    threading.Thread(target=_refresh_per_stad, args=("cloud", CLOUD_INTERVAL, sources.sott_skyjahula), daemon=True).start()
    threading.Thread(target=_refresh_per_stad, args=("sunmoon", SUNMOON_INTERVAL, sources.sott_myrkur_tungl), daemon=True).start()


def sott_upphafsgogn():
    CACHE.set("ovation", sources.sott_ovation())
    CACHE.set("kp", sources.sott_kp_spa())
    CACHE.set("vedur", sources.sott_vedurstofa_nordurljos())
    CACHE.set("solvindur_mag", sources.sott_solvindur_segulsvid())
    CACHE.set("solvindur_wind", sources.sott_solvindur_plasma())
    for stadur in STADIR:
        cloud = sources.sott_skyjahula(stadur["lat"], stadur["lon"])
        if cloud is not None:
            CACHE.set(f"cloud:{stadur['id']}", cloud)
        sunmoon = sources.sott_myrkur_tungl(stadur["lat"], stadur["lon"])
        if sunmoon is not None:
            CACHE.set(f"sunmoon:{stadur['id']}", sunmoon)
        time.sleep(KURTEISISTOF)


def reikna_alla_stadi(dagur=0):
    # OVATION er bara núgildisspá (~30-60 mín fram í tímann) - á bara við
    # um nótt 0. Fyrir síðari nætur er engin staðbundin virknimæling til.
    ovation = CACHE.get("ovation") if dagur == 0 else None
    kp_spa = CACHE.get("kp")
    nidurstodur = []

    for stadur in STADIR:
        dagar_gogn = CACHE.get(f"sunmoon:{stadur['id']}")
        cloud = CACHE.get(f"cloud:{stadur['id']}")

        nott = None
        if dagar_gogn and len(dagar_gogn) > dagur + 1:
            nott = {
                "dags": dagar_gogn[dagur]["dags"],
                "myrkur_fra": dagar_gogn[dagur]["dusk"],
                "myrkur_til": dagar_gogn[dagur + 1]["dawn"],
                "tungl_birta_pct": dagar_gogn[dagur]["tungl_birta_pct"],
            }

        myrkur_fra = nott["myrkur_fra"] if nott else None
        myrkur_til = nott["myrkur_til"] if nott else None
        tungl_pct = nott["tungl_birta_pct"] if nott else None

        virkni = scoring.ovation_virkni(stadur["lat"], stadur["lon"], ovation) if ovation else None
        kp = scoring.kp_leitni(kp_spa, myrkur_fra, myrkur_til)
        sky_pct = scoring.medal_skyjahula(cloud, myrkur_fra, myrkur_til)
        sky_opacitet = scoring.medal_skyjaopacitet(cloud, myrkur_fra, myrkur_til)
        tungl_uppi = scoring.tungl_uppi_hlutfall(dagar_gogn, dagur, myrkur_fra, myrkur_til)
        uv_haest = scoring.haestu_uv_dagsins(cloud, nott["dags"]) if nott else None
        hiti, hiti_finnst = scoring.hiti_vid_myrkur(cloud, myrkur_fra)

        ut = scoring.reikna_skor(virkni, kp, sky_opacitet, tungl_pct, tungl_uppi, myrkur_fra, myrkur_til)

        nidurstodur.append({
            "id": stadur["id"],
            "nafn": stadur["nafn"],
            "lat": stadur["lat"],
            "lon": stadur["lon"],
            "dagur": dagur,
            "dags": nott["dags"].isoformat() if nott else None,
            "skor": ut["skor"],
            "nakvaemni": ut.get("nakvaemni"),
            "sundurlidun": ut.get("sundurlidun"),
            "ástæða": ut.get("ástæða"),
            "hra_gogn": {
                "virkni_ovation": virkni,
                "kp_leitni": kp,
                "sky_hlutfall": sky_pct,
                "tungl_birta_pct": tungl_pct,
                "tungl_uppi_hlutfall": tungl_uppi,
                "uv_haest_i_dag": uv_haest,
                "hiti": hiti,
                "hiti_finnst": hiti_finnst,
                "myrkur_fra": myrkur_fra.isoformat() if myrkur_fra else None,
                "myrkur_til": myrkur_til.isoformat() if myrkur_til else None,
            },
        })

    nidurstodur.sort(key=lambda x: x["skor"], reverse=True)
    return nidurstodur


def reikna_vakt(dagur=0):
    """Klukkustund-fyrir-klukkustund gögn fyrir eina nótt - notað af vaktar-
    skjánum (Kp per klst + skýjahula per klst per stað). Myrkurgluggi og
    tungl miðast við Reykjavík (fyrsti staður í STADIR) - sami einfaldi
    háttur og restin af forritinu notar fyrir landsvísu-gildi."""
    tilvisun = STADIR[0]
    dagar_gogn = CACHE.get(f"sunmoon:{tilvisun['id']}")
    kp_spa = CACHE.get("kp")

    if not dagar_gogn or len(dagar_gogn) <= dagur + 1:
        return None

    i_kvold = dagar_gogn[dagur]
    a_morgun = dagar_gogn[dagur + 1]

    solsetur = i_kvold["solsetur"]
    solarupprás = a_morgun["solarupprás"]
    myrkur_fra = i_kvold["dusk"]
    myrkur_til = a_morgun["dawn"]

    klst_timar = scoring.naeturklukkustundir(solsetur, solarupprás)
    if not klst_timar:
        return None
    kp_klst = scoring.kp_a_klukkustund(kp_spa, klst_timar)

    upprás_dt = i_kvold["tungl_upp"] or a_morgun["tungl_upp"]

    nott = {
        "solsetur": solsetur.strftime("%H:%M"),
        "solarupprás": solarupprás.strftime("%H:%M"),
        "myrkurFra": myrkur_fra.strftime("%H:%M"),
        "myrkurTil": myrkur_til.strftime("%H:%M"),
        "klst": [t.hour for t in klst_timar],
    }
    tungl = {
        "fasi": round(i_kvold["tungl_birta_pct"] / 100, 3),
        "upprás": upprás_dt.strftime("%H:%M") if upprás_dt else None,
        "heiti": scoring.TUNGLFASA_HEITI.get(i_kvold["tungl_fasi_heiti"], i_kvold["tungl_fasi_heiti"]),
    }

    stadir_ut = []
    for stadur in STADIR:
        cloud = CACHE.get(f"cloud:{stadur['id']}")
        vid_myrkur = scoring.naestigildi(cloud, myrkur_fra)
        stadir_ut.append({
            "id": stadur["id"],
            "nafn": stadur["nafn"],
            "hluti": stadur["hluti"],
            "lat": stadur["lat"],
            "lon": stadur["lon"],
            "sky": scoring.sky_a_klukkustund(cloud, klst_timar),
            "hiti": round(vid_myrkur["hiti"]) if vid_myrkur.get("hiti") is not None else None,
            "vindur": round(vid_myrkur["vindur"], 1) if vid_myrkur.get("vindur") is not None else None,
        })

    mag = CACHE.get("solvindur_mag")
    plasma = CACHE.get("solvindur_wind")
    bz = mag.get("bz_gsm") if mag else None
    bt = mag.get("bt") if mag else None
    hradi = plasma.get("proton_speed") if plasma else None
    thettleiki = plasma.get("proton_density") if plasma else None
    maelt = None
    if mag and mag.get("time_tag"):
        try:
            maelt = datetime.fromisoformat(mag["time_tag"]).replace(tzinfo=timezone.utc).strftime("%H:%M")
        except ValueError:
            maelt = None

    geimvedur = {
        "bz": round(bz, 1) if bz is not None else None,
        "bt": round(bt, 1) if bt is not None else None,
        "hradi": round(hradi) if hradi is not None else None,
        "thettleiki": round(thettleiki, 1) if thettleiki is not None else None,
        "tulkun": scoring.solvindur_tulkun(bz, hradi),
        "maelt": maelt,
    }

    return {"nott": nott, "kpSpa": kp_klst, "tungl": tungl, "stadir": stadir_ut, "geimvedur": geimvedur}


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
        slod = urlparse(self.path)
        if slod.path == "/api/skor":
            fyrirspurn = parse_qs(slod.query)
            try:
                dagur = int(fyrirspurn.get("dagur", ["0"])[0])
            except ValueError:
                dagur = 0
            dagur = max(0, min(2, dagur))
            self._senda_json({
                "reiknad": datetime.now(timezone.utc).isoformat(),
                "dagur": dagur,
                "stadir": reikna_alla_stadi(dagur),
            })
        elif slod.path == "/api/vakt":
            fyrirspurn = parse_qs(slod.query)
            try:
                dagur = int(fyrirspurn.get("dagur", ["0"])[0])
            except ValueError:
                dagur = 0
            dagur = max(0, min(2, dagur))
            vakt = reikna_vakt(dagur)
            if vakt is None:
                self._senda_json({"villa": "gögn ekki tilbúin ennþá"}, stada=503)
            else:
                self._senda_json({"reiknad": datetime.now(timezone.utc).isoformat(), "dagur": dagur, **vakt})
        elif slod.path == "/api/heilsa":
            self._senda_json({
                "ok": True,
                "aldur_sek": {
                    lykill: CACHE.age_seconds(lykill) for lykill in ("ovation", "kp", "vedur")
                },
            })
        elif slod.path in ("/", "/index.html"):
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
