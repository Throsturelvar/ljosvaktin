// Northseek frontend Worker (rekstrarútgáfa).
//
// - /api/vakt og /api/skor fara í northseek-api-js gegnum Service Binding,
//   með skyndiminni og varasvari (sjá apiResponse).
// - www.northseek.net er áframsent á northseek.net.
// - Öll svör fá örugga hausa (sjá medHausum); myndir og tákn eru geymd í
//   vafra í einn dag.
// - Heimsóknir með ?utm_source=… (t.d. QR-kóðinn) eru taldar í D1
//   (sjá skraUppruna) og sýndar á lokaðri síðu /maeling (sjá maelingSida).
// - Forsíða, tungumálasíður og staðasíður eru þýddar á þjóninum og
//   /sitemap.xml búið til (sjá seo.js).

import { greinaSlod, svaraSidu, sitemap } from "./seo.js";

const API_PATHS = new Set(["/api/vakt", "/api/skor"]);

function jsonError(message, status) {
  return new Response(JSON.stringify({ villa: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// API-svör eru geymd í skyndiminni gagnaversins: fersk í FERSKT sek. og
// sem varasvar í VARA sek. ef API-ið bregst (t.d. fer yfir CPU-mörk).
const FERSKT = 120;
const VARA = 6 * 3600;

function cacheKey(url, kind) {
  return new Request(`https://northseek-cache.internal/${kind}${url.pathname}${url.search}`);
}

function toClient(body, status, headers, source) {
  const out = new Headers(headers);
  out.set("Cache-Control", "no-store");
  out.set("X-Northseek-Cache", source);
  return new Response(body, { status, headers: out });
}

async function apiResponse(url, env, ctx) {
  const cache = caches.default;
  const freshKey = cacheKey(url, "fresh");
  const staleKey = cacheKey(url, "stale");

  const fresh = await cache.match(freshKey);
  if (fresh) return toClient(fresh.body, 200, fresh.headers, "hit");

  let upstream = null;
  try {
    upstream = await env.NORTHSEEK_API.fetch(
      "https://northseek-api.internal" + url.pathname + url.search,
      { headers: { Accept: "application/json" } },
    );
  } catch (error) {
    console.error("Northseek API service binding failed", error);
  }

  if (upstream && upstream.ok) {
    const body = await upstream.text();
    const headers = new Headers(upstream.headers);
    const store = (seconds) => {
      const h = new Headers(headers);
      h.set("Cache-Control", `public, max-age=${seconds}`);
      return new Response(body, { status: 200, headers: h });
    };
    ctx.waitUntil(Promise.all([cache.put(freshKey, store(FERSKT)), cache.put(staleKey, store(VARA))]));
    return toClient(body, 200, headers, "miss");
  }

  const stale = await cache.match(staleKey);
  if (stale) return toClient(stale.body, 200, stale.headers, "stale");

  if (upstream) return toClient(upstream.body, upstream.status, upstream.headers, "error");
  return jsonError("Cloudflare API samband brast", 502);
}

// Hausar sem geta ekki brotið neitt: HSTS í einn dag (án undirléna),
// nosniff og sjálfgefin tilvísunarstefna nútímavafra. CSP, X-Frame-Options
// og Permissions-Policy eru vísvitandi ekki settir (kort, letur, mæling,
// staðsetning og innfellingar gætu brotnað).
const ORYGGISHAUSAR = {
  "Strict-Transport-Security": "max-age=86400",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

// Myndir og tákn breytast sjaldan; vafrinn má geyma þau í einn dag.
const VAFRAMINNI = /^\/(images\/|favicon\.(ico|svg)$|apple-touch-icon(-precomposed)?\.png$)/;

function medHausum(response, url) {
  const out = new Response(response.body, response);
  for (const [nafn, gildi] of Object.entries(ORYGGISHAUSAR)) out.headers.set(nafn, gildi);
  if (VAFRAMINNI.test(url.pathname) && (response.status === 200 || response.status === 304)) {
    out.headers.set("Cache-Control", "public, max-age=86400");
  }
  return out;
}

// Talning á heimsóknum eftir uppruna (utm_source), t.d. QR-kóðanum. Einn
// teljari á dag fyrir hvern uppruna, herferð og land; engar IP-tölur eða
// vafraupplýsingar. Bottar og forskoðunarþjónustur (t.d. facebookexternalhit
// þegar hlekk er deilt) eru ekki taldir. Skráning bíður ekki svarsins og
// villa hér má aldrei stöðva síðuna.
const BOTTAR = /bot|crawl|spider|slurp|preview|facebookexternalhit|facebot|embedly|curl|wget|python|go-http|java\/|okhttp|headless|scan|monitor|lighthouse/i;

function skraUppruna(request, url, env, ctx) {
  const uppruni = url.searchParams.get("utm_source");
  if (!uppruni || !env.MAELING_DB || request.method !== "GET") return;
  if (API_PATHS.has(url.pathname) || VAFRAMINNI.test(url.pathname)) return;
  if (BOTTAR.test(request.headers.get("User-Agent") || "")) return;
  const stutt = (x) => (x || "").toLowerCase().trim().slice(0, 64);
  const dagur = new Date().toISOString().slice(0, 10);              // UTC = íslenskur tími
  ctx.waitUntil(
    env.MAELING_DB.prepare(
      `INSERT INTO heimsoknir (dagur, uppruni, herferd, land, fjoldi) VALUES (?1, ?2, ?3, ?4, 1)
       ON CONFLICT (dagur, uppruni, herferd, land) DO UPDATE SET fjoldi = fjoldi + 1`,
    ).bind(dagur, stutt(uppruni), stutt(url.searchParams.get("utm_campaign")), request.cf?.country || "")
      .run()
      .catch((error) => console.error("Talning mistókst", error)),
  );
}

// /maeling: lokuð yfirlitssíða (HTTP Basic auth, lykilorð í secret
// MAELING_LYKILORD). Aldrei í skyndiminni og ekki skráð af leitarvélum.
function rettLykilord(request, env) {
  const vaent = env.MAELING_LYKILORD;
  if (!vaent) return false;
  const haus = request.headers.get("Authorization") || "";
  if (!haus.startsWith("Basic ")) return false;
  let gefid = "";
  try { gefid = atob(haus.slice(6)).split(":").slice(1).join(":"); } catch { return false; }
  const a = new TextEncoder().encode(gefid), b = new TextEncoder().encode(vaent);
  let munur = a.length ^ b.length;                                   // samanburður í föstum tíma
  for (let i = 0; i < b.length; i++) munur |= (a[i] ?? 0) ^ b[i];
  return munur === 0;
}

const LOKAD_HAUSAR = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

async function maelingSida(request, env) {
  if (!rettLykilord(request, env)) {
    return new Response("Aðgangur bannaður", {
      status: 401,
      headers: { ...LOKAD_HAUSAR, "WWW-Authenticate": 'Basic realm="Northseek maeling", charset="UTF-8"' },
    });
  }
  const db = env.MAELING_DB;
  const [dagar, uppruni, lond, herferdir] = await Promise.all([
    db.prepare(`SELECT dagur, uppruni, SUM(fjoldi) n FROM heimsoknir WHERE dagur >= date('now', '-29 days')
                GROUP BY dagur, uppruni ORDER BY dagur`).all(),
    db.prepare(`SELECT uppruni,
                  SUM(fjoldi) alls,
                  SUM(CASE WHEN dagur >= date('now', '-6 days') THEN fjoldi ELSE 0 END) vika,
                  SUM(CASE WHEN dagur = date('now') THEN fjoldi ELSE 0 END) idag
                FROM heimsoknir GROUP BY uppruni ORDER BY alls DESC`).all(),
    db.prepare(`SELECT uppruni, land, SUM(fjoldi) n FROM heimsoknir GROUP BY uppruni, land ORDER BY n DESC LIMIT 40`).all(),
    db.prepare(`SELECT uppruni, herferd, SUM(fjoldi) n FROM heimsoknir WHERE herferd != '' GROUP BY uppruni, herferd ORDER BY n DESC LIMIT 20`).all(),
  ]);
  return new Response(maelingHtml(dagar.results, uppruni.results, lond.results, herferdir.results), {
    headers: { ...LOKAD_HAUSAR, "Content-Type": "text/html; charset=utf-8" },
  });
}

const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const tala = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function maelingHtml(dagar, uppruni, lond, herferdir) {
  const LITIR = ["#E9C26B", "#5FD3A0", "#7FA7F0", "#E58A6B", "#B68CF0"];
  const litur = Object.fromEntries(uppruni.map((u, i) => [u.uppruni, LITIR[i % LITIR.length]]));
  // síðustu 30 dagar, staflaðar súlur eftir uppruna
  const dagaListi = [...Array(30)].map((_, i) => new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10));
  const eftirDegi = {};
  for (const r of dagar) (eftirDegi[r.dagur] ??= {})[r.uppruni] = r.n;
  const hamark = Math.max(1, ...dagaListi.map((d) => Object.values(eftirDegi[d] || {}).reduce((a, b) => a + b, 0)));
  const sulur = dagaListi.map((d) => {
    const hlutar = Object.entries(eftirDegi[d] || {});
    const alls = hlutar.reduce((a, [, n]) => a + n, 0);
    const tip = `${d}: ${alls ? hlutar.map(([u, n]) => `${u} ${n}`).join(", ") : "engin"}`;
    return `<div class="sula" title="${esc(tip)}">${hlutar.map(([u, n]) =>
      `<span style="height:${(n / hamark) * 100}%;background:${litur[u]}"></span>`).join("")}</div>`;
  }).join("");
  const reitir = uppruni.length ? uppruni.map((u) => `
    <div class="reitur"><div class="heiti"><i style="background:${litur[u.uppruni]}"></i>${esc(u.uppruni)}</div>
      <div class="stor">${tala(u.vika)}</div><div class="smatt">síðustu 7 daga</div>
      <div class="lina"><span>Í dag <b>${tala(u.idag)}</b></span><span>Alls <b>${tala(u.alls)}</b></span></div></div>`).join("")
    : `<p class="tomt">Engar heimsóknir enn. Þær birtast hér um leið og einhver opnar slóð með <code>?utm_source=…</code>, t.d. með því að skanna QR-kóðann.</p>`;
  const landaRadir = lond.map((r) => `<tr><td>${esc(r.uppruni)}</td><td>${esc(r.land || "?")}</td><td class="n">${tala(r.n)}</td></tr>`).join("");
  const herfRadir = herferdir.map((r) => `<tr><td>${esc(r.uppruni)}</td><td>${esc(r.herferd)}</td><td class="n">${tala(r.n)}</td></tr>`).join("");
  return `<!doctype html><html lang="is"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Northseek mæling</title>
<style>
:root{--bg:#0F1726;--kort:#162036;--lina:#26314A;--texti:#E9EDF5;--daufur:#B8BFCD;--gull:#E9C26B}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--texti);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;padding:28px 16px 48px}
.wrap{max-width:860px;margin:0 auto;display:grid;gap:22px}
h1{margin:0;font-size:26px}h2{margin:0 0 10px;font-size:16px;color:var(--daufur);font-weight:600}
.undir{color:var(--daufur);margin:4px 0 0;font-size:14px}
.reitir{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:12px}
.reitur,.kort{background:var(--kort);border:1px solid var(--lina);border-radius:10px;padding:16px}
.heiti{display:flex;align-items:center;gap:8px;font-weight:600}.heiti i,.skyring i{width:10px;height:10px;border-radius:2px;display:inline-block}
.stor{font-size:34px;font-weight:700;font-variant-numeric:tabular-nums;margin-top:6px}.smatt{color:var(--daufur);font-size:13px}
.lina{display:flex;justify-content:space-between;margin-top:10px;font-size:13.5px;color:var(--daufur)}.lina b{color:var(--texti)}
.graf{display:flex;align-items:flex-end;gap:3px;height:160px;border-bottom:1px solid var(--lina)}
.sula{flex:1;height:100%;display:flex;flex-direction:column-reverse;gap:1px;min-width:0}.sula span{display:block;border-radius:2px 2px 0 0}
.asar{display:flex;justify-content:space-between;color:var(--daufur);font-size:12px;margin-top:6px}
.skyring{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px;color:var(--daufur);margin-top:8px}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:7px 6px;border-bottom:1px solid var(--lina);text-align:left}
th{color:var(--daufur);font-weight:500;font-size:12px;text-transform:uppercase;letter-spacing:.05em}.n{text-align:right;font-variant-numeric:tabular-nums}
.tvo{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px}
.tomt{color:var(--daufur);margin:0}code{color:var(--gull)}
</style></head><body><div class="wrap">
<div><h1>Heimsóknir eftir uppruna</h1><p class="undir">Talið þegar northseek.net er opnað með <code>?utm_source=…</code>, t.d. QR-kóðinn (<code>qr</code>) og Facebook-hlekkurinn (<code>facebook</code>). Bottar og forskoðun hlekkja eru ekki taldir. Dagar eru í íslenskum tíma.</p></div>
<div class="reitir">${reitir}</div>
<div class="kort"><h2>Síðustu 30 dagar</h2><div class="graf">${sulur}</div>
<div class="asar"><span>${dagaListi[0].slice(5).split("-").reverse().join(".")}.</span><span>í dag</span></div>
<div class="skyring">${uppruni.map((u) => `<span><i style="background:${litur[u.uppruni]}"></i> ${esc(u.uppruni)}</span>`).join("")}</div></div>
<div class="tvo">
<div class="kort"><h2>Lönd</h2>${landaRadir ? `<table><tr><th>Uppruni</th><th>Land</th><th class="n">Fjöldi</th></tr>${landaRadir}</table>` : `<p class="tomt">Ekkert enn.</p>`}</div>
<div class="kort"><h2>Herferðir (utm_campaign)</h2>${herfRadir ? `<table><tr><th>Uppruni</th><th>Herferð</th><th class="n">Fjöldi</th></tr>${herfRadir}</table>` : `<p class="tomt">Engin herferð skráð enn.</p>`}</div>
</div></div></body></html>`;
}

export default {
  async fetch(request, env, ctx) {
    return medHausum(await svara(request, env, ctx), new URL(request.url));
  },
};

async function svara(request, env, ctx) {
  const url = new URL(request.url);

  if (url.hostname === "www.northseek.net") {
    url.hostname = "northseek.net";
    return Response.redirect(url.toString(), 301);
  }

  if (url.pathname === "/maeling") return maelingSida(request, env);

  skraUppruna(request, url, env, ctx);

  if (API_PATHS.has(url.pathname)) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    return apiResponse(url, env, ctx);
  }

  if (request.method === "GET" || request.method === "HEAD") {
    if (url.pathname === "/sitemap.xml") return sitemap();

    const slod = greinaSlod(url.pathname);
    if (slod?.framsenda) {
      return Response.redirect(new URL(slod.framsenda + url.search, url).toString(), 301);
    }
    if (slod) {
      const vakt = () => apiResponse(new URL("/api/vakt?dagur=0", url), env, ctx);
      try {
        return await svaraSidu(request, env, slod, vakt);
      } catch (villa) {
        // Óþýdd forsíða er betri en villusíða.
        console.error("SEO-síða mistókst", villa);
        return env.ASSETS.fetch(new Request(new URL("/", url), request));
      }
    }
  }

  return env.ASSETS.fetch(request);
}
