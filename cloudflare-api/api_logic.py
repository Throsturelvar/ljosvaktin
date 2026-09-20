"""Preserve original backend/server.py API shapes and scoring semantics."""
from datetime import date, datetime, timezone
import scoring
from locations import STADIR


def dt(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00')) if value else None


def load_days(payload):
    if not payload:
        return None
    result = []
    fields = ('solsetur', 'solarupprás', 'dusk', 'dawn', 'tungl_upp', 'tungl_nidur')
    for entry in payload:
        day = dict(entry)
        day['dags'] = date.fromisoformat(day['dags'])
        for field in fields:
            day[field] = dt(day.get(field))
        result.append(day)
    return result


def load_cloud(payload):
    return {dt(t): value for t, value in (payload or {}).items()}


def is_ready(kp, clouds, sunmoon):
    today = datetime.now(timezone.utc).date().isoformat()
    if not kp or not kp.get('forecast'):
        return False
    for place in STADIR:
        pid = place['id']
        days = (sunmoon or {}).get('stadir', {}).get(pid)
        cloud = (clouds or {}).get('stadir', {}).get(pid)
        if not days or len(days) < 4 or days[0].get('dags') != today or not cloud:
            return False
    return True


def vakt(dagur, kp, clouds, sunmoon, solar):
    ref = STADIR[0]['id']
    days = load_days(sunmoon['stadir'][ref])
    tonight, tomorrow = days[dagur], days[dagur + 1]
    sunset, sunrise = tonight['solsetur'], tomorrow['solarupprás']
    dusk, dawn = tonight['dusk'], tomorrow['dawn']
    hours = scoring.naeturklukkustundir(sunset, sunrise)
    if not hours or not dusk or not dawn:
        return None
    moon_rise = tonight['tungl_upp'] or tomorrow['tungl_upp']
    output = []
    for place in STADIR:
        cloud = load_cloud(clouds['stadir'][place['id']])
        at_dusk = scoring.naestigildi(cloud, dusk)
        output.append({
            'id': place['id'], 'nafn': place['nafn'], 'hluti': place['hluti'],
            'lat': place['lat'], 'lon': place['lon'],
            'sky': scoring.sky_a_klukkustund(cloud, hours),
            'hiti': round(at_dusk['hiti']) if at_dusk.get('hiti') is not None else None,
            'vindur': round(at_dusk['vindur'], 1) if at_dusk.get('vindur') is not None else None})
    mag, plasma = (solar or {}).get('mag'), (solar or {}).get('wind')
    bz = mag.get('bz_gsm') if mag else None
    bt = mag.get('bt') if mag else None
    speed = plasma.get('proton_speed') if plasma else None
    density = plasma.get('proton_density') if plasma else None
    measured = None
    if mag and mag.get('time_tag'):
        try:
            measured = dt(mag['time_tag']).strftime('%H:%M')
        except (ValueError, TypeError):
            pass
    return {
        'nott': {'solsetur': sunset.strftime('%H:%M'), 'solarupprás': sunrise.strftime('%H:%M'),
                 'myrkurFra': dusk.strftime('%H:%M'), 'myrkurTil': dawn.strftime('%H:%M'),
                 'klst': [t.hour for t in hours]},
        'kpSpa': scoring.kp_a_klukkustund(kp['forecast'], hours),
        'tungl': {'fasi': round(tonight['tungl_birta_pct']/100, 3),
                  'upprás': moon_rise.strftime('%H:%M') if moon_rise else None,
                  'heiti': scoring.TUNGLFASA_HEITI.get(tonight['tungl_fasi_heiti'],
                                                       tonight['tungl_fasi_heiti'])},
        'stadir': output,
        'geimvedur': {'bz': round(bz, 1) if bz is not None else None,
                     'bt': round(bt, 1) if bt is not None else None,
                     'hradi': round(speed) if speed is not None else None,
                     'thettleiki': round(density, 1) if density is not None else None,
                     'tulkun': scoring.solvindur_tulkun(bz, speed), 'maelt': measured}}


def skor(dagur, kp, clouds, sunmoon, ovation):
    ovation_index = {x['id']: x['virkni_ovation'] for x in (ovation or {}).get('stadir', [])}
    results = []
    for place in STADIR:
        pid = place['id']
        days = load_days(sunmoon['stadir'][pid])
        cloud = load_cloud(clouds['stadir'][pid])
        night = {'dags': days[dagur]['dags'],
                 'myrkur_fra': days[dagur]['dusk'],
                 'myrkur_til': days[dagur + 1]['dawn'],
                 'tungl_birta_pct': days[dagur]['tungl_birta_pct']}
        dusk, dawn = night['myrkur_fra'], night['myrkur_til']
        illumination = night['tungl_birta_pct']
        activity = ovation_index.get(pid) if dagur == 0 else None
        trend = scoring.kp_leitni(kp['forecast'], dusk, dawn)
        coverage = scoring.medal_skyjahula(cloud, dusk, dawn)
        opacity = scoring.medal_skyjaopacitet(cloud, dusk, dawn)
        moon_up = scoring.tungl_uppi_hlutfall(days, dagur, dusk, dawn)
        uv = scoring.haestu_uv_dagsins(cloud, night['dags'])
        temp, feels = scoring.hiti_vid_myrkur(cloud, dusk)
        result = scoring.reikna_skor(activity, trend, opacity, illumination,
                                     moon_up, dusk, dawn)
        results.append({
            'id': pid, 'nafn': place['nafn'], 'lat': place['lat'], 'lon': place['lon'],
            'dagur': dagur, 'dags': night['dags'].isoformat(),
            'skor': result['skor'], 'nakvaemni': result.get('nakvaemni'),
            'sundurlidun': result.get('sundurlidun'), 'ástæða': result.get('ástæða'),
            'hra_gogn': {'virkni_ovation': activity, 'kp_leitni': trend,
                         'sky_hlutfall': coverage, 'tungl_birta_pct': illumination,
                         'tungl_uppi_hlutfall': moon_up, 'uv_haest_i_dag': uv,
                         'hiti': temp, 'hiti_finnst': feels,
                         'myrkur_fra': dusk.isoformat() if dusk else None,
                         'myrkur_til': dawn.isoformat() if dawn else None}})
    return sorted(results, key=lambda x: x['skor'], reverse=True)
