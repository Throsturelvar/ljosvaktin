// Leitarvélaslóðir Northseek.
//
// - Hvert tungumál fær sína slóð (/is/, /de/ …; enska er á /) og hver staður
//   sína síðu (/places/kirkjufell/, /de/places/kirkjufell/). index.html er
//   þýdd hér á þjóninum með HTMLRewriter svo Google sjái réttan texta,
//   titil, lýsingu, canonical og hreflang án þess að keyra JavaScript.
// - Staðasíður fá samantekt kvöldsins (myrkur, skýjahula, Kp) úr /api/vakt.
// - /sitemap.xml er búið til úr sömu listum.
//
// Nýtt tungumál: bæta við TUNGUMAL hér (auk <option> og /i18n/<kóði>.json).
// Nýr staður: bæta við STADIR hér (auðkenni = id úr API-inu).

const SLEN = "https://northseek.net";

// Röðin er sú sama og í #tungumalVal.
export const TUNGUMAL = {
  en: { slod: "", og: "en_GB" },
  is: { slod: "is", og: "is_IS" },
  pl: { slod: "pl", og: "pl_PL" },
  de: { slod: "de", og: "de_DE" },
  fr: { slod: "fr", og: "fr_FR" },
  es: { slod: "es", og: "es_ES" },
  "zh-Hans": { slod: "zh-hans", og: "zh_CN" },
  "zh-Hant": { slod: "zh-hant", og: "zh_TW" },
};

// [id, nafn, hluti, breidd, lengd] — sama og stadir í northseek-api-js.
export const STADIR = [
  ["reykjavik", "Reykjavík / Grótta", "Höfuðborgarsvæðið", 64.1548, -21.9469],
  ["thingvellir", "Þingvellir", "Suðurland", 64.2559, -21.1298],
  ["akureyri", "Akureyri", "Norðurland", 65.6885, -18.1262],
  ["vik", "Vík í Mýrdal", "Suðurland", 63.4186, -19.006],
  ["jokulsarlon", "Jökulsárlón", "Suðausturland", 64.0784, -16.23],
  ["kirkjufell", "Kirkjufell", "Snæfellsnes", 64.9337, -23.3167],
  ["gullfoss", "Gullfoss", "Suðurland", 64.3271, -20.1199],
  ["skogafoss", "Skógafoss", "Suðurland", 63.532, -19.5113],
  ["reynisfjara", "Reynisfjara", "Suðurland", 63.4039, -19.0459],
  ["myvatn", "Mývatn", "Norðurland", 65.6, -16.9833],
  ["dettifoss", "Dettifoss", "Norðurland", 65.8145, -16.3841],
  ["husavik", "Húsavík", "Norðurland", 66.0449, -17.3389],
  ["hofn", "Höfn í Hornafirði", "Suðausturland", 64.2539, -15.2082],
  ["seydisfjordur", "Seyðisfjörður", "Austurland", 65.2646, -14.0028],
  ["isafjordur", "Ísafjörður", "Vestfirðir", 66.0748, -23.12],
  ["reykjanesviti", "Reykjanesviti", "Reykjanes", 63.8151, -22.7014],
  ["stykkisholmur", "Stykkishólmur", "Snæfellsnes", 65.0761, -22.7266],
  ["oskjuhlid", "Öskjuhlíð", "Höfuðborgarsvæðið", 64.1276, -21.9186],
  ["mosfellsbaer", "Mosfellsbæjarheiði", "Höfuðborgarsvæðið", 64.1655, -21.6903],
  ["kleifarvatn", "Kleifarvatn", "Reykjanes", 63.9169, -22.0503],
  ["selfoss", "Selfoss", "Suðurland", 63.9333, -20.9833],
  ["hveragerdi", "Hveragerði", "Suðurland", 64.0003, -21.1868],
  ["vestmannaeyjar", "Vestmannaeyjar", "Suðurland", 63.4427, -20.2734],
  ["landmannalaugar", "Landmannalaugar", "Suðurland", 63.9932, -19.0623],
  ["blaa_lonid", "Bláa lónið", "Reykjanes", 63.8804, -22.4495],
  ["gardur", "Garður", "Suðurnes", 64.0503, -22.7075],
  ["akranes", "Akranes", "Vesturland", 64.3155, -22.0699],
  ["borgarnes", "Borgarnes", "Vesturland", 64.5384, -21.9215],
  ["bolungarvik", "Bolungarvík", "Vestfirðir", 66.1552, -23.2519],
  ["patreksfjordur", "Patreksfjörður", "Vestfirðir", 65.5951, -23.9723],
  ["holmavik", "Hólmavík", "Vestfirðir", 65.7092, -21.6862],
  ["saudarkrokur", "Sauðárkrókur", "Norðurland vestra", 65.7461, -19.6394],
  ["siglufjordur", "Siglufjörður", "Norðurland vestra", 66.1539, -18.9145],
  ["blonduos", "Blönduós", "Norðurland vestra", 65.6659, -20.2934],
  ["dalvik", "Dalvík", "Norðurland eystra", 65.9631, -18.532],
  ["egilsstadir", "Egilsstaðir", "Austurland", 65.2669, -14.3948],
  ["reydarfjordur", "Reyðarfjörður", "Austurland", 65.0233, -14.2115],
  ["neskaupstadur", "Neskaupstaður", "Austurland", 65.15, -13.7167],
].map(([id, nafn, hluti, lat, lon]) => ({ id, slug: id.replace(/_/g, "-"), nafn, hluti, lat, lon }));

const STADUR_EFTIR_SLUG = new Map(STADIR.map((s) => [s.slug, s]));
const TUNGUMAL_EFTIR_SLOD = new Map(
  Object.entries(TUNGUMAL).filter(([, v]) => v.slod).map(([kodi, v]) => [v.slod, kodi]),
);

export function slodFyrir(lang, stadur) {
  const forskeyti = TUNGUMAL[lang].slod ? `/${TUNGUMAL[lang].slod}` : "";
  return `${forskeyti}${stadur ? `/places/${stadur.slug}` : ""}/`;
}

// "/de/places/kirkjufell/" -> { lang: "de", stadur, rot: false }.
// Gild slóð án skástriks í lokin -> { framsenda: "<slóð með />" }. Annars null.
export function greinaSlod(pathname) {
  if (pathname === "/") return { lang: "en", stadur: null, rot: true };

  const hlutar = pathname.split("/").filter(Boolean);
  let lang = "en";
  if (hlutar.length && TUNGUMAL_EFTIR_SLOD.has(hlutar[0].toLowerCase())) {
    lang = TUNGUMAL_EFTIR_SLOD.get(hlutar.shift().toLowerCase());
  } else if (!hlutar.length || hlutar[0] !== "places") {
    return null;
  }

  let stadur = null;
  if (hlutar.length) {
    if (hlutar.length !== 2 || hlutar[0] !== "places") return null;
    stadur = STADUR_EFTIR_SLUG.get(hlutar[1].toLowerCase());
    if (!stadur) return null;
  }

  const rett = slodFyrir(lang, stadur);
  if (pathname !== rett) return { framsenda: rett };
  return { lang, stadur, rot: false };
}

/* ---------- Texti ---------- */

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function fylla(texti, breytur) {
  return String(texti).replace(/\{(\w+)\}/g, (m, nafn) => (breytur[nafn] !== undefined ? breytur[nafn] : m));
}

async function saekjaTexta(env, origin, lang) {
  const saekja = async (kodi) => {
    const svar = await env.ASSETS.fetch(new Request(`${origin}/i18n/${kodi}.json`));
    if (!svar.ok) throw new Error(`i18n ${kodi}: HTTP ${svar.status}`);
    return svar.json();
  };
  const en = await saekja("en");
  return lang === "en" ? en : { ...en, ...(await saekja(lang)) };
}

/* ---------- Myrkur og samantekt kvöldsins ---------- */

const RAD = Math.PI / 180;

// Sólarhæð í gráðum (einföld stjörnufræðiformúla, nákvæm upp á <1°).
function solarhaed(ms, lat, lon) {
  const d = ms / 86400000 - 10957.5;
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = 280.46061837 + 360.98564736629 * d;
  const ha = (gmst + lon) * RAD - ra;
  return Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(ha)) / RAD;
}

// Fullt myrkur eins og í einkunninni: sól undir −12°. Skilar [frá, til] í ms.
function myrkurNaetur(dags, stadur) {
  const upphaf = Date.parse(`${dags}T12:00:00Z`);
  let fra = null;
  let til = null;
  for (let ms = upphaf; ms <= upphaf + 86400000; ms += 5 * 60000) {
    if (solarhaed(ms, stadur.lat, stadur.lon) < -12) {
      fra ??= ms;
      til = ms;
    }
  }
  return fra === null ? null : [fra, til];
}

const klukka = (ms) => new Date(ms).toISOString().slice(11, 16);

// Ísland er á UTC allt árið; nott.klst eru klukkustundir frá API-inu.
function samantekt(gogn, stadur, texti, lang) {
  const s = gogn?.stadir?.find((x) => x.id === stadur.id);
  const myrkur = gogn?.nott?.dags && myrkurNaetur(gogn.nott.dags, stadur);
  if (!s || !myrkur) return null;

  const nottUpphaf = Date.parse(`${gogn.nott.dags}T00:00:00Z`);
  const sky = [];
  const kp = [];
  gogn.nott.klst.forEach((h, i) => {
    // Klukkustundir fyrir hádegi tilheyra morgni næsta dags.
    const ms = nottUpphaf + ((h < 12 ? 24 : 0) + h) * 3600000;
    if (ms + 3600000 > myrkur[0] && ms <= myrkur[1]) {
      if (s.sky?.[i] != null) sky.push(s.sky[i]);
      if (gogn.kpSpa?.[i] != null) kp.push(gogn.kpSpa[i]);
    }
  });
  if (!sky.length || !kp.length) return null;

  return fylla(texti.placeSummary, {
    place: stadur.nafn,
    region: texti.regions?.[stadur.hluti] ?? stadur.hluti,
    from: klukka(myrkur[0]),
    to: klukka(myrkur[1]),
    cloud: Math.round(sky.reduce((a, b) => a + b, 0) / sky.length),
    kp: new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(Math.max(...kp)),
  });
}

/* ---------- Síðan ---------- */

function hreflangTenglar(stadur) {
  const tenglar = Object.entries(TUNGUMAL).map(
    ([kodi]) => `<link rel="alternate" hreflang="${kodi}" href="${SLEN}${slodFyrir(kodi, stadur)}">`,
  );
  tenglar.push(`<link rel="alternate" hreflang="x-default" href="${SLEN}${slodFyrir("en", stadur)}">`);
  return tenglar.join("\n");
}

function stadaTenglar(lang, texti, valinn) {
  const rodun = [...STADIR].sort((a, b) => a.nafn.localeCompare(b.nafn, "is"));
  const li = rodun
    .map((s) => {
      const nuna = s === valinn ? ' aria-current="page"' : "";
      return `<li><a href="${slodFyrir(lang, s)}"${nuna}>${esc(s.nafn)}</a></li>`;
    })
    .join("");
  return `<nav class="stadatenglar" aria-labelledby="stadatenglar-titill">` +
    `<h3 id="stadatenglar-titill">${esc(texti.allPlacesTitle)}</h3><ul>${li}</ul></nav>`;
}

function skipulogdGogn(lang, texti, stadur, lysing) {
  const heim = `${SLEN}${slodFyrir(lang, null)}`;
  const slod = `${SLEN}${slodFyrir(lang, stadur)}`;
  const gogn = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: texti.breadcrumbIceland, item: heim },
        { "@type": "ListItem", position: 2, name: stadur.nafn, item: slod },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      url: slod,
      name: fylla(texti.placeHeroTitle, { place: stadur.nafn }),
      description: lysing,
      inLanguage: lang,
      isPartOf: { "@type": "WebSite", name: "Northseek", url: `${SLEN}/` },
      about: {
        "@type": "Place",
        name: stadur.nafn,
        address: { "@type": "PostalAddress", addressRegion: texti.regions?.[stadur.hluti] ?? stadur.hluti, addressCountry: "IS" },
        geo: { "@type": "GeoCoordinates", latitude: stadur.lat, longitude: stadur.lon },
      },
    },
  ];
  // "<" er falið svo textinn geti aldrei lokað <script>.
  return `<script type="application/ld+json">${JSON.stringify(gogn).replace(/</g, "\\u003c")}</script>`;
}

// saekjaVakt: () => Promise<Response> fyrir /api/vakt?dagur=0 (með skyndiminni).
export async function svaraSidu(request, env, slod, saekjaVakt) {
  const url = new URL(request.url);
  const { lang, stadur, rot } = slod;
  const texti = await saekjaTexta(env, url.origin, lang);

  let gogn = null;
  if (stadur) {
    try {
      const svar = await saekjaVakt();
      if (svar.ok) gogn = await svar.json();
    } catch (villa) {
      console.error("Samantekt staðar mistókst", villa);
    }
  }

  const v = stadur ? { place: stadur.nafn, region: texti.regions?.[stadur.hluti] ?? stadur.hluti } : {};
  const titill = stadur ? fylla(texti.placeMetaTitle, v) : texti.metaTitle;
  const lysing = stadur ? fylla(texti.placeMetaDescription, v) : texti.metaDescription;
  const canonical = `${SLEN}${slodFyrir(lang, stadur)}`;
  const inngangur = stadur
    ? samantekt(gogn, stadur, texti, lang) ?? fylla(texti.placeSummaryFallback, v)
    : null;

  const t = (lykill) => texti[lykill] ?? "";
  const setja = (gildi) => ({ element: (el) => el.setAttribute("content", gildi) });

  const sida = await env.ASSETS.fetch(new Request(`${url.origin}/`));
  const rewriter = new HTMLRewriter()
    .on("html", {
      element(el) {
        el.setAttribute("lang", lang);
        if (!rot) el.setAttribute("data-lang", lang);
        if (stadur) {
          el.setAttribute("data-stadur", stadur.id);
          el.setAttribute("data-stadur-nafn", stadur.nafn);
        }
      },
    })
    .on("title", { element: (el) => el.setInnerContent(titill) })
    .on('meta[name="description"]', setja(lysing))
    .on('meta[property="og:title"]', setja(titill.replace(/ – [^|]*\|/, " |")))
    .on('meta[property="og:description"]', setja(lysing))
    .on('meta[property="og:url"]', setja(canonical))
    .on('link[rel="canonical"]', { element: (el) => el.setAttribute("href", canonical) })
    .on("head", {
      element(el) {
        let vid = `\n<meta property="og:locale" content="${TUNGUMAL[lang].og}">\n${hreflangTenglar(stadur)}\n`;
        if (stadur) vid += skipulogdGogn(lang, texti, stadur, lysing) + "\n";
        el.append(vid, { html: true });
      },
    })
    .on("a.merki", { element: (el) => el.setAttribute("href", slodFyrir(lang, null)) })
    .on("[data-i18n]", {
      element(el) {
        const lykill = el.getAttribute("data-i18n");
        if (stadur && lykill === "heroTitle") {
          el.removeAttribute("data-i18n");
          el.setInnerContent(fylla(texti.placeHeroTitle, v));
        } else if (stadur && lykill === "heroCopy") {
          el.removeAttribute("data-i18n");
          el.setInnerContent(inngangur);
        } else if (lang !== "en" && texti[lykill] != null) {
          el.setInnerContent(texti[lykill]);
        }
      },
    })
    .on("[data-i18n-html]", {
      element(el) {
        const lykill = el.getAttribute("data-i18n-html");
        if (lang !== "en" && texti[lykill] != null) el.setInnerContent(texti[lykill], { html: true });
      },
    })
    .on("#stadur-lina", {
      element: (el) => el.setInnerContent(fylla(t("placeTonight"), { name: stadur?.nafn ?? "Reykjavík / Grótta" })),
    })
    .on("#skyring", { element: (el) => el.setInnerContent(t("loading")) })
    .on("#finnamig", { element: (el) => el.setInnerContent(t("findMe")) })
    .on("#stadarval", { element: (el) => el.setAttribute("aria-label", t("chooseLocation")) })
    .on("#tungumalVal", { element: (el) => el.setAttribute("aria-label", t("language")) })
    .on(`#tungumalVal option[value="${lang}"]`, { element: (el) => el.setAttribute("selected", "") })
    .on("#stadir", { element: (el) => el.append(stadaTenglar(lang, texti, stadur), { html: true }) });

  const svar = rewriter.transform(sida);
  const hausar = new Headers(svar.headers);
  hausar.delete("ETag");
  hausar.set("Content-Type", "text/html; charset=utf-8");
  hausar.set("Cache-Control", "public, max-age=0, must-revalidate");
  hausar.set("Content-Language", lang);
  return new Response(svar.body, { status: 200, headers: hausar });
}

/* ---------- Sitemap ---------- */

export function sitemap() {
  const sidur = [null, ...STADIR];
  const kodar = Object.keys(TUNGUMAL);
  const urls = [];
  for (const stadur of sidur) {
    const tenglar = kodar
      .map((k) => `    <xhtml:link rel="alternate" hreflang="${k}" href="${SLEN}${slodFyrir(k, stadur)}"/>`)
      .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${SLEN}${slodFyrir("en", stadur)}"/>`)
      .join("\n");
    for (const k of kodar) {
      urls.push(
        `  <url>\n    <loc>${SLEN}${slodFyrir(k, stadur)}</loc>\n    <changefreq>hourly</changefreq>\n` +
          `    <priority>${stadur ? "0.7" : "1.0"}</priority>\n${tenglar}\n  </url>`,
      );
    }
  }
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    `${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
