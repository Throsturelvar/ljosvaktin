"""Reiknar norðurljósaskor (0-100) fyrir einn stað út frá gögnum sem
sources.py hefur sótt. Vægi fyrir í kvöld (staðbundin OVATION-mæling til):
virkni 35%, Kp-leitni 10%, heiðskírt 40%, tunglbirta 15%. Fyrir síðari
nætur er engin staðbundin virknimæling til (OVATION er bara núgildisspá)
- þá fellur virknivægið (45% samtals) alfarið á Kp-spána, sem er ein tala
fyrir allt landið, ekki staðbundin. Skýjahula vegur þyngst því norðurljós
sjást einfaldlega ekki gegnum ský, óháð virkni."""

from datetime import datetime, timezone


def ovation_virkni(lat, lon, ovation_data):
    if not ovation_data:
        return None
    lon_0_360 = lon % 360
    lat_r = round(lat)
    lon_r = round(lon_0_360)
    besta = None
    for lo, la, v in ovation_data["coordinates"]:
        if la == lat_r and lo == lon_r:
            return v
        d = abs(la - lat) + min(abs(lo - lon_0_360), 360 - abs(lo - lon_0_360))
        if besta is None or d < besta[0]:
            besta = (d, v)
    return besta[1] if besta else None


def kp_leitni(kp_spa, myrkur_fra, myrkur_til):
    if not kp_spa or not myrkur_fra or not myrkur_til:
        return None
    gildi = []
    for row in kp_spa:
        if row.get("observed") not in ("predicted", "estimated"):
            continue
        try:
            t = datetime.fromisoformat(row["time_tag"]).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if myrkur_fra <= t <= myrkur_til:
            gildi.append(float(row["kp"]))
    return sum(gildi) / len(gildi) if gildi else None


def medal_skyjahula(skyjahula, myrkur_fra, myrkur_til):
    if not skyjahula or not myrkur_fra or not myrkur_til:
        return None
    gildi = [pct for t, pct in skyjahula.items() if myrkur_fra <= t <= myrkur_til]
    return sum(gildi) / len(gildi) if gildi else None


def reikna_skor(virkni, kp, sky_pct, tungl_pct, myrkur_fra, myrkur_til):
    if myrkur_fra is None or myrkur_til is None or myrkur_til <= myrkur_fra:
        return {"skor": 0.0, "ástæða": "ekkert marktækt myrkur á tímabilinu"}

    heidskirt_stig = 100 - (sky_pct if sky_pct is not None else 50)
    tungl_stig = 100 - (tungl_pct if tungl_pct is not None else 30)
    kp_stig = min((kp or 0) / 9.0, 1.0) * 100 if kp is not None else 50.0

    if virkni is not None:
        virkni_stig = min(virkni / 14.0, 1.0) * 100
        skor = 0.35 * virkni_stig + 0.10 * kp_stig + 0.40 * heidskirt_stig + 0.15 * tungl_stig
        nakvaemni = "mæling"
    else:
        virkni_stig = None
        skor = 0.45 * kp_stig + 0.40 * heidskirt_stig + 0.15 * tungl_stig
        nakvaemni = "spá"

    return {
        "skor": round(max(0.0, min(100.0, skor)), 1),
        "nakvaemni": nakvaemni,
        "sundurlidun": {
            "virkni_stig": round(virkni_stig, 1) if virkni_stig is not None else None,
            "kp_stig": round(kp_stig, 1),
            "heidskirt_stig": round(heidskirt_stig, 1),
            "tungl_stig": round(tungl_stig, 1),
        },
    }
