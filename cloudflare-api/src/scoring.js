// Reiknar norðurljósaskor (0-100) fyrir einn stað. Bein þýðing á scoring.py.
// Tímar eru millisekúndur (UTC); skýjagögn eru listi af [ms, gildi] í sömu röð og í KV.

import { HOUR, pyRound, naiveUtc, dateStartMs, mean } from "./pyutil.js";

export function ovationVirkni(lat, lon, ovationData) {
  if (!ovationData) return null;
  const lon360 = ((lon % 360) + 360) % 360;
  const latR = pyRound(lat);
  const lonR = pyRound(lon360);
  let besta = null;
  for (const [lo, la, v] of ovationData.coordinates) {
    if (la === latR && lo === lonR) return v;
    const d = Math.abs(la - lat) + Math.min(Math.abs(lo - lon360), 360 - Math.abs(lo - lon360));
    if (besta === null || d < besta[0]) besta = [d, v];
  }
  return besta ? besta[1] : null;
}

export function kpLeitni(kpSpa, myrkurFra, myrkurTil) {
  if (!kpSpa || !kpSpa.length || !myrkurFra || !myrkurTil) return null;
  const gildi = [];
  for (const row of kpSpa) {
    if (row.observed !== "predicted" && row.observed !== "estimated") continue;
    const t = naiveUtc(row.time_tag);
    if (t === null) continue;
    if (myrkurFra <= t && t <= myrkurTil) gildi.push(Number(row.kp));
  }
  return mean(gildi);
}

export function medalSkyjahula(sky, myrkurFra, myrkurTil) {
  if (!sky || !sky.length || !myrkurFra || !myrkurTil) return null;
  const gildi = [];
  for (const [t, p] of sky) {
    if (myrkurFra <= t && t <= myrkurTil && p.heild !== null && p.heild !== undefined) gildi.push(p.heild);
  }
  return mean(gildi);
}

export function medalSkyjaopacitet(sky, myrkurFra, myrkurTil) {
  if (!sky || !sky.length || !myrkurFra || !myrkurTil) return null;
  const gildi = [];
  for (const [t, p] of sky) {
    if (!(myrkurFra <= t && t <= myrkurTil)) continue;
    const lagt = p.lagt ?? null, midlungs = p.midlungs ?? null, hatt = p.hatt ?? null;
    if (lagt === null && midlungs === null && hatt === null) {
      if (p.heild !== null && p.heild !== undefined) gildi.push(p.heild);
      continue;
    }
    const opacitet = 0.6 * (lagt || 0) + 0.3 * (midlungs || 0) + 0.1 * (hatt || 0);
    gildi.push(Math.min(opacitet, 100));
  }
  return mean(gildi);
}

export function haestuUvDagsins(sky, dags) {
  if (!sky || !sky.length || !dags) return null;
  const upphaf = dateStartMs(dags);
  const lok = upphaf + 24 * HOUR;
  const gildi = [];
  for (const [t, p] of sky) {
    if (!(upphaf <= t && t < lok) || p.uv_heidskirt === null || p.uv_heidskirt === undefined) continue;
    const heild = p.heild ?? null;
    gildi.push(p.uv_heidskirt * (1 - (heild !== null ? heild : 50) / 100));
  }
  return gildi.length ? pyRound(Math.max(...gildi), 1) : null;
}

function tunglBilFyrirDag(d) {
  const upphaf = dateStartMs(d.dags);
  const lok = upphaf + 24 * HOUR;
  const r = d.tungl_upp;
  const s = d.tungl_nidur;
  if (d.tungl_alltaf_uppi) return [[upphaf, lok]];
  if (d.tungl_alltaf_nidri) return [];
  if (r && s) return r <= s ? [[r, s]] : [[upphaf, s], [r, lok]];
  if (r && !s) return [[r, lok]];
  if (s && !r) return [[upphaf, s]];
  return [];
}

export function tunglUppiHlutfall(dagar, dagur, myrkurFra, myrkurTil) {
  if (!dagar || !dagar.length || !myrkurFra || !myrkurTil || myrkurTil <= myrkurFra) return null;
  const bil = [];
  for (const i of [dagur, dagur + 1]) {
    if (i < dagar.length) bil.push(...tunglBilFyrirDag(dagar[i]));
  }
  let heild = 0;
  for (const [upphaf, endir] of bil) {
    const a = Math.max(upphaf, myrkurFra);
    const b = Math.min(endir, myrkurTil);
    if (b > a) heild += (b - a) / 1000;
  }
  const lengd = (myrkurTil - myrkurFra) / 1000;
  return lengd > 0 ? Math.min(1.0, heild / lengd) : null;
}

export function naestigildi(sky, timi) {
  if (!sky || !sky.length || !timi) return {};
  let best = sky[0];
  for (const item of sky) {
    if (Math.abs(item[0] - timi) < Math.abs(best[0] - timi)) best = item;
  }
  return best[1];
}

export function hitiVidMyrkur(sky, myrkurFra) {
  if (!sky || !sky.length || !myrkurFra) return [null, null];
  const p = naestigildi(sky, myrkurFra);
  return [p.hiti ?? null, p.hiti_finnst ?? null];
}

export function naeturklukkustundir(fra, til) {
  if (!fra || !til || til <= fra) return [];
  let t = Math.floor(fra / HOUR) * HOUR;
  if (t < fra) t += HOUR;
  const ut = [];
  for (; t <= til; t += HOUR) ut.push(t);
  return ut;
}

export function kpAKlukkustund(kpSpa, klstTimar) {
  if (!klstTimar.length) return [];
  if (!kpSpa || !kpSpa.length) return klstTimar.map(() => null);
  const punktar = [];
  for (const row of kpSpa) {
    if (!row || row.kp === null || row.kp === undefined) continue;
    const t = naiveUtc(row.time_tag);
    const v = Number(row.kp);
    if (t === null || Number.isNaN(v)) continue;
    punktar.push([t, v]);
  }
  punktar.sort((a, b) => a[0] - b[0]);
  if (!punktar.length) return klstTimar.map(() => null);
  const ut = [];
  for (const klst of klstTimar) {
    if (klst <= punktar[0][0]) { ut.push(pyRound(punktar[0][1], 2)); continue; }
    const last = punktar[punktar.length - 1];
    if (klst >= last[0]) { ut.push(pyRound(last[1], 2)); continue; }
    for (let i = 0; i < punktar.length - 1; i++) {
      const [t0, v0] = punktar[i];
      const [t1, v1] = punktar[i + 1];
      if (t0 <= klst && klst <= t1) {
        const hlutfall = (klst - t0) / (t1 - t0);
        ut.push(pyRound(v0 + (v1 - v0) * hlutfall, 2));
        break;
      }
    }
  }
  return ut;
}

export function skyAKlukkustund(sky, klstTimar) {
  return klstTimar.map((klst) => {
    const p = naestigildi(sky, klst);
    return p.heild !== null && p.heild !== undefined ? pyRound(p.heild) : null;
  });
}

export const TUNGLFASA_HEITI = {
  "New Moon": "Nýtt tungl",
  "Waxing Crescent": "Vaxandi mánasigð",
  "First Quarter": "Fyrsta kvartil",
  "Waxing Gibbous": "Vaxandi tungl",
  "Full Moon": "Fullt tungl",
  "Waning Gibbous": "Dvínandi tungl",
  "Last Quarter": "Síðasta kvartil",
  "Waning Crescent": "Dvínandi mánasigð",
};

export function solvindurTulkun(bz, hradi) {
  if (bz === null || bz === undefined) return "Gögn um sólvind ekki tiltæk í augnablikinu.";
  let domur;
  if (bz <= -10) domur = "mjög hagstætt fyrir norðurljós núna";
  else if (bz <= -5) domur = "hagstætt fyrir norðurljós núna";
  else if (bz < 0) domur = "hlutlaust til hagstætt núna";
  else if (bz < 5) domur = "hlutlaust núna";
  else domur = "óhagstætt fyrir norðurljós núna";

  let bzText = Math.abs(pyRound(bz, 1)).toFixed(1);
  if (bz < 0) bzText = "-" + bzText;
  let setning = `Bz-gildið er ${bzText} nT — ${domur}.`;
  if (hradi !== null && hradi !== undefined) {
    if (hradi >= 500) setning += " Sólvindshraði er hár, sem magnar áhrifin.";
    else if (hradi < 350) setning += " Sólvindshraði er lágur.";
  }
  return setning;
}

export function reiknaSkor(virkni, kp, skyOpacitet, tunglPct, tunglUppi, myrkurFra, myrkurTil) {
  if (myrkurFra === null || myrkurTil === null || myrkurTil <= myrkurFra) {
    return { skor: 0.0, "ástæða": "ekkert marktækt myrkur á tímabilinu" };
  }
  const heidskirtStig = 100 - (skyOpacitet !== null ? skyOpacitet : 50);
  const tunglBirta = tunglPct !== null ? tunglPct : 30;
  const tunglUppHlutf = tunglUppi !== null ? tunglUppi : 1.0;
  const tunglStig = 100 - tunglBirta * tunglUppHlutf;
  const kpStig = kp !== null ? Math.min((kp || 0) / 9.0, 1.0) * 100 : 50.0;

  let virkniStig, skor, nakvaemni;
  if (virkni !== null && virkni !== undefined) {
    // virkni er prósentulíkur (0-100) á sýnilegum norðurljósum skv. NOAA.
    virkniStig = Math.min(Math.max(virkni, 0.0), 100.0);
    skor = 0.35 * virkniStig + 0.1 * kpStig + 0.4 * heidskirtStig + 0.15 * tunglStig;
    nakvaemni = "mæling";
  } else {
    virkniStig = null;
    skor = 0.45 * kpStig + 0.4 * heidskirtStig + 0.15 * tunglStig;
    nakvaemni = "spá";
  }
  return {
    skor: pyRound(Math.max(0.0, Math.min(100.0, skor)), 1),
    nakvaemni,
    sundurlidun: {
      virkni_stig: virkniStig !== null ? pyRound(virkniStig, 1) : null,
      kp_stig: pyRound(kpStig, 1),
      heidskirt_stig: pyRound(heidskirtStig, 1),
      tungl_stig: pyRound(tunglStig, 1),
    },
  };
}
