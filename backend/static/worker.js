// Northseek Cloudflare frontend: static assets + same-origin API via Service Binding.
// No Render fallback: a broken API connection must be visible before DNS cutover.

const FORECAST_PATHS = new Set(["/api/vakt", "/api/skor"]);

const CLIENT_SCRIPT = `<script>
(function () {
  const originalFetch = window.fetch.bind(window);
  function showBackend(name) {
    let badge = document.getElementById("northseek-preview-backend");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "northseek-preview-backend";
      Object.assign(badge.style, {
        position: "fixed", bottom: "14px", right: "14px", zIndex: "2147483647",
        padding: "9px 12px", borderRadius: "10px", color: "#fff",
        background: "#146c43", font: "bold 12px system-ui, sans-serif",
        boxShadow: "0 3px 15px #0005", pointerEvents: "none"
      });
      document.body.appendChild(badge);
    }
    badge.textContent = "PRÓFUN · Gögn: " + name;
    badge.style.background = name === "Cloudflare" ? "#146c43" : "#7f1d1d";
  }
  window.fetch = async function (input, init) {
    const raw = typeof input === "string" ? input :
      input instanceof URL ? input.href : input && input.url;
    if (!raw) return originalFetch(input, init);
    let url;
    try { url = new URL(raw, location.href); }
    catch (_) { return originalFetch(input, init); }
    const isForecast = url.pathname === "/api/vakt" || url.pathname === "/api/skor";
    const knownOrigin = url.origin === location.origin ||
      url.hostname === "ljosvaktin.onrender.com" ||
      url.hostname === "northseek-api.throstur-oskarsson.workers.dev";
    const method = (init && init.method) ||
      (input instanceof Request && input.method) || "GET";
    if (!isForecast || !knownOrigin || method.toUpperCase() !== "GET") {
      return originalFetch(input, init);
    }
    const response = await originalFetch(location.origin + url.pathname + url.search, init);
    showBackend(response.headers.get("X-Northseek-Backend") || "Villa");
    return response;
  };
})();
</script>`;

class InjectClient {
  element(element) {
    element.prepend(CLIENT_SCRIPT, { html: true });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (FORECAST_PATHS.has(url.pathname)) {
      if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
      }
      try {
        // The URL hostname is internal to the binding; only its path/query
        // are consumed by the Python API's urlparse(request.url).
        const upstreamUrl = "https://northseek-api.internal" + url.pathname + url.search;
        const upstream = await env.NORTHSEEK_API.fetch(upstreamUrl, {
          headers: { Accept: "application/json" }
        });
        const headers = new Headers(upstream.headers);
        headers.set("X-Northseek-Backend", "Cloudflare");
        headers.set("Cache-Control", "no-store");
        return new Response(upstream.body, { status: upstream.status, headers });
      } catch (error) {
        console.error("Northseek API service binding failed", error);
        return new Response(JSON.stringify({ villa: "Cloudflare API samband brast" }), {
          status: 502,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "X-Northseek-Backend": "Error",
            "Cache-Control": "no-store"
          }
        });
      }
    }
    const asset = await env.ASSETS.fetch(request);
    if (asset.ok && (asset.headers.get("content-type") || "").includes("text/html")) {
      return new HTMLRewriter().on("head", new InjectClient()).transform(asset);
    }
    return asset;
  }
};
