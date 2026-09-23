// Northseek frontend Worker (rekstrarútgáfa).
//
// - /api/vakt og /api/skor fara í northseek-api-js gegnum Service Binding.
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === "www.northseek.net") {
      url.hostname = "northseek.net";
      return Response.redirect(url.toString(), 301);
    }

    if (API_PATHS.has(url.pathname)) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", { status: 405 });
      }
      try {
        const upstream = await env.NORTHSEEK_API.fetch(
          "https://northseek-api.internal" + url.pathname + url.search,
          { headers: { Accept: "application/json" } },
        );
        const headers = new Headers(upstream.headers);
        headers.set("Cache-Control", "no-store");
        return new Response(upstream.body, { status: upstream.status, headers });
      } catch (error) {
        console.error("Northseek API service binding failed", error);
        return jsonError("Cloudflare API samband brast", 502);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
