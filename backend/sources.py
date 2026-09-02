"""Sækjendur fyrir hverja gagnaveitu. Hver fall skilar hreinsuðum gögnum
eða None ef veitan svarar ekki - kallandi ákveður þá hvort eldri
skyndiminnisgildi eru notuð áfram."""

import json
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

HEADERS = {"User-Agent": "ljosvaktin-backend/0.1 (aurora forecast research demo)"}
TIMEOUT = 20


def _get_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


def _get_text(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return r.read().decode("utf-8")


def _warn(kalla, villa):
    print(f"[viðvörun] {kalla} brást: {villa}", file=sys.stderr)


# ---------------------------------------------------------------------
# NOAA SWPC - OVATION norðurljósavirkni (hnitanet á heimsvísu)
# ---------------------------------------------------------------------
def sott_ovation():
    try:
        return _get_json("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json")
    except Exception as e:
        _warn("NOAA OVATION", e)
        return None


# ---------------------------------------------------------------------
# NOAA SWPC - Kp-spá (3 daga, 3ja klst upplausn)
# ---------------------------------------------------------------------
def sott_kp_spa():
    try:
        return _get_json("https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json")
    except Exception as e:
        _warn("NOAA Kp-spá", e)
        return None


# ---------------------------------------------------------------------
# MET Noregur - skýjahula (locationforecast, sama veita og knýr yr.no).
# Notað í stað Open-Meteo því Open-Meteo hafnar með 429 á deildu IP-tölu-
# svæði ókeypis skýjahýsinga (Render o.fl.) - MET Noregur er hannað fyrir
# einmitt svona forritsumferð, krefst bara auðkennds User-Agent.
# ---------------------------------------------------------------------
def sott_skyjahula(lat, lon):
    url = f"https://api.met.no/weatherapi/locationforecast/2.0/compact?lat={lat}&lon={lon}"
    try:
        data = _get_json(url)
        return {
            datetime.fromisoformat(punktur["time"]): punktur["data"]["instant"]["details"]["cloud_area_fraction"]
            for punktur in data["properties"]["timeseries"]
        }
    except Exception as e:
        _warn(f"MET Noregur ({lat},{lon})", e)
        return None


# ---------------------------------------------------------------------
# sunrisesunset.io - myrkurgluggi (dusk->dawn) og tunglbirta
# ---------------------------------------------------------------------
def _thattid(dagsetning, timastrengur):
    return datetime.strptime(
        f"{dagsetning} {timastrengur}", "%Y-%m-%d %I:%M:%S %p"
    ).replace(tzinfo=timezone.utc)


def sott_myrkur_tungl(lat, lon):
    idag = datetime.now(timezone.utc).date()
    a_morgun = idag + timedelta(days=1)
    try:
        i_dag = _get_json(
            f"https://api.sunrisesunset.io/json?lat={lat}&lng={lon}&timezone=UTC&date={idag.isoformat()}"
        )["results"]
        a_morgun_gogn = _get_json(
            f"https://api.sunrisesunset.io/json?lat={lat}&lng={lon}&timezone=UTC&date={a_morgun.isoformat()}"
        )["results"]
        dusk = _thattid(idag.isoformat(), i_dag["dusk"])
        dawn = _thattid(a_morgun.isoformat(), a_morgun_gogn["dawn"])
        return {
            "myrkur_fra": dusk,
            "myrkur_til": dawn,
            "tungl_birta_pct": float(i_dag["moon_illumination"]),
        }
    except Exception as e:
        _warn(f"sunrisesunset.io ({lat},{lon})", e)
        return None


# ---------------------------------------------------------------------
# Veðurstofa Íslands - norðurljósa-XML (landsvísu virkni + myrkur, til
# samanburðar). Notað sem viðbótarupplýsing, ekki grunnur skorreiknings,
# því skýjahula á vef Veðurstofunnar er háð því að stöð sé nálægt hverjum
# stað - Open-Meteo er notað fyrir það í staðinn.
# ---------------------------------------------------------------------
def sott_vedurstofa_nordurljos():
    try:
        xml_texti = _get_text("https://xmlweather.vedur.is/aurora?op=xml&type=index")
        root = ET.fromstring(xml_texti)
        naetur = []
        for nd in root.findall("night_data"):
            naetur.append(
                {
                    "dags": nd.findtext("evening_date"),
                    "virkni_vedurstofa": nd.findtext("activity_forecast"),
                }
            )
        return naetur
    except Exception as e:
        _warn("Veðurstofa Íslands", e)
        return None
