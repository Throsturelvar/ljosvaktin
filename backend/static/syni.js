// Sýnishorn auglýsingasvæða (aðeins á grein auglysingar-syni, fer ekki í main).
//
// Slóðin ?syni=<lykill eða nafn> setur fyrirtæki inn í bæði svæðin:
//   1. „Aurora tours tonight“ fyrir neðan Next hour (samstarf með Book now)
//   2. Auglýsingabox í 8. reit staðanetsins
// Lykill úr FYRIRTAEKI gefur skráðar upplýsingar; annað er notað sem nafn
// með sjálfgefnum gildum, t.d. ?syni=Arctic%20Trip. Án ?syni birtast
// staðgenglar (Fyrirtæki A/B/C). Valið geymist í sessionStorage því
// staðarval og tungumálaval skipta um slóð án leitarstrengs.
//
// index.html kallar á window.syniTeikna() í lok teikna(); hér eru notaðar
// víðværu breyturnar valinn, nott, tungumal og klstLokTexti þaðan.

// Nýtt fyrirtæki: bæta við færslu. Allir reitir nema nafn eru valfrjálsir.
//   gerd      ferðategund og brottfararstaður (enska)
//   brottfor  sótt / brottför, "HH:MM"
//   uti       tíminn á staðnum, ["HH:MM", "HH:MM"]; borið saman við besta gluggann
//   verd      t.d. "from 12.990 kr"; sleppt ef tómt
//   endurbokun  true = „Free retry if no lights“
//   slod      bókunarsíða
//   stadur    staður sem er valinn sjálfkrafa (nafn eins og í /api/vakt)
//   litur     litur merkisins
//   auglysing { fyrirsogn, texti } fyrir boxið
const FYRIRTAEKI = {
  elding: {
    nafn: "Elding",
    gerd: "Boat · Reykjavík Old Harbour",
    brottfor: "21:00",
    uti: ["21:00", "23:00"],
    endurbokun: true,
    slod: "https://elding.is/is/ferdir/nordurljos",
    stadur: "Reykjavík / Grótta",
    litur: "#5FB4E6",
  },
};

const STADGENGLAR = [
  { nafn: "Fyrirtæki A", gerd: "Bus · large group", brottfor: "20:30", uti: ["21:15", "23:30"], verd: "from 9.990 kr", endurbokun: true, litur: "#6FF0B4" },
  { nafn: "Fyrirtæki B", gerd: "Boat · from the harbour", brottfor: "21:00", uti: ["21:00", "23:00"], verd: "from 12.900 kr", endurbokun: true, litur: "#E9C26B" },
  { nafn: "Fyrirtæki C", gerd: "Photo tour · max 8", brottfor: "20:00", uti: ["21:00", "00:30"], verd: "from 24.500 kr", litur: "#B8BFCD" },
];

const SJALFGEFID = { gerd: "Northern lights tour", brottfor: "20:30", uti: ["21:00", "23:30"], endurbokun: true, litur: "#E9C26B" };

const SYNI_TEXTAR = {
  en: {
    kicker: "Aurora tours tonight",
    partner: "Partner",
    titill: "Tours from {place} tonight",
    titillGott: "Good night for it – tours from {place}",
    titillLagt: "Low chance tonight – tours with free retry",
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
  },
  is: {
    kicker: "Norðurljósaferðir í kvöld",
    partner: "Samstarf",
    titill: "Ferðir frá {place} í kvöld",
    titillGott: "Gott kvöld til þess – ferðir frá {place}",
    titillLagt: "Litlar líkur í kvöld – ferðir með fríri endurbókun",
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
  let gildi = new URLSearchParams(location.search).get("syni");
  try {
    if (gildi !== null) sessionStorage.setItem("northseek_syni", gildi);
    else gildi = sessionStorage.getItem("northseek_syni");
  } catch (_) {}
  gildi = (gildi || "").trim().slice(0, 60);
  if (!gildi) return null;
  const skrad = FYRIRTAEKI[gildi.toLowerCase()];
  return { ...SJALFGEFID, ...(skrad || { nafn: gildi }) };
}

const syniFyrirtaeki = lesaSyni();

// Velja stað fyrirtækisins ef slóðin nefnir engan stað.
if (syniFyrirtaeki?.stadur && !document.documentElement.dataset.stadurNafn) {
  valinnNafn = syniFyrirtaeki.stadur;
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
    const u = new URL(f.slod);
    u.searchParams.set("utm_source", "northseek");
    u.searchParams.set("utm_medium", "partner");
    u.searchParams.set("utm_campaign", (valinn?.id || "").replace(/_/g, "-"));
    return u.toString();
  } catch (_) {
    return null;
  }
}

function ferdakort(f, gluggi, daufur) {
  const passar = gluggi && f.uti && skarast(f.uti, gluggi);
  const slod = bokunarSlod(f);
  const hnappur = slod
    ? `<a class="syni-boka" href="${hreinsa(slod)}" target="_blank" rel="sponsored noopener">${st("book")}</a>`
    : `<span class="syni-boka" role="presentation">${st("book")}</span>`;
  return `
    <article class="syni-ferd${daufur ? " daufur" : ""}">
      <div class="syni-fyrirtaeki">
        <span class="syni-logo" style="background:${hreinsa(f.litur)}">${hreinsa(upphafsstafir(f.nafn))}</span>
        <div><div class="syni-nafn">${hreinsa(f.nafn)}</div><div class="syni-gerd">${hreinsa(f.gerd)}</div></div>
      </div>
      <div class="syni-linur">
        ${f.brottfor ? `<div><span>${st("pickup")}</span><span>${hreinsa(f.brottfor)}</span></div>` : ""}
        ${f.uti ? `<div><span>${st("atSite")}</span><span class="${passar ? "passar" : ""}">${hreinsa(f.uti[0])}–${hreinsa(f.uti[1])}</span></div>` : ""}
      </div>
      ${f.endurbokun ? `<span class="syni-trygging">${st("retry")}</span>` : ""}
      <div class="syni-nedst">
        <span class="syni-verd">${f.verd ? hreinsa(f.verd) : ""}</span>
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
    ? [syniFyrirtaeki, { ...STADGENGLAR[0], nafn: st("annar"), verd: "" }, { ...STADGENGLAR[2], nafn: st("annar"), verd: "" }]
    : STADGENGLAR;

  const einkunn = s.best;
  const titill = einkunn >= 0.6 ? st("titillGott", { place: s.nafn })
    : einkunn < 0.25 ? st("titillLagt")
    : st("titill", { place: s.nafn });

  const win = gluggi ? `<b>${gluggi[0]}–${gluggi[1]}</b>` : null;
  const einhverPassar = gluggi && ferdir.some((f) => f.uti && skarast(f.uti, gluggi));
  const tenging = win ? st(einhverPassar ? "gluggiPassar" : "gluggi", { win }) : "";

  return `
    <div class="syni-haus">
      <span class="syni-kicker">${st("kicker")}</span>
      <span class="syni-merki">${st("partner")}</span>
    </div>
    <h2 class="syni-titill">${hreinsa(titill)}</h2>
    ${tenging ? `<p class="syni-tenging">${tenging}</p>` : ""}
    <div class="syni-rod">
      ${ferdir.map((f, i) => ferdakort(f, gluggi, syniFyrirtaeki && i > 0)).join("")}
    </div>
    <p class="syni-fotur">${st("fotur")}</p>`;
}

function auglysingHtml() {
  const f = syniFyrirtaeki || { nafn: "Dæmi Gisting", auglysing: { fyrirsogn: "Warm cabins under dark skies", texti: "Stay outside the city lights. 15% off for Northseek visitors." } };
  const nafn = hreinsa(f.nafn);
  const slod = f.slod ? hreinsa(bokunarSlod(f)) : null;
  const tengill = slod
    ? `<a class="syni-utlinur" href="${slod}" target="_blank" rel="sponsored noopener">${st("heimsaekja", { name: nafn })}</a>`
    : `<span class="syni-utlinur">${st("heimsaekja", { name: nafn })}</span>`;
  return `
    <span class="syni-lbl">${st("augl")}</span>
    <div class="syni-mynd" role="img" aria-label="${nafn}"><span>${hreinsa(upphafsstafir(f.nafn))}</span></div>
    <span class="syni-fyr">${f.auglysing?.fyrirsogn ? hreinsa(f.auglysing.fyrirsogn) : st("auglFyrirsogn", { name: nafn })}</span>
    <span class="syni-lysing">${f.auglysing?.texti ? hreinsa(f.auglysing.texti) : st("auglTexti", { name: nafn })}</span>
    ${tengill}`;
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

  let ferdir = document.getElementById("syni-ferdir");
  if (!ferdir) {
    ferdir = document.createElement("section");
    ferdir.id = "syni-ferdir";
    ferdir.setAttribute("aria-label", "Partner tours");
    document.getElementById("geimvedur").after(ferdir);
  }
  ferdir.innerHTML = ferdirHtml();

  // teikna() byggir listann upp á nýtt, svo boxið er sett inn í hvert sinn.
  const listi = document.getElementById("listi");
  const augl = document.createElement("aside");
  augl.className = "syni-augl";
  augl.setAttribute("aria-label", st("augl"));
  augl.innerHTML = auglysingHtml();
  listi.insertBefore(augl, listi.children[7] || null);
};

// Teikna strax ef gögnin komu á undan þessari skrá.
window.syniTeikna();
