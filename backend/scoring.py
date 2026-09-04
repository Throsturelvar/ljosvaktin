"""Reiknar norðurljósaskor (0-100) fyrir einn stað út frá gögnum sem
sources.py hefur sótt. Vægi fyrir í kvöld (staðbundin OVATION-mæling til):
virkni 35%, Kp-leitni 10%, heiðskírt 40%, tunglbirta 15%. Fyrir síðari
nætur er engin staðbundin virknimæling til (OVATION er bara núgildisspá)
- þá fellur virknivægið (45% samtals) alfarið á Kp-spána, sem er ein tala
fyrir allt landið, ekki staðbundin. Skýjahula vegur þyngst því norðurljós
sjást einfaldlega ekki gegnum ský, óháð virkni."""

from datetime import datetime, timedelta, timezone


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
    """Meðal heildarskýjahula (%) innan myrkurgluggans - notað til
    BIRTINGAR ('Skýjahula 62%'), ekki í skorreikninginn sjálfan."""
    if not skyjahula or not myrkur_fra or not myrkur_til:
        return None
    gildi = [
        p["heild"] for t, p in skyjahula.items()
        if myrkur_fra <= t <= myrkur_til and p.get("heild") is not None
    ]
    return sum(gildi) / len(gildi) if gildi else None


def medal_skyjaopacitet(skyjahula, myrkur_fra, myrkur_til):
    """Vegið meðaltal skýjaþéttleika innan myrkurgluggans, notað í sjálfan
    skorreikninginn. Lágský vega þyngst (60%), miðlungsský næst (30%) og
    háský minnst (10%) - þunn háský hindra norðurljós miklu minna en þétt
    lágský, svo flatt heildarhulu-meðaltal ofmetur áhrif háskýja."""
    if not skyjahula or not myrkur_fra or not myrkur_til:
        return None
    gildi = []
    for t, p in skyjahula.items():
        if not (myrkur_fra <= t <= myrkur_til):
            continue
        lagt, midlungs, hatt = p.get("lagt"), p.get("midlungs"), p.get("hatt")
        if lagt is None and midlungs is None and hatt is None:
            if p.get("heild") is not None:
                gildi.append(p["heild"])
            continue
        opacitet = 0.60 * (lagt or 0) + 0.30 * (midlungs or 0) + 0.10 * (hatt or 0)
        gildi.append(min(opacitet, 100))
    return sum(gildi) / len(gildi) if gildi else None


def haestu_uv_dagsins(skyjahula, dags):
    """Hæsta UV-gildi dagsins (ekki myrkurgluggans), leiðrétt gróflega
    fyrir raunverulega skýjahulu (UV-gildið frá MET er miðað við heiðskírt)."""
    if not skyjahula or not dags:
        return None
    upphaf = datetime.combine(dags, datetime.min.time(), tzinfo=timezone.utc)
    lok = upphaf + timedelta(days=1)
    gildi = []
    for t, p in skyjahula.items():
        if not (upphaf <= t < lok) or p.get("uv_heidskirt") is None:
            continue
        heild = p.get("heild")
        leidrett = p["uv_heidskirt"] * (1 - (heild if heild is not None else 50) / 100)
        gildi.append(leidrett)
    return round(max(gildi), 1) if gildi else None


def _tungl_bil_fyrir_dag(dagsfaersla):
    """Skilar lista af (upphaf, endir) tímabilum sem tunglið er yfir
    sjóndeildarhring innan almanaksdagsins sem dagsfaersla lýsir. Höndlar
    daga þar sem tunglið sest fyrir uppkomu (uppi um miðnætti) og daga þar
    sem annaðhvort uppkoma eða setur fellur ekki á daginn sjálfan."""
    dags_upphaf = datetime.combine(dagsfaersla["dags"], datetime.min.time(), tzinfo=timezone.utc)
    dags_lok = dags_upphaf + timedelta(days=1)
    r = dagsfaersla["tungl_upp"]
    s = dagsfaersla["tungl_nidur"]

    if dagsfaersla["tungl_alltaf_uppi"]:
        return [(dags_upphaf, dags_lok)]
    if dagsfaersla["tungl_alltaf_nidri"]:
        return []
    if r and s:
        return [(r, s)] if r <= s else [(dags_upphaf, s), (r, dags_lok)]
    if r and not s:
        return [(r, dags_lok)]
    if s and not r:
        return [(dags_upphaf, s)]
    return []


def tungl_uppi_hlutfall(dagar_gogn, dagur, myrkur_fra, myrkur_til):
    """Hlutfall (0-1) af myrkurglugganum sem tunglið er yfir sjóndeildar-
    hring. Notað til að refsa aðeins fyrir tunglbirtu þann tíma sem
    tunglið er raunverulega uppi - ekki allan gluggann óháð því."""
    if not dagar_gogn or not myrkur_fra or not myrkur_til or myrkur_til <= myrkur_fra:
        return None

    bil = []
    for i in (dagur, dagur + 1):
        if i < len(dagar_gogn):
            bil.extend(_tungl_bil_fyrir_dag(dagar_gogn[i]))

    heild_sek = 0.0
    for upphaf, endir in bil:
        skorun_upphaf = max(upphaf, myrkur_fra)
        skorun_endir = min(endir, myrkur_til)
        if skorun_endir > skorun_upphaf:
            heild_sek += (skorun_endir - skorun_upphaf).total_seconds()

    lengd_sek = (myrkur_til - myrkur_fra).total_seconds()
    return min(1.0, heild_sek / lengd_sek) if lengd_sek > 0 else None


def hiti_vid_myrkur(skyjahula, myrkur_fra):
    """Hitastig og 'finnst eins og' á þeim tímapunkti sem næst kemur upphafi
    myrkurgluggans (dusk) - eingöngu til upplýsinga, hefur ekki áhrif á
    skorið sjálft."""
    if not skyjahula or not myrkur_fra:
        return None, None
    naestur = min(skyjahula.items(), key=lambda kv: abs((kv[0] - myrkur_fra).total_seconds()))
    p = naestur[1]
    return p.get("hiti"), p.get("hiti_finnst")


def naestigildi(skyjahula, timi):
    """Næsta klukkustundargildi (heild/hiti/vindur o.fl.) við tiltekinn
    tímapunkt - almennt uppflettifall fyrir vaktarskjáinn."""
    if not skyjahula or not timi:
        return {}
    naestur = min(skyjahula.items(), key=lambda kv: abs((kv[0] - timi).total_seconds()))
    return naestur[1]


def naeturklukkustundir(fra, til):
    """Listi af heilum klukkustundum (dagsetningar-hlutir) frá og með
    fyrstu heilu stund eftir 'fra' til og með síðustu heilu stund fyrir
    eða á 'til'."""
    if not fra or not til or til <= fra:
        return []
    fyrsta = fra.replace(minute=0, second=0, microsecond=0)
    if fyrsta < fra:
        fyrsta += timedelta(hours=1)
    ut = []
    t = fyrsta
    while t <= til:
        ut.append(t)
        t += timedelta(hours=1)
    return ut


def kp_a_klukkustund(kp_spa, klst_timar):
    """Kp-spá NOAA er á 3ja klst upplausn - línuleg brúun gefur eina tölu
    fyrir hverja klukkustund í klst_timar."""
    if not klst_timar:
        return []
    if not kp_spa:
        return [None] * len(klst_timar)

    punktar = []
    for row in kp_spa:
        try:
            t = datetime.fromisoformat(row["time_tag"]).replace(tzinfo=timezone.utc)
            punktar.append((t, float(row["kp"])))
        except (ValueError, KeyError, TypeError):
            continue
    punktar.sort(key=lambda p: p[0])
    if not punktar:
        return [None] * len(klst_timar)

    ut = []
    for klst in klst_timar:
        if klst <= punktar[0][0]:
            ut.append(round(punktar[0][1], 2))
            continue
        if klst >= punktar[-1][0]:
            ut.append(round(punktar[-1][1], 2))
            continue
        for i in range(len(punktar) - 1):
            t0, v0 = punktar[i]
            t1, v1 = punktar[i + 1]
            if t0 <= klst <= t1:
                hlutfall = (klst - t0).total_seconds() / (t1 - t0).total_seconds()
                ut.append(round(v0 + (v1 - v0) * hlutfall, 2))
                break
    return ut


def sky_a_klukkustund(skyjahula, klst_timar):
    """Heildarskýjahula (%) fyrir hverja klukkustund - notað í súlurit."""
    return [
        (round(p["heild"]) if p.get("heild") is not None else None)
        for p in (naestigildi(skyjahula, klst) for klst in klst_timar)
    ]


TUNGLFASA_HEITI = {
    "New Moon": "Nýtt tungl",
    "Waxing Crescent": "Vaxandi mánasigð",
    "First Quarter": "Fyrsta kvartil",
    "Waxing Gibbous": "Vaxandi tungl",
    "Full Moon": "Fullt tungl",
    "Waning Gibbous": "Dvínandi tungl",
    "Last Quarter": "Síðasta kvartil",
    "Waning Crescent": "Dvínandi mánasigð",
}


def solvindur_tulkun(bz, hradi):
    """Einföld, mannlesanleg túlkun á núverandi sólvindsaðstæðum - eingöngu
    til upplýsinga (OVATION er þegar reiknað út frá þessum sömu gögnum,
    svo þetta breytir ekki skorinu)."""
    if bz is None:
        return "Gögn um sólvind ekki tiltæk í augnablikinu."

    if bz <= -10:
        domur = "mjög hagstætt fyrir norðurljós núna"
    elif bz <= -5:
        domur = "hagstætt fyrir norðurljós núna"
    elif bz < 0:
        domur = "hlutlaust til hagstætt núna"
    elif bz < 5:
        domur = "hlutlaust núna"
    else:
        domur = "óhagstætt fyrir norðurljós núna"

    setning = f"Bz-gildið er {bz:.1f} nT — {domur}."
    if hradi is not None:
        if hradi >= 500:
            setning += " Sólvindshraði er hár, sem magnar áhrifin."
        elif hradi < 350:
            setning += " Sólvindshraði er lágur."
    return setning


def reikna_skor(virkni, kp, sky_opacitet, tungl_pct, tungl_uppi, myrkur_fra, myrkur_til):
    if myrkur_fra is None or myrkur_til is None or myrkur_til <= myrkur_fra:
        return {"skor": 0.0, "ástæða": "ekkert marktækt myrkur á tímabilinu"}

    heidskirt_stig = 100 - (sky_opacitet if sky_opacitet is not None else 50)
    tungl_birta = tungl_pct if tungl_pct is not None else 30
    tungl_upp_hlutf = tungl_uppi if tungl_uppi is not None else 1.0
    tungl_stig = 100 - (tungl_birta * tungl_upp_hlutf)
    kp_stig = min((kp or 0) / 9.0, 1.0) * 100 if kp is not None else 50.0

    if virkni is not None:
        # virkni er nú þegar prósentulíkur (0-100) á sýnilegum norðurljósum
        # skv. NOAA - ekki tala á 0-14 kvarða eins og upprunalega skráin gerði ráð fyrir.
        virkni_stig = min(max(virkni, 0.0), 100.0)
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
