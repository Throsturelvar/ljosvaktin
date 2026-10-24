// Sýnishorn auglýsingasvæða (aðeins á grein auglysingar-syni, fer ekki í main).
//
// Slóðin ?syni=<lykill, lén eða nafn> setur fyrirtæki inn í bæði svæðin:
//   1. „Aurora tours tonight“ fyrir neðan Next hour (samstarf með Book now)
//   2. Auglýsingabox í 8. reit staðanetsins
// Leitað er í þessari röð:
//   - lykill eða lén í FYRIRTAEKI (handvirkt, t.d. ?syni=elding eða ?syni=elding.is)
//   - annað lén (t.d. ?syni=sagatravel.is): sérkenni sótt sjálfkrafa um
//     /syni/merki (sjá syni-worker.js); ?nafn=… yfirskrifar nafnið
//   - annað: notað sem nafn með sjálfgefnum gildum (t.d. ?syni=Arctic%20Trip)
// Án ?syni birtast staðgenglar (Fyrirtæki A/B/C). Valið geymist í
// sessionStorage því staðarval og tungumálaval skipta um slóð án leitarstrengs.
//
// index.html kallar á window.syniTeikna() í lok teikna(); hér eru notaðar
// víðværu breyturnar valinn, valinnNafn, nott, tungumal og klstLokTexti þaðan.

// Nýtt fyrirtæki: bæta við færslu. Allir reitir nema nafn eru valfrjálsir.
// Textareitir mega vera strengur eða { en, is }.
//   len       lén, svo ?syni=<lén> finni færsluna
//   gerd      ferðategund og brottfararstaður
//   brottfor  sótt / brottför, "HH:MM"
//   uti       tíminn á staðnum, ["HH:MM", "HH:MM"]; borið saman við besta gluggann
//   verd      t.d. "from 12.990 kr"; sleppt ef tómt
//   endurbokun  true = „Free retry if no lights“
//   eiginleiki  annar grænn punktur í stað endurbókunar
//   slod      bókunarsíða
//   stadur    staður sem er valinn sjálfkrafa (nafn eins og í /api/vakt)
//   litur     litur fyrirtækisins (upphafsstafir ef ekkert tákn, rammi á boxi)
//   takn      lítið merki á ferðakorti; taknGrunnur = bakgrunnur þess
//   merki     orðmerki (lógó) yfir mynd í boxinu; best hvítt eða ljóst
//   mynd      mynd í ferðakorti og boxi
//   auglysing { fyrirsogn, texti } fyrir boxið
//   kostad    kostuð eining undir hausnum (970×250 tölva, fullbreidd × 100 sími):
//             { mynd, myndSimi, fyrirsogn, fyrirsognSimi, texti, hnappur, slod, grunnur, hnappLitur }
//   baraKostad  true = aðeins kostaða einingin (ekki ferðafyrirtæki), svo
//             ferðasvæðið og boxið eru eins og á aðalsíðunni
// Myndir fyrirtækja eru í /syni/<lykill>/.
const FYRIRTAEKI = {
  elding: {
    nafn: "Elding",
    len: "elding.is",
    gerd: { en: "Boat · Old Harbour, Reykjavík", is: "Sigling · Gamla höfnin, Reykjavík" },
    brottfor: "21:00",
    uti: ["21:00", "23:00"],
    slod: { en: "https://elding.is/tours/northern-lights", is: "https://elding.is/is/ferdir/nordurljos" },
    // Söluleið Northseek í Bókun hjá Eldingu (10% þóknun); vara 1312 = Norðurljósasigling.
    bokun: { leid: "b375a780-a9f3-4c6a-ba46-6e0be1bb15ab", vara: 1312 },
    stadur: "Reykjavík / Grótta",
    litur: "#EF4136",
    takn: "/syni/elding/takn.png",
    taknGrunnur: "#0A101C",
    merki: "/syni/elding/logo.svg",
    mynd: "/syni/elding/sigling.jpg",
    myndBreid: "/syni/elding/sigling-breid.jpg",
    auglysing: {
      fyrirsogn: { en: "Northern Lights Cruise from Reykjavík", is: "Norðurljósasigling frá Reykjavík" },
      texti: { en: "Two hours on Faxaflói bay, away from the city lights. Departs 21:00 from the Old Harbour.", is: "Tvær klukkustundir á Faxaflóa, fjarri borgarljósunum. Brottför 21:00 frá Gömlu höfninni." },
    },
  },
  guidetoiceland: {
    nafn: "Guide to Iceland",
    len: "guidetoiceland.is",
    gerd: { en: "Northern lights tours across Iceland", is: "Norðurljósaferðir um allt land" },
    slod: "https://guidetoiceland.is/book-trips-holiday/nature-tours/northern-lights",
    litur: "#336699",
    takn: "/syni/guidetoiceland/takn.png",
    taknGrunnur: "#336699",
    merki: "/syni/guidetoiceland/logo.svg",
    mynd: "/syni/guidetoiceland/nordurljos.jpg",
    auglysing: {
      fyrirsogn: { en: "Compare northern lights tours", is: "Berðu saman norðurljósaferðir" },
      texti: { en: "Small-group, super jeep and photography tours from Reykjavík, Akureyri and beyond.", is: "Smáhópar, ofurjeppar og ljósmyndaferðir frá Reykjavík, Akureyri og víðar." },
    },
  },
};

// Icewear er fataframleiðandi, ekki ferðafyrirtæki: aðeins kostaða einingin.
FYRIRTAEKI.icewear = {
  nafn: "Icewear",
  len: "icewear.is",
  baraKostad: true,
  merki: "/syni/icewear/merki.svg",
  kostad: {
    mynd: "/syni/icewear/peysa.jpg",
    myndSimi: "/syni/icewear/peysa-simi.jpg",
    grunnur: "#1F216B",
    hnappLitur: "#C10024",
    fyrirsogn: { en: "Dress for a long night under the aurora", is: "Klæddu þig fyrir langa nótt undir norðurljósum" },
    fyrirsognSimi: { en: "Warm wool for aurora nights", is: "Hlý ull fyrir norðurljósanætur" },
    texti: { en: "Icelandic wool sweaters, designed and weather-tested in Iceland since 1972.", is: "Íslenskar ullarpeysur, hannaðar og veðurprófaðar á Íslandi frá 1972." },
    hnappur: { en: "Shop wool sweaters", is: "Skoða ullarpeysur" },
    slod: { en: "https://icewear.is/en-US/women/sweaters/icelandic-wool-sweaters", is: "https://icewear.is/is-IS/konur/peysur/ullarpeysur" },
  },
};

const STADGENGLAR = [
  { nafn: "Fyrirtæki A", gerd: "Bus · large group", brottfor: "20:30", uti: ["21:15", "23:30"], verd: "from 9.990 kr", endurbokun: true, litur: "#6FF0B4" },
  { nafn: "Fyrirtæki B", gerd: "Boat · from the harbour", brottfor: "21:00", uti: ["21:00", "23:00"], verd: "from 12.900 kr", endurbokun: true, litur: "#E9C26B" },
  { nafn: "Fyrirtæki C", gerd: "Photo tour · max 8", brottfor: "20:00", uti: ["21:00", "00:30"], verd: "from 24.500 kr", litur: "#B8BFCD" },
];

const SJALFGEFID = { gerd: "Northern lights tour", brottfor: "20:30", uti: ["21:00", "23:30"], endurbokun: false, litur: "#E9C26B" };

const SYNI_TEXTAR = {
  en: {
    kicker: "Aurora tours tonight",
    partner: "Partner",
    titill: "Tours from {place} tonight",
    titillGott: "Good night for it – tours from {place}",
    titillLagt: "Low chance tonight – tours from {place}",
    gluggi: "Tonight's best window is {win}.",
    gluggiPassar: "Tonight's best window is {win}. These tours are out at that time.",
    pickup: "Pick-up",
    atSite: "At the site",
    retry: "Free retry if no lights",
    book: "Book now",
    fotur: "Partner tours. Northseek may earn a commission. The forecast is the same whether you book or not.",
    annar: "Another partner",
    augl: "Advertisement",
    auglFyrirsogn: "Northern lights tours with {name}",
    auglTexti: "Book tonight's tour directly with {name}.",
    heimsaekja: "Visit {name} →",
    bordi: "Preview · how {name} would appear on Northseek",
    bordiAlmennt: "Preview · advertising and partner placements on Northseek",
    kostad: "Sponsored",
  },
  is: {
    kicker: "Norðurljósaferðir í kvöld",
    partner: "Samstarf",
    titill: "Ferðir frá {place} í kvöld",
    titillGott: "Gott kvöld til þess – ferðir frá {place}",
    titillLagt: "Litlar líkur í kvöld – ferðir frá {place}",
    gluggi: "Besti gluggi kvöldsins er {win}.",
    gluggiPassar: "Besti gluggi kvöldsins er {win}. Þessar ferðir eru úti á þeim tíma.",
    pickup: "Sótt",
    atSite: "Á staðnum",
    retry: "Frí endurbókun ef engin ljós",
    book: "Bóka",
    fotur: "Ferðir samstarfsaðila. Northseek gæti fengið þóknun. Spáin er sú sama hvort sem þú bókar eða ekki.",
    annar: "Annar samstarfsaðili",
    augl: "Auglýsing",
    auglFyrirsogn: "{name} – norðurljósaferðir",
    auglTexti: "Bókaðu ferð kvöldsins beint hjá fyrirtækinu.",
    heimsaekja: "Nánar →",
    bordi: "Sýnishorn · svona myndi {name} birtast á Northseek",
    bordiAlmennt: "Sýnishorn · auglýsingar og samstarf á Northseek",
    kostad: "Kostað",
  },
};

function st(lykill, breytur = {}) {
  const texti = (SYNI_TEXTAR[tungumal] || SYNI_TEXTAR.en)[lykill] ?? SYNI_TEXTAR.en[lykill];
  return texti.replace(/\{(\w+)\}/g, (m, k) => (breytur[k] !== undefined ? breytur[k] : m));
}

// Nafnið getur komið beint úr slóðinni og fer í innerHTML.
function hreinsa(x) {
  return String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function lesaSyni() {
  const leit = new URLSearchParams(location.search);
  let gildi = leit.get("syni");
  let nafn = leit.get("nafn");
  try {
    if (gildi !== null) {
      sessionStorage.setItem("northseek_syni", gildi);
      sessionStorage.setItem("northseek_syni_nafn", nafn || "");
    } else {
      gildi = sessionStorage.getItem("northseek_syni");
      nafn = sessionStorage.getItem("northseek_syni_nafn");
    }
  } catch (_) {}
  gildi = (gildi || "").trim().slice(0, 60);
  if (!gildi) return null;

  const lykill = gildi.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const skrad = FYRIRTAEKI[lykill] || Object.values(FYRIRTAEKI).find((f) => f.len === lykill);
  if (skrad) return { ...SJALFGEFID, ...skrad, ...(nafn ? { nafn } : {}) };

  if (/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(lykill)) {
    return { ...SJALFGEFID, nafn: nafn || lykill, len: lykill, slod: `https://${lykill}/`, sjalfvirkt: true, nafnFast: !!nafn };
  }
  return { ...SJALFGEFID, nafn: gildi };
}

const syniFyrirtaeki = lesaSyni();

// Velja stað fyrirtækisins ef slóðin nefnir engan stað.
if (syniFyrirtaeki?.stadur && !document.documentElement.dataset.stadurNafn) {
  valinnNafn = syniFyrirtaeki.stadur;
}

// Sjálfvirk sérkenni: teiknað strax með léninu, aftur þegar þau berast.
if (syniFyrirtaeki?.sjalfvirkt) {
  fetch("/syni/merki?d=" + encodeURIComponent(syniFyrirtaeki.len))
    .then((svar) => (svar.ok ? svar.json() : null))
    .then((g) => {
      if (!g) return;
      if (g.nafn && !syniFyrirtaeki.nafnFast) syniFyrirtaeki.nafn = g.nafn;
      if (g.takn) { syniFyrirtaeki.takn = g.takn; syniFyrirtaeki.taknGrunnur = "#FFFFFF"; }
      if (g.mynd) syniFyrirtaeki.mynd = syniFyrirtaeki.myndBreid = g.mynd;
      if (g.litur) syniFyrirtaeki.litur = g.litur;
      window.syniTeikna();
    })
    .catch(() => {});
}

function ml(x) {
  return x && typeof x === "object" ? (x[tungumal] ?? x.en ?? "") : (x ?? "");
}

// Slóð sem fer inn í style="…url()": aðeins öruggir stafir.
function cssSlod(u) {
  return String(u || "").replace(/[^A-Za-z0-9\/._~:?&=%+#-]/g, "");
}

// Mínútur frá hádegi, svo nóttin sé samfelld yfir miðnætti.
function minFraHadegi(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h * 60 + (m || 0) - 720 + 1440) % 1440;
}

function skarast(a, b) {
  return Math.max(minFraHadegi(a[0]), minFraHadegi(b[0])) < Math.min(minFraHadegi(a[1]), minFraHadegi(b[1]));
}

function upphafsstafir(nafn) {
  return nafn.split(/\s+/).filter(Boolean).slice(0, 2).map((o) => o[0].toUpperCase()).join("") || "?";
}

function bokunarSlod(f) {
  if (!f.slod) return null;
  try {
    const u = new URL(ml(f.slod));
    u.searchParams.set("utm_source", "northseek");
    u.searchParams.set("utm_medium", "partner");
    u.searchParams.set("utm_campaign", (valinn?.id || "").replace(/_/g, "-"));
    return u.toString();
  } catch (_) {
    return null;
  }
}

// Fyrirtæki með söluleið í Bókun: „Book now“ opnar bókunarglugga Bókun
// beint á Northseek, svo bókunin skráist á söluleið Northseek. Skriftan er
// aðeins sótt einu sinni; Bókun finnur nýja hnappa sjálft þegar kortin eru
// teiknuð upp á nýtt.
const BOKUN_SKRIFTA = "https://widgets.bokun.io/assets/javascripts/apps/build/BokunWidgetsLoader.js";

function bokunHnappur(f, klasi, texti) {
  const slod = `https://widgets.bokun.io/online-sales/${f.bokun.leid}/experience-calendar/${f.bokun.vara}?partialView=1`;
  return `<button type="button" class="${klasi} bokunButton" data-src="${hreinsa(slod)}">${texti}</button>`;
}

function saekjaBokun(f) {
  if (!f?.bokun || document.querySelector(`script[src^="${BOKUN_SKRIFTA}"]`)) return;
  const s = document.createElement("script");
  s.src = `${BOKUN_SKRIFTA}?bookingChannelUUID=${encodeURIComponent(f.bokun.leid)}`;
  s.async = true;
  document.body.appendChild(s);
}

function taknHtml(f) {
  return f.takn
    ? `<span class="syni-logo med-mynd" style="background:${hreinsa(f.taknGrunnur || "#FFFFFF")}"><img src="${hreinsa(f.takn)}" alt="" loading="lazy" onerror="this.parentNode.style.background='${hreinsa(f.litur)}';this.replaceWith('${hreinsa(upphafsstafir(f.nafn)).replace(/'/g, "")}')"></span>`
    : `<span class="syni-logo" style="background:${hreinsa(f.litur)}">${hreinsa(upphafsstafir(f.nafn))}</span>`;
}

// Eitt fyrirtæki í línu: mynd, nafn og tegund, svo bókunarhnappur.
// Brottfarar- og staðartímar eru ekki sýndir (aðeins notaðir í FYRIRTAEKI til minnis).
function ferdakort(f, daufur) {
  const slod = bokunarSlod(f);
  const hnappur = f.bokun
    ? bokunHnappur(f, "syni-boka", st("book"))
    : slod
    ? `<a class="syni-boka" href="${hreinsa(slod)}" target="_blank" rel="sponsored noopener">${st("book")}</a>`
    : `<span class="syni-boka" role="presentation">${st("book")}</span>`;
  const graent = f.eiginleiki ? ml(f.eiginleiki) : f.endurbokun ? st("retry") : "";
  return `
    <article class="syni-ferd${daufur ? " daufur" : ""}${f.mynd ? " med-mynd" : ""}">
      ${f.mynd ? `<div class="syni-ferd-mynd" style="background-image:url('${cssSlod(f.mynd)}')"></div>` : ""}
      <div class="syni-midja">
        <div class="syni-fyrirtaeki">
          ${taknHtml(f)}
          <div><div class="syni-nafn">${hreinsa(f.nafn)}</div><div class="syni-gerd">${hreinsa(ml(f.gerd))}</div></div>
        </div>
        ${graent ? `<span class="syni-trygging">${hreinsa(graent)}</span>` : ""}
      </div>
      <div class="syni-nedst">
        ${f.verd ? `<span class="syni-verd">${hreinsa(ml(f.verd))}</span>` : ""}
        ${hnappur}
      </div>
    </article>`;
}

function ferdirHtml() {
  const s = valinn;
  const gluggi = s.gluggiFra >= 0
    ? [String(nott.klst[s.gluggiFra]).padStart(2, "0") + ":00", klstLokTexti(s.gluggiTil)]
    : null;

  const ferdir = syniFyrirtaeki
    ? [syniFyrirtaeki, { ...STADGENGLAR[0], nafn: st("annar"), verd: "" }]
    : STADGENGLAR.slice(0, 2);

  const einkunn = s.best;
  const titill = einkunn >= 0.6 ? st("titillGott", { place: s.nafn })
    : einkunn < 0.25 ? st("titillLagt", { place: s.nafn })
    : st("titill", { place: s.nafn });

  const win = gluggi ? `<b>${gluggi[0]}–${gluggi[1]}</b>` : null;
  const tenging = win ? st("gluggi", { win }) : "";

  return `
    <div class="syni-haus">
      <span class="syni-kicker">${st("kicker")}</span>
      <span class="syni-merki">${st("partner")}</span>
    </div>
    <h2 class="syni-titill">${hreinsa(titill)}</h2>
    ${tenging ? `<p class="syni-tenging">${tenging}</p>` : ""}
    <div class="syni-rod">
      ${ferdir.map((f, i) => ferdakort(f, syniFyrirtaeki && i > 0)).join("")}
    </div>
`;
}

function auglysingHtml() {
  const f = syniFyrirtaeki || { nafn: "Dæmi Gisting", auglysing: { fyrirsogn: "Warm cabins under dark skies", texti: "Stay outside the city lights. 15% off for Northseek visitors." } };
  const nafn = hreinsa(f.nafn);
  const slod = f.slod ? bokunarSlod(f) : null;
  const tengill = slod
    ? `<a class="syni-utlinur" href="${hreinsa(slod)}" target="_blank" rel="sponsored noopener">${st("heimsaekja", { name: nafn })}</a>`
    : `<span class="syni-utlinur">${st("heimsaekja", { name: nafn })}</span>`;
  const mynd = f.myndBreid || f.mynd;
  const yfir = f.merki
    ? `<img class="syni-mynd-merki" src="${hreinsa(f.merki)}" alt="${nafn}">`
    : f.takn
      ? taknHtml(f)
      : `<span>${hreinsa(upphafsstafir(f.nafn))}</span>`;
  return `
    <span class="syni-lbl">${st("augl")}</span>
    <div class="syni-mynd${mynd ? " med-mynd" : ""}" role="img" aria-label="${nafn}"${mynd ? ` style="background-image:url('${cssSlod(mynd)}')"` : ""}>${yfir}</div>
    <span class="syni-fyr">${f.auglysing?.fyrirsogn ? hreinsa(ml(f.auglysing.fyrirsogn)) : st("auglFyrirsogn", { name: nafn })}</span>
    <span class="syni-lysing">${f.auglysing?.texti ? hreinsa(ml(f.auglysing.texti)) : st("auglTexti", { name: nafn })}</span>
    ${tengill}`;
}

// Kostuð eining undir hausnum: öll einingin er einn tengill.
function kostadSlod(k) {
  try {
    const u = new URL(ml(k.slod));
    u.searchParams.set("utm_source", "northseek");
    u.searchParams.set("utm_medium", "sponsored");
    u.searchParams.set("utm_campaign", "haus");
    return u.toString();
  } catch (_) {
    return null;
  }
}

function kostadHtml(f) {
  const k = f.kostad;
  const slod = kostadSlod(k);
  const nafn = hreinsa(f.nafn);
  const innihald = `
      <span class="syni-kostad-mynd" style="background-image:url('${cssSlod(k.mynd)}')"></span>
      <span class="syni-kostad-mynd simi" style="background-image:url('${cssSlod(k.myndSimi || k.mynd)}')"></span>
      <span class="syni-kostad-texti" style="background:${hreinsa(k.grunnur || "#16202F")}">
        ${f.merki ? `<img class="syni-kostad-merki" src="${hreinsa(f.merki)}" alt="${nafn}">` : `<span class="syni-kostad-nafn">${nafn}</span>`}
        <span class="syni-kostad-fyr">${hreinsa(ml(k.fyrirsogn))}</span>
        <span class="syni-kostad-fyr simi">${hreinsa(ml(k.fyrirsognSimi || k.fyrirsogn))}</span>
        <span class="syni-kostad-lysing">${hreinsa(ml(k.texti))}</span>
        <span class="syni-kostad-hnappur" style="background:${hreinsa(k.hnappLitur || "#E9C26B")}">${hreinsa(ml(k.hnappur))} →</span>
      </span>`;
  return `
    <p class="syni-kostad-lbl">${st("kostad")}</p>
    ${slod
      ? `<a class="syni-kostad-eining" href="${hreinsa(slod)}" target="_blank" rel="sponsored noopener" aria-label="${nafn}: ${hreinsa(ml(k.fyrirsogn))}">${innihald}</a>`
      : `<div class="syni-kostad-eining">${innihald}</div>`}`;
}

function syniKostad() {
  let kostad = document.getElementById("syni-kostad");
  if (!syniFyrirtaeki?.kostad) {
    kostad?.remove();
    return;
  }
  if (!kostad) {
    kostad = document.createElement("aside");
    kostad.id = "syni-kostad";
    document.querySelector(".wrap > header").after(kostad);
  }
  kostad.setAttribute("aria-label", st("kostad"));
  kostad.innerHTML = kostadHtml(syniFyrirtaeki);
}

function syniBordi() {
  let bordi = document.getElementById("syni-bordi");
  if (!bordi) {
    bordi = document.createElement("div");
    bordi.id = "syni-bordi";
    document.body.prepend(bordi);
  }
  bordi.innerHTML = syniFyrirtaeki
    ? st("bordi", { name: `<b>${hreinsa(syniFyrirtaeki.nafn)}</b>` })
    : st("bordiAlmennt");
}

window.syniTeikna = function () {
  if (!valinn || !nott) return;
  syniBordi();
  syniKostad();

  // Aðeins kostuð eining: ferðasvæðið og boxið eins og á aðalsíðunni.
  document.documentElement.classList.toggle("syni-bara-kostad", !!syniFyrirtaeki?.baraKostad);
  if (syniFyrirtaeki?.baraKostad) {
    document.getElementById("syni-ferdir")?.remove();
    return;
  }

  let ferdir = document.getElementById("syni-ferdir");
  if (!ferdir) {
    ferdir = document.createElement("section");
    ferdir.id = "syni-ferdir";
    ferdir.setAttribute("aria-label", "Partner tours");
    document.getElementById("geimvedur").after(ferdir);
  }
  ferdir.innerHTML = ferdirHtml();
  saekjaBokun(syniFyrirtaeki);

  // teikna() byggir listann upp á nýtt, svo boxið er sett inn í hvert sinn.
  const listi = document.getElementById("listi");
  const augl = document.createElement("aside");
  augl.className = "syni-augl";
  augl.setAttribute("aria-label", st("augl"));
  augl.innerHTML = auglysingHtml();
  listi.insertBefore(augl, listi.children[7] || null);
};

// Kostaða einingin þarf engin spágögn: teiknuð strax svo síðan hoppi ekki.
syniKostad();

// Teikna strax ef gögnin komu á undan þessari skrá.
window.syniTeikna();
