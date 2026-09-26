// Northseek frontend Worker (rekstrarútgáfa).
//
// - /api/vakt og /api/skor fara í northseek-api-js gegnum Service Binding,
//   með skyndiminni og varasvari (sjá apiResponse).
// - www.northseek.net er áframsent á northseek.net.

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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.hostname === "www.northseek.net") {
      url.hostname = "northseek.net";
      return Response.redirect(url.toString(), 301);
    }

    if (API_PATHS.has(url.pathname)) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", { status: 405 });
      }
      return apiResponse(url, env, ctx);
    }

    return env.ASSETS.fetch(request);
  },
};
