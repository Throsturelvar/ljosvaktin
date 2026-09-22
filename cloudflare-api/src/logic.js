// Sama API-snið og api_logic.py.
//
// Ein breyting frá Python-útgáfunni: sól-/tunglgögn eru lesin frá deginum í dag
// (UTC) í stað þess að krefjast þess að fyrsti dagur í KV sé dagurinn í dag.
// Áður skilaði API-ið 503 frá miðnætti til ~03:13 á hverri nóttu, á meðan
// sunmoon-cron var enn að endurnýja staðina í fjórum hollum.

import * as scoring from "./scoring.js";
import { STADIR } from "./locations.js";
import { dt, pyRound, pyIso, hhmm, utcDateString, naiveUtc } from "./pyutil.js";

const DAY_FIELDS = ["solsetur", "solarupprás", "dusk", "dawn", "tungl_upp", "tungl_nidur"];

function todayUtc() {
  return utcDateString(Date.now());
}

// Skilar dögunum frá og með deginum í dag, eða null ef dagurinn í dag vantar.
function daysFromToday(rawDays) {
  if (!Array.isArray(rawDays)) return null;
  const idx = rawDays.findIndex((d) => d && d.dags === todayUtc());
  return idx < 0 ? null : rawDays.slice(idx);
}

function loadDays(rawDays) {
  const days = daysFromToday(rawDays);
  if (!days) return null;
  return days.map((entry) => {
    const day = { ...entry };
    for (const f of DAY_FIELDS) day[f] = dt(day[f]);
    return day;
  });
}

function loadCloud(payload) {
  return Object.entries(payload || {}).map(([t, v]) => [dt(t), v]);
}

// Nóttin `dagur` þarf daginn sjálfan og morgundaginn á eftir.
function hasNight(rawDays, dagur) {
  const days = daysFromToday(rawDays);
  return !!days && days.length >= dagur + 2;
}

export function isReady(kp, clouds, sunmoon, dagur = 0) {
  if (!kp || !Array.isArray(kp.forecast) || !kp.forecast.length) return false;
  for (const place of STADIR) {
    const days = sunmoon?.stadir?.[place.id];
    const cloud = clouds?.stadir?.[place.id];
    if (!cloud || !Object.keys(cloud).length || !hasNight(days, dagur)) return false;
  }
  return true;
}

export function diagnosticStatus(kp, clouds, sunmoon) {
  const today = todayUtc();
  const cloudLocations = clouds?.stadir || {};
  const sunmoonLocations = sunmoon?.stadir || {};
  const missingCloud = [];
  const missingSunmoon = [];
  const invalidSunmoon = [];
  for (const place of STADIR) {
    if (!cloudLocations[place.id] || !Object.keys(cloudLocations[place.id]).length) {
      missingCloud.push({ id: place.id, nafn: place.nafn });
    }
    const days = sunmoonLocations[place.id];
    if (!days || !days.length) {
      missingSunmoon.push({ id: place.id, nafn: place.nafn, astaeda: "Engin sól-/tunglgögn" });
    } else if (!hasNight(days, 2)) {
      invalidSunmoon.push({
        id: place.id,
        nafn: place.nafn,
        dagar: days.length,
        fyrsti_dagur: days[0]?.dags ?? null,
        astaeda: "Vantar fjóra daga frá deginum í dag",
      });
    }
  }
  const total = STADIR.length;
  return {
    ok: true,
    service: "northseek-api",
    today_utc: today,
    ready: isReady(kp, clouds, sunmoon),
    kp_til: !!(kp && kp.forecast && kp.forecast.length),
    stadir_allir: total,
    cloud: {
      med_gogn: total - missingCloud.length,
      vantar_fjoldi: missingCloud.length,
      vantar: missingCloud,
      updated_at: clouds?.updated_at ?? null,
    },
    sunmoon: {
      med_rett_gogn: total - missingSunmoon.length - invalidSunmoon.length,
      vantar_fjoldi: missingSunmoon.length,
      vantar: missingSunmoon,
      orettir_dagar_fjoldi: invalidSunmoon.length,
      orettir_dagar: invalidSunmoon,
      updated_at: sunmoon?.updated_at ?? null,
    },
  };
}

export function vakt(dagur, kp, clouds, sunmoon, solar) {
  const ref = STADIR[0].id;
  const days = loadDays(sunmoon.stadir[ref]);
  const tonight = days[dagur];
  const tomorrow = days[dagur + 1];
  const sunset = tonight.solsetur;
  const sunrise = tomorrow["solarupprás"];
  const dusk = tonight.dusk;
  const dawn = tomorrow.dawn;
  const hours = scoring.naeturklukkustundir(sunset, sunrise);
  if (!hours.length || !dusk || !dawn) return null;
  const moonRise = tonight.tungl_upp || tomorrow.tungl_upp;

  const output = STADIR.map((place) => {
    const cloud = loadCloud(clouds.stadir[place.id]);
    const atDusk = scoring.naestigildi(cloud, dusk);
    return {
      id: place.id,
      nafn: place.nafn,
      hluti: place.hluti,
      lat: place.lat,
      lon: place.lon,
      sky: scoring.skyAKlukkustund(cloud, hours),
      hiti: atDusk.hiti !== null && atDusk.hiti !== undefined ? pyRound(atDusk.hiti) : null,
      vindur: atDusk.vindur !== null && atDusk.vindur !== undefined ? pyRound(atDusk.vindur, 1) : null,
    };
  });

  const mag = solar?.mag || null;
  const plasma = solar?.wind || null;
  const bz = mag ? mag.bz_gsm ?? null : null;
  const bt = mag ? mag.bt ?? null : null;
  const speed = plasma ? plasma.proton_speed ?? null : null;
  const density = plasma ? plasma.proton_density ?? null : null;
  let measured = null;
  if (mag && mag.time_tag) {
    const t = naiveUtc(mag.time_tag);
    if (t !== null) measured = hhmm(t);
  }

  return {
    nott: {
      solsetur: hhmm(sunset),
      "solarupprás": hhmm(sunrise),
      myrkurFra: hhmm(dusk),
      myrkurTil: hhmm(dawn),
      klst: hours.map((t) => new Date(t).getUTCHours()),
    },
    kpSpa: scoring.kpAKlukkustund(kp.forecast, hours),
    tungl: {
      fasi: pyRound(tonight.tungl_birta_pct / 100, 3),
      "upprás": moonRise ? hhmm(moonRise) : null,
      heiti: scoring.TUNGLFASA_HEITI[tonight.tungl_fasi_heiti] ?? tonight.tungl_fasi_heiti,
    },
    stadir: output,
    geimvedur: {
      bz: bz !== null ? pyRound(bz, 1) : null,
      bt: bt !== null ? pyRound(bt, 1) : null,
      hradi: speed !== null ? pyRound(speed) : null,
      thettleiki: density !== null ? pyRound(density, 1) : null,
      tulkun: scoring.solvindurTulkun(bz, speed),
      maelt: measured,
    },
  };
}

export function skor(dagur, kp, clouds, sunmoon, ovation) {
  const ovationIndex = {};
  for (const x of ovation?.stadir || []) ovationIndex[x.id] = x.virkni_ovation;

  const results = STADIR.map((place) => {
    const pid = place.id;
    const days = loadDays(sunmoon.stadir[pid]);
    const cloud = loadCloud(clouds.stadir[pid]);
    const dags = days[dagur].dags;
    const dusk = days[dagur].dusk;
    const dawn = days[dagur + 1].dawn;
    const illumination = days[dagur].tungl_birta_pct;
    const activity = dagur === 0 ? ovationIndex[pid] ?? null : null;
    const trend = scoring.kpLeitni(kp.forecast, dusk, dawn);
    const coverage = scoring.medalSkyjahula(cloud, dusk, dawn);
    const opacity = scoring.medalSkyjaopacitet(cloud, dusk, dawn);
    const moonUp = scoring.tunglUppiHlutfall(days, dagur, dusk, dawn);
    const uv = scoring.haestuUvDagsins(cloud, dags);
    const [temp, feels] = scoring.hitiVidMyrkur(cloud, dusk);
    const result = scoring.reiknaSkor(activity, trend, opacity, illumination ?? null, moonUp, dusk, dawn);
    return {
      id: pid,
      nafn: place.nafn,
      lat: place.lat,
      lon: place.lon,
      dagur,
      dags,
      skor: result.skor,
      nakvaemni: result.nakvaemni ?? null,
      sundurlidun: result.sundurlidun ?? null,
      "ástæða": result["ástæða"] ?? null,
      hra_gogn: {
        virkni_ovation: activity,
        kp_leitni: trend,
        sky_hlutfall: coverage,
        tungl_birta_pct: illumination,
        tungl_uppi_hlutfall: moonUp,
        uv_haest_i_dag: uv,
        hiti: temp,
        hiti_finnst: feels,
        myrkur_fra: dusk ? pyIso(dusk) : null,
        myrkur_til: dawn ? pyIso(dawn) : null,
      },
    };
  });
  return results.sort((a, b) => b.skor - a.skor);
}
