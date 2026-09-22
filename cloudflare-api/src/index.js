/**
 * Northseek API Worker (JavaScript).
 *
 * Kemur í stað Python-Workersins: Python Workers (Pyodide) lentu í
 * "Cannot enter a promising task from inside another running promising task",
 * sem eyðilagði tilvikið og skilaði Error 1101 á öllum slóðum.
 *
 * GET-fyrirspurnir lesa eingöngu úr KV. Tímasett verk sækja gögn og vista í KV.
 */

import { STADIR } from "./locations.js";
import { readStore, updateKp, updateOvation, updateSolar, updateCloud, updateSunmoon } from "./sources.js";
import { vakt, skor, isReady, diagnosticStatus } from "./logic.js";
import { reiknaSkor } from "./scoring.js";
import { pyIso, HOUR } from "./pyutil.js";

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

const API_PATHS = new Set([
  "/api/heilsa",
  "/api/stada",
  "/api/kp",
  "/api/ovation",
  "/api/geimvedur",
  "/api/vakt",
  "/api/skor",
]);

const notReady = () =>
  response(
    {
      villa: "gögn ekki tilbúin ennþá",
      message: "Cloud and sun/moon caches are still being populated",
    },
    503,
  );

async function handle(url, env) {
  const path = url.pathname;

  if (path === "/") {
    return response({ service: "northseek-api", message: "Northseek API is running" });
  }

  if (path === "/api/profa") {
    const now = Date.now();
    return response({
      ok: true,
      test: true,
      stadir_fjoldi: STADIR.length,
      fyrsti_stadur: STADIR[0].nafn,
      reiknid: reiknaSkor(50, 4, 20, 30, 0.5, now, now + 8 * HOUR),
    });
  }

  if (!API_PATHS.has(path)) return response({ villa: "fannst ekki" }, 404);

  if (path === "/api/kp") {
    const data = await readStore(env, "kp");
    if (!data) return response({ ok: false, cache: "empty" }, 503);
    const forecast = data.forecast;
    const future = forecast.filter((row) => row.observed === "predicted" || row.observed === "estimated");
    return response({
      ok: true,
      service: "northseek-api",
      source: "NOAA SWPC",
      cache: "KV",
      updated_at: data.updated_at,
      fjoldi: forecast.length,
      spa_fjoldi: future.length,
      fyrstu_spa_faerslur: future.slice(0, 5),
    });
  }

  if (path === "/api/ovation") {
    const data = await readStore(env, "ovation");
    if (!data) return response({ ok: false, cache: "empty" }, 503);
    return response({
      ok: true,
      service: "northseek-api",
      source: data.source,
      cache: "KV",
      updated_at: data.updated_at,
      forecast_time: data.forecast_time ?? null,
      stadir_fjoldi: data.stadir.length,
      stadir: data.stadir,
    });
  }

  if (path === "/api/geimvedur") {
    const data = await readStore(env, "solar");
    return response({ ok: !!data, cache: "KV", data }, data ? 200 : 503);
  }

  const [kp, clouds, sunmoon] = await Promise.all([
    readStore(env, "kp"),
    readStore(env, "cloud"),
    readStore(env, "sunmoon"),
  ]);

  if (path === "/api/stada") return response(diagnosticStatus(kp, clouds, sunmoon));

  if (path === "/api/heilsa") {
    const [ovation, solar] = await Promise.all([readStore(env, "ovation"), readStore(env, "solar")]);
    const updatedAt = {};
    for (const [name, data] of [["kp", kp], ["cloud", clouds], ["sunmoon", sunmoon], ["ovation", ovation], ["solar", solar]]) {
      updatedAt[name] = data?.updated_at ?? null;
    }
    return response({
      ok: true,
      service: "northseek-api",
      backend: "cloudflare",
      runtime: "javascript",
      status: "running",
      ready: isReady(kp, clouds, sunmoon),
      updated_at: updatedAt,
    });
  }

  const rawDay = Number.parseInt(url.searchParams.get("dagur") ?? "0", 10);
  const day = Number.isNaN(rawDay) ? 0 : Math.min(2, Math.max(0, rawDay));

  if (!isReady(kp, clouds, sunmoon, day)) return notReady();

  if (path === "/api/vakt") {
    const solar = await readStore(env, "solar");
    const result = vakt(day, kp, clouds, sunmoon, solar);
    if (result === null) return response({ villa: "gögn ekki tilbúin ennþá" }, 503);
    return response({ reiknad: pyIso(Date.now()), dagur: day, ...result });
  }

  // /api/skor
  const ovation = day === 0 ? await readStore(env, "ovation") : null;
  return response({
    reiknad: pyIso(Date.now()),
    dagur: day,
    stadir: skor(day, kp, clouds, sunmoon, ovation),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      return await handle(url, env);
    } catch (exc) {
      console.error(`Northseek ${url.pathname}:`, exc);
      return response({ villa: "Villa í API", service: "northseek-api" }, 502);
    }
  },

  async scheduled(controller, env) {
    const now = new Date(controller.scheduledTime);
    switch (controller.cron) {
      case "0 */3 * * *":
        return updateKp(env);
      case "*/20 * * * *":
        return updateOvation(env);
      case "*/5 * * * *":
        return updateSolar(env);
      case "7,17,27,37,47,57 * * * *": {
        const batch = Math.floor((now.getUTCMinutes() - 7) / 10);
        return updateCloud(env, env.MET_USER_AGENT, batch);
      }
      case "13 * * * *":
        return updateSunmoon(env, now.getUTCHours() % 4);
      default:
        console.warn(`Unknown cron: ${controller.cron}`);
    }
  },
};
