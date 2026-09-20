"""Asynchronous Cloudflare-specific source adapters; preserve old data on failures."""
import json
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlencode
from workers import fetch
from locations import STADIR

KP_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json'
OVATION_URL = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json'
MAG_URL = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json'
WIND_URL = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json'

KEYS = {'kp': 'noaa:kp:forecast', 'ovation': 'noaa:ovation:locations',
        'solar': 'noaa:solarwind', 'cloud': 'met:cloud:locations',
        'sunmoon': 'sunmoon:locations'}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def get_json(url, headers=None):
    response = await fetch(url, headers=headers or {})
    if not response.ok:
        raise ValueError(f'Upstream HTTP {response.status}: {url.split("?")[0]}')
    return await response.json()


async def read_store(env, name):
    raw = await env.NORTHSEEK_CACHE.get(KEYS[name])
    return json.loads(raw) if raw else None


async def write_store(env, name, payload):
    await env.NORTHSEEK_CACHE.put(KEYS[name], json.dumps(payload, ensure_ascii=False))


async def update_kp(env):
    rows = await get_json(KP_URL)
    if not isinstance(rows, list) or not rows:
        raise ValueError('Empty NOAA Kp forecast')
    await write_store(env, 'kp', {'source': 'NOAA SWPC', 'updated_at': now_iso(), 'forecast': rows})


def ovation_points(data):
    coordinates = data.get('coordinates')
    if not isinstance(coordinates, list) or not coordinates:
        raise ValueError('Empty NOAA OVATION coordinates')
    grid = {(int(lon) % 360, int(lat)): value for lon, lat, value in coordinates}
    result = []
    for place in STADIR:
        key = (round(place['lon'] % 360) % 360, round(place['lat']))
        value = grid.get(key)
        if value is None:
            # For a rare missing grid point, use the precise old nearest-point logic.
            from scoring import ovation_virkni
            value = ovation_virkni(place['lat'], place['lon'], data)
        result.append({'id': place['id'], 'nafn': place['nafn'], 'lat': place['lat'],
                       'lon': place['lon'], 'virkni_ovation': value})
    return result


async def update_ovation(env):
    data = await get_json(OVATION_URL)
    result = ovation_points(data)
    await write_store(env, 'ovation', {
        'source': 'NOAA SWPC OVATION', 'updated_at': now_iso(),
        'forecast_time': data.get('Forecast Time'),
        'observation_time': data.get('Observation Time'), 'stadir': result})


def latest_active(rows):
    if not isinstance(rows, list) or not rows:
        return None
    return next((row for row in reversed(rows) if row.get('active')), rows[-1])


async def update_solar(env):
    # Keep the latest successful component when the other source is unavailable.
    old = await read_store(env, 'solar') or {}
    parts = {'mag': old.get('mag'), 'wind': old.get('wind')}
    successes = 0
    for part, url in [('mag', MAG_URL), ('wind', WIND_URL)]:
        try:
            new = latest_active(await get_json(url))
            if new:
                parts[part] = new
                successes += 1
        except Exception as exc:
            print(f'Solar {part}: {exc}')
    if successes:
        await write_store(env, 'solar', {'updated_at': now_iso(), **parts})
    else:
        raise ValueError('Both solar-wind feeds failed')


def cloud_points(data):
    output = {}
    for point in data['properties']['timeseries']:
        d = point['data']['instant']['details']
        output[point['time']] = {
            'heild': d.get('cloud_area_fraction'),
            'lagt': d.get('cloud_area_fraction_low'),
            'midlungs': d.get('cloud_area_fraction_medium'),
            'hatt': d.get('cloud_area_fraction_high'),
            'uv_heidskirt': d.get('ultraviolet_index_clear_sky'),
            'hiti': d.get('air_temperature'),
            'hiti_finnst': d.get('apparent_air_temperature'),
            'vindur': d.get('wind_speed')}
    if not output:
        raise ValueError('Empty MET forecast')
    return output


async def update_cloud(env, user_agent, batch):
    if not user_agent or 'example' in user_agent.lower():
        raise ValueError('Set real MET_USER_AGENT in Worker settings')
    old = await read_store(env, 'cloud') or {'stadir': {}}
    locations = dict(old.get('stadir') or {})
    # Six or seven requests per run; each place refreshed once per hour.
    selection = STADIR[batch::6]
    successes = 0
    for place in selection:
        url = 'https://api.met.no/weatherapi/locationforecast/2.0/complete?' + urlencode(
            {'lat': place['lat'], 'lon': place['lon']})
        try:
            data = await get_json(url, {'User-Agent': user_agent})
            locations[place['id']] = cloud_points(data)
            successes += 1
        except Exception as exc:
            print(f'MET {place["id"]}: {exc}')
    if successes:
        await write_store(env, 'cloud', {'updated_at': now_iso(), 'stadir': locations})
    else:
        raise ValueError('No MET locations updated; check MET_USER_AGENT or quotas')


def time_iso(day, value):
    if not value:
        return None
    # Existing backend uses 12-hour formatted times returned by sunrisesunset.io.
    parsed = datetime.strptime(f'{day} {value}', '%Y-%m-%d %I:%M:%S %p')
    return parsed.replace(tzinfo=timezone.utc).isoformat()


def sunmoon_days(data):
    rows = data.get('results')
    if not isinstance(rows, list) or len(rows) < 4:
        raise ValueError('Expected 4 sun/moon days from date-range request')
    out = []
    for r in rows[:4]:
        day = r['date']
        out.append({
            'dags': day, 'solsetur': time_iso(day, r.get('sunset')),
            'solarupprás': time_iso(day, r.get('sunrise')),
            'dusk': time_iso(day, r.get('dusk')),
            'dawn': time_iso(day, r.get('dawn')),
            'tungl_birta_pct': float(r['moon_illumination']),
            'tungl_fasi_heiti': r.get('moon_phase'),
            'tungl_upp': time_iso(day, r.get('moonrise')),
            'tungl_nidur': time_iso(day, r.get('moonset')),
            'tungl_alltaf_uppi': bool(r.get('moon_always_up')),
            'tungl_alltaf_nidri': bool(r.get('moon_always_down'))})
    return out


async def update_sunmoon(env, batch):
    old = await read_store(env, 'sunmoon') or {'stadir': {}}
    locations = dict(old.get('stadir') or {})
    today = datetime.now(timezone.utc).date()
    day0, day3 = today.isoformat(), (today + timedelta(days=3)).isoformat()
    successes = 0
    # 9 or 10 places/hour, all 37 refreshed every four hours.
    for place in STADIR[batch::4]:
        url = 'https://api.sunrisesunset.io/json?' + urlencode({
            'lat': place['lat'], 'lng': place['lon'], 'timezone': 'UTC',
            'date_start': day0, 'date_end': day3})
        try:
            locations[place['id']] = sunmoon_days(await get_json(url))
            successes += 1
        except Exception as exc:
            print(f'Sunmoon {place["id"]}: {exc}')
    if successes:
        await write_store(env, 'sunmoon', {'updated_at': now_iso(), 'stadir': locations})
    else:
        raise ValueError('No sun/moon locations updated')
