// Sjálfvirk sérkenni fyrirtækja fyrir sýnishornið (aðeins á grein auglysingar-syni).
//
// GET /syni/merki?d=saga.is  → { len, nafn, takn, mynd, litur }
//   Sækir forsíðu lénsins og les og:site_name/title, apple-touch-icon/icon,
//   og:image og theme-color. Myndaslóðir vísa á /syni/mynd svo þær komi frá
//   okkar léni. Geymt í skyndiminni í viku.
// GET /syni/mynd?u=https://…  → myndin sjálf (aðeins image/*, hámark 3 MB).

const VIKA = 7 * 24 * 3600;
const LEN = /^(?=.{3,100}$)([a-z0-9-]+\.)+[a-z]{2,}$/;
const VAFRI = "Mozilla/5.0 (compatible; NorthseekPreview/1.0; +https://northseek.net)";

function json(gogn, status = 200) {
  return new Response(JSON.stringify(gogn), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${status === 200 ? 3600 : 60}` },
  });
}

async function geymt(request, ctx, smida) {
  const lykill = new Request(request.url);
  const til = await caches.default.match(lykill);
  if (til) return til;
  const svar = await smida();
  if (svar.status === 200) {
    const afrit = new Response(svar.clone().body, svar);
    afrit.headers.set("Cache-Control", `public, max-age=${VIKA}`);
    ctx.waitUntil(caches.default.put(lykill, afrit));
  }
  return svar;
}

// HTMLRewriter skilar texta og eigindum óafkóðuðum (t.d. S&yacute;sli).
const NEFND = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", yacute: "ý", eth: "ð", thorn: "þ", aelig: "æ", ouml: "ö", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Yacute: "Ý", ETH: "Ð", THORN: "Þ", AElig: "Æ", Ouml: "Ö", ndash: "–", mdash: "—" };
function afkoda(x) {
  return x.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, k) =>
    k[0] === "#" ? String.fromCodePoint(k[1] === "x" || k[1] === "X" ? parseInt(k.slice(2), 16) : Number(k.slice(1))) : (NEFND[k] ?? m));
}

function stærð(sizes) {
  const m = /(\d+)x(\d+)/.exec(sizes || "");
  return m ? Number(m[1]) : 0;
}

async function lesaMerki(len) {
  const svar = await fetch(`https://${len}/`, {
    headers: { "User-Agent": VAFRI, Accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(6000),
  });
  if (!svar.ok || !(svar.headers.get("Content-Type") || "").includes("html")) {
    throw new Error("HTTP " + svar.status);
  }
  const grunnur = svar.url;
  const g = { titill: "", nafn: "", mynd: "", litur: "", tokn: [] };
  let iTitli = false;

  await new HTMLRewriter()
    .on("title", {
      element() { iTitli = true; },
      text(t) { if (iTitli) g.titill += t.text; if (t.lastInTextNode) iTitli = false; },
    })
    .on("meta", {
      element(e) {
        const p = (e.getAttribute("property") || e.getAttribute("name") || "").toLowerCase();
        const c = e.getAttribute("content") || "";
        if (p === "og:site_name" && !g.nafn) g.nafn = c;
        if ((p === "og:image" || p === "og:image:secure_url" || p === "twitter:image") && !g.mynd) g.mynd = c;
        if (p === "theme-color" && !g.litur) g.litur = c;
      },
    })
    .on("link", {
      element(e) {
        const rel = (e.getAttribute("rel") || "").toLowerCase();
        const href = e.getAttribute("href");
        if (!href || !/\bicon\b/.test(rel)) return;
        // apple-touch-icon er yfirleitt stærst og ætlað á ljósan grunn.
        const vaegi = (rel.includes("apple-touch") ? 1000 : 0) + (stærð(e.getAttribute("sizes")) || (/\.svg/i.test(href) ? 500 : 16));
        g.tokn.push({ href, vaegi });
      },
    })
    .transform(svar)
    .arrayBuffer();

  const fullt = (u) => { try { return new URL(u, grunnur).toString(); } catch (_) { return ""; } };
  const ummyndun = (u) => (u ? "/syni/mynd?u=" + encodeURIComponent(u) : "");
  g.tokn.sort((a, b) => b.vaegi - a.vaegi);
  const takn = g.tokn.length ? fullt(g.tokn[0].href) : fullt("/favicon.ico");
  const nafn = afkoda(g.nafn || g.titill.split(/\s[|–—-]\s/)[0] || len).trim().slice(0, 60);
  const litur = /^#[0-9a-f]{3,8}$/i.test(g.litur.trim()) ? g.litur.trim() : "";

  return { len, nafn, takn: ummyndun(takn), mynd: ummyndun(fullt(g.mynd)), litur };
}

async function saekjaMynd(u) {
  let slod;
  try { slod = new URL(u); } catch (_) { return new Response("Bad url", { status: 400 }); }
  if (slod.protocol !== "https:" || !LEN.test(slod.hostname)) return new Response("Bad url", { status: 400 });
  const svar = await fetch(slod, { headers: { "User-Agent": VAFRI }, redirect: "follow", signal: AbortSignal.timeout(6000) });
  const gerd = svar.headers.get("Content-Type") || "";
  const lengd = Number(svar.headers.get("Content-Length") || 0);
  if (!svar.ok || !gerd.startsWith("image/") || lengd > 3e6) return new Response("Not an image", { status: 404 });
  const gogn = await svar.arrayBuffer();
  if (gogn.byteLength > 3e6) return new Response("Too large", { status: 413 });
  return new Response(gogn, { headers: { "Content-Type": gerd, "Cache-Control": `public, max-age=${VIKA}` } });
}

export async function syniSvar(request, url, ctx) {
  if (url.pathname === "/syni/merki") {
    const len = (url.searchParams.get("d") || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    if (!LEN.test(len)) return json({ villa: "Ógilt lén" }, 400);
    return geymt(new Request(`${url.origin}/syni/merki?d=${len}`), ctx, async () => {
      try {
        return json(await lesaMerki(len));
      } catch (villa) {
        return json({ villa: String(villa.message || villa) }, 502);
      }
    });
  }
  if (url.pathname === "/syni/mynd") {
    return geymt(request, ctx, () => saekjaMynd(url.searchParams.get("u") || "").catch(() => new Response("Fetch failed", { status: 502 })));
  }
  return null;
}
