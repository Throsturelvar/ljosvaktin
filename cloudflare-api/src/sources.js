// Sækir gögn frá upprunum og vistar í KV; eldri gögn haldast ef sókn bregst.
// Bein þýðing á sources_worker.py.

import { STADIR } from "./locations.js";
import { ovationVirkni } from "./scoring.js";
import { pyRound, pyIso, utcDateString } from "./pyutil.js";

const KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json";
const OVATION_URL = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";
const MAG_URL = "https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json";
const WIND_URL = "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json";

export const KEYS = {
  kp: "noaa:kp:forecast",
  ovation: "noaa:ovation:locations",
  solar: "noaa:solarwind",
  cloud: "met:cloud:locations",
  sunmoon: "sunmoon:locations",
};

const nowIso = () => pyIso(Date.now());

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Upstream HTTP ${response.status}: ${url.split("?")[0]}`);
  return response.json();
}

export async function readStore(env, name) {
  return env.NORTHSEEK_CACHE.get(KEYS[name], "json");
}

async function writeStore(env, name, payload) {
  await env.NORTHSEEK_CACHE.put(KEYS[name], JSON.stringify(payload));
}

export async function updateKp(env) {
  const rows = await getJson(KP_URL);
  if (!Array.isArray(rows) || !rows.length) throw new Error("Empty NOAA Kp forecast");
  await writeStore(env, "kp", { source: "NOAA SWPC", updated_at: nowIso(), forecast: rows });
}

function ovationPoints(data) {
  const coordinates = data.coordinates;
  if (!Array.isArray(coordinates) || !coordinates.length) throw new Error("Empty NOAA OVATION coordinates");
  const grid = new Map();
  for (const [lon, lat, value] of coordinates) {
    grid.set(`${((Math.trunc(lon) % 360) + 360) % 360},${Math.trunc(lat)}`, value);
  }
  return STADIR.map((place) => {
    const key = `${pyRound(((place.lon % 360) + 360) % 360) % 360},${pyRound(place.lat)}`;
    let value = grid.get(key);
    if (value === undefined || value === null) value = ovationVirkni(place.lat, place.lon, data);
    return { id: place.id, nafn: place.nafn, lat: place.lat, lon: place.lon, virkni_ovation: value };
  });
}

export async function updateOvation(env) {
  const data = await getJson(OVATION_URL);
  await writeStore(env, "ovation", {
    source: "NOAA SWPC OVATION",
    updated_at: nowIso(),
    forecast_time: data["Forecast Time"] ?? null,
    observation_time: data["Observation Time"] ?? null,
    stadir: ovationPoints(data),
  });
}

// NOAA raðar nýjustu mælingu fremst. Python-útgáfan leitaði aftan frá og tók
// því sólarhrings gamla mælingu; hér er valin nýjasta mælingin óháð röð.
function latestActive(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const newest = (list) =>
    list.reduce((best, row) => (!best || String(row.time_tag) > String(best.time_tag) ? row : best), null);
  return newest(rows.filter((row) => row && row.active)) || newest(rows);
}

export async function updateSolar(env) {
  const old = (await readStore(env, "solar")) || {};
  const parts = { mag: old.mag ?? null, wind: old.wind ?? null };
  let successes = 0;
  for (const [part, url] of [["mag", MAG_URL], ["wind", WIND_URL]]) {
    try {
      const latest = latestActive(await getJson(url));
      if (latest) {
        parts[part] = latest;
        successes += 1;
      }
    } catch (exc) {
      console.log(`Solar ${part}: ${exc}`);
    }
  }
  if (!successes) throw new Error("Both solar-wind feeds failed");
  await writeStore(env, "solar", { updated_at: nowIso(), ...parts });
}

function cloudPoints(data) {
  const output = {};
  for (const point of data.properties.timeseries) {
    const d = point.data.instant.details;
    output[point.time] = {
      heild: d.cloud_area_fraction ?? null,
      lagt: d.cloud_area_fraction_low ?? null,
      midlungs: d.cloud_area_fraction_medium ?? null,
      hatt: d.cloud_area_fraction_high ?? null,
      uv_heidskirt: d.ultraviolet_index_clear_sky ?? null,
      hiti: d.air_temperature ?? null,
      hiti_finnst: d.apparent_air_temperature ?? null,
      vindur: d.wind_speed ?? null,
    };
  }
  if (!Object.keys(output).length) throw new Error("Empty MET forecast");
  return output;
}

export async function updateCloud(env, userAgent, batch) {
  if (!userAgent || userAgent.toLowerCase().includes("example")) {
    throw new Error("Set real MET_USER_AGENT in Worker settings");
  }
  const old = (await readStore(env, "cloud")) || { stadir: {} };
  const locations = { ...(old.stadir || {}) };
  // Sex eða sjö staðir í hverri keyrslu; hver staður endurnýjaður einu sinni á klst.
  const selection = STADIR.filter((_, i) => i % 6 === batch);
  let successes = 0;
  for (const place of selection) {
    const url =
      "https://api.met.no/weatherapi/locationforecast/2.0/complete?" +
      new URLSearchParams({ lat: String(place.lat), lon: String(place.lon) });
    try {
      locations[place.id] = cloudPoints(await getJson(url, { "User-Agent": userAgent }));
      successes += 1;
    } catch (exc) {
      console.log(`MET ${place.id}: ${exc}`);
    }
  }
  if (!successes) throw new Error("No MET locations updated; check MET_USER_AGENT or quotas");
  await writeStore(env, "cloud", { updated_at: nowIso(), stadir: locations });
}

// sunrisesunset.io skilar 12 klst. tímum, t.d. "7:13:05 PM".
function timeIso(day, value) {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2}):(\d{2})\s*([AP]M)$/i.exec(String(value).trim());
  if (!m) throw new Error(`Unexpected time "${value}"`);
  let h = Number(m[1]) % 12;
  if (m[4].toUpperCase() === "PM") h += 12;
  const ms = Date.parse(`${day}T${String(h).padStart(2, "0")}:${m[2]}:${m[3]}Z`);
  if (Number.isNaN(ms)) throw new Error(`Unexpected time "${value}"`);
  return pyIso(ms);
}

// Fimm dagar (ekki fjórir) svo nóttin eftir tvo daga er enn til staðar eftir
// miðnætti, áður en staðurinn hefur verið endurnýjaður.
const SUNMOON_DAYS = 5;

function sunmoonDays(data) {
  const rows = data.results;
  if (!Array.isArray(rows) || rows.length < SUNMOON_DAYS) {
    throw new Error(`Expected ${SUNMOON_DAYS} sun/moon days from date-range request`);
  }
  return rows.slice(0, SUNMOON_DAYS).map((r) => {
    const day = r.date;
    const pct = Number(r.moon_illumination);
    if (Number.isNaN(pct)) throw new Error("Invalid moon_illumination");
    return {
      dags: day,
      solsetur: timeIso(day, r.sunset),
      "solarupprás": timeIso(day, r.sunrise),
      dusk: timeIso(day, r.dusk),
      dawn: timeIso(day, r.dawn),
      tungl_birta_pct: pct,
      tungl_fasi_heiti: r.moon_phase ?? null,
      tungl_upp: timeIso(day, r.moonrise),
      tungl_nidur: timeIso(day, r.moonset),
      tungl_alltaf_uppi: !!r.moon_always_up,
      tungl_alltaf_nidri: !!r.moon_always_down,
    };
  });
}

export async function updateSunmoon(env, batch) {
  const old = (await readStore(env, "sunmoon")) || { stadir: {} };
  const locations = { ...(old.stadir || {}) };
  const now = Date.now();
  const day0 = utcDateString(now);
  const dayEnd = utcDateString(now + (SUNMOON_DAYS - 1) * 86400000);

  // Staðir sem byrja ekki á deginum í dag ganga fyrir; annars venjulega hollið.
  const stale = STADIR.filter((p) => locations[p.id]?.[0]?.dags !== day0);
  const selection = stale.length ? stale.slice(0, 10) : STADIR.filter((_, i) => i % 4 === batch);

  let successes = 0;
  for (const place of selection) {
    const url =
      "https://api.sunrisesunset.io/json?" +
      new URLSearchParams({
        lat: String(place.lat),
        lng: String(place.lon),
        timezone: "UTC",
        date_start: day0,
        date_end: dayEnd,
      });
    try {
      locations[place.id] = sunmoonDays(await getJson(url));
      successes += 1;
    } catch (exc) {
      console.log(`Sunmoon ${place.id}: ${exc}`);
    }
  }
  if (!successes) throw new Error("No sun/moon locations updated");
  await writeStore(env, "sunmoon", { updated_at: nowIso(), stadir: locations });
}
