// Northseek Cloudflare preview Worker.
//
// The preview tries Cloudflare API first and uses Render
// only when Cloudflare cannot return usable forecast data.
//
// DNS, the production site and the Render service
// are not modified by this file.

const CLOUDFLARE_API =
  "https://northseek-api.throstur-oskarsson.workers.dev";

const RENDER_API =
  "https://ljosvaktin.onrender.com";

function isForecastPath(pathname) {
  return (
    pathname === "/api/vakt" ||
    pathname === "/api/skor"
  );
}

function usableForecast(data, pathname) {
  if (!data || typeof data !== "object") {
    return false;
  }

  if (pathname === "/api/vakt") {
    return (
      data.nott &&
      Array.isArray(data.kpSpa) &&
      data.tungl &&
      Array.isArray(data.stadir) &&
      data.geimvedur
    );
  }

  if (pathname === "/api/skor") {
    return (
      Array.isArray(data.stadir) &&
      data.stadir.length > 0
    );
  }

  return false;
}

async function getForecast(request, pathname, search) {
  const path = pathname + search;

  for (const [backend, base] of [
    ["Cloudflare", CLOUDFLARE_API],
    ["Render", RENDER_API],
  ]) {
    try {
      const upstream = await fetch(base + path, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!upstream.ok) {
        console.log(
          `Northseek preview: ${backend} returned ${upstream.status}`
        );
        continue;
      }

      const data = await upstream.json();

      if (!usableForecast(data, pathname)) {
        console.log(
          `Northseek preview: ${backend} response is incomplete`
        );
        continue;
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Northseek-Backend": backend,
        },
      });
    } catch (error) {
      console.log(
        `Northseek preview: ${backend} request failed`
      );
    }
  }

  return new Response(
    JSON.stringify({
      villa: "Hvorugur bakendi skilaði nothæfri spá",
    }),
    {
      status: 502,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Northseek-Backend": "Neither",
      },
    }
  );
}

// Injected only into the preview's HTML.
// Redirect existing forecast fetches through this Worker,
// including fetches that currently point directly to Render.

const PREVIEW_SCRIPT = `
<script>
(function () {
  const originalFetch = window.fetch.bind(window);

  function showBackend(name) {
    let badge = document.getElementById("northseek-preview-backend");

    if (!badge) {
      badge = document.createElement("div");
      badge.id = "northseek-preview-backend";

      Object.assign(badge.style, {
        position: "fixed",
        bottom: "14px",
        right: "14px",
        zIndex: "2147483647",
        padding: "9px 12px",
        borderRadius: "10px",
        color: "#ffffff",
        background: "#17392f",
        font: "bold 12px system-ui, sans-serif",
        boxShadow: "0 3px 15px #0005",
        pointerEvents: "none"
      });

      document.body.appendChild(badge);
    }

    badge.textContent = "PRÓFUN · Gögn: " + name;

    badge.style.background =
      name === "Cloudflare" ? "#146c43" :
      name === "Render" ? "#80521c" :
      "#7f1d1d";
  }

  window.fetch = async function (input, init) {
    const originalUrl =
      typeof input === "string" ? input :
      input instanceof URL ? input.href :
      input && input.url;

    if (!originalUrl) {
      return originalFetch(input, init);
    }

    let url;

    try {
      url = new URL(originalUrl, location.href);
    } catch (_) {
      return originalFetch(input, init);
    }

    const isForecast =
      url.pathname === "/api/vakt" ||
      url.pathname === "/api/skor";

    const isKnownBackend =
      url.origin === location.origin ||
      url.hostname === "ljosvaktin.onrender.com" ||
      url.hostname === "northseek-api.throstur-oskarsson.workers.dev";

    const method =
      (init && init.method) ||
      (input instanceof Request && input.method) ||
      "GET";

    if (
      !isForecast ||
      !isKnownBackend ||
      method.toUpperCase() !== "GET"
    ) {
      return originalFetch(input, init);
    }

    const previewUrl =
      location.origin + url.pathname + url.search;

    const result = await originalFetch(previewUrl);

    showBackend(
      result.headers.get("X-Northseek-Backend") ||
      "Óþekkt"
    );

    return result;
  };
})();
</script>
`;

class PreviewHead {
  element(element) {
    element.prepend(PREVIEW_SCRIPT, {
      html: true,
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Same-origin forecast API for the preview.
    if (isForecastPath(url.pathname)) {
      return getForecast(
        request,
        url.pathname,
        url.search
      );
    }

    // Everything else comes from the existing static site.
    const asset = await env.ASSETS.fetch(request);

    const contentType =
      asset.headers.get("content-type") || "";

    if (
      asset.ok &&
      contentType.includes("text/html")
    ) {
      return new HTMLRewriter()
        .on("head", new PreviewHead())
        .transform(asset);
    }

    return asset;
  },
};
