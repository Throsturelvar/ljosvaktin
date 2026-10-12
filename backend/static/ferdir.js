// „Aurora tours tonight“: samstarfssvæði fyrir neðan Next hour.
//
// Þar til ferðafyrirtæki kaupa plássið eru hlekkirnir þóknunarhlekkir
// Guide to Iceland. Hlekkirnir fara um /go/gti?k=<lykill>&s=<staður>, sem
// telur smellinn og framsendir (sjá GTI_SLODIR í worker.js).
//
// Tvö spjöld eftir landshluta valins staðar og bílaleiga á næstu stöð. Nýtt spjald: bæta við SPJOLD
// hér, mynd í /images/gti/<lykill>.jpg, slóð í GTI_SLODIR í worker.js og texta í /i18n/*.json (+ en í index.html).
//
// index.html kallar á window.ferdirTeikna() í lok teikna(); hér eru notaðar
// víðværu breyturnar valinn og t() þaðan.

(function () {
  const SPJOLD = {
    reykjavik: { titill: "gtiReykjavik", hnappur: "toursBook" },
    sigling: { titill: "gtiBoat", hnappur: "toursBook" },
    akureyri: { titill: "gtiAkureyri", hnappur: "toursBook" },
    gisting: { titill: "gtiHotels", hnappur: "toursSeeStays" },
    allar: { titill: "gtiAll", hnappur: "toursBook" },
  };

  // Þriðja spjaldið: bílaleiga GTI á næstu afhendingarstöð við valinn stað
  // (beinlínufjarlægð). Frá Suðausturlandi og Vestfjörðum er styttra að aka
  // til Reykjavíkur en beina línan segir, svo Akureyri er ekki í boði þar.
  // Fjarlægð er bara sýnd þegar hún er stutt, því beina línan vanmetur akstur.
  // Allar nota sömu mynd, /images/gti/bill.jpg.
  const BILALEIGUR = [
    { lykill: "bill_kef", titill: "gtiCarKef", lat: 63.985, lon: -22.6056 },
    { lykill: "bill_rvk", titill: "gtiCarRvk", lat: 64.1466, lon: -21.9426 },
    { lykill: "bill_aey", titill: "gtiCarAey", lat: 65.6835, lon: -18.1002 },
  ];

  function km(a, b) {
    const r = Math.PI / 180;
    const x = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
      Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(x));
  }

  function naestaBilaleiga(stadur) {
    const kostir = /^(Suðausturland|Vestfirðir)$/.test(stadur.hluti || "")
      ? BILALEIGUR.filter((b) => b.lykill !== "bill_aey")
      : BILALEIGUR;
    const b = kostir.reduce((x, y) => (km(stadur, y) < km(stadur, x) ? y : x));
    const fjarlaegd = Math.round(km(stadur, b) / 5) * 5;
    return {
      lykill: b.lykill,
      titill: t(b.titill),
      undir: fjarlaegd < 15 ? t("gtiCarNear") : fjarlaegd <= 60 ? t("gtiCarRoam", { km: fjarlaegd }) : t("gtiCarDrive"),
      hnappur: t("toursSeeCars"),
      mynd: "bill",
    };
  }

  function spjoldFyrir(hluti) {
    if (/^Norðurland/.test(hluti)) return ["akureyri", "gisting"];
    if (/^(Höfuðborgarsvæðið|Reykjanes|Suðurnes|Suðurland|Vesturland)$/.test(hluti)) return ["reykjavik", "sigling"];
    return ["gisting", "allar"];
  }

  const hreinsa = (x) =>
    String(x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // Hvert spjald hefur sína mynd í /images/gti/<lykill>.jpg (myndir frá GTI).
  function spjald(s, stadurId) {
    const slod = `/go/gti?k=${s.lykill}&s=${encodeURIComponent(stadurId)}`;
    return `
      <article class="ferd">
        <div class="ferd-mynd" role="presentation" style="background-image:url('/images/gti/${s.mynd}.jpg')"></div>
        <div class="ferd-midja">
          <img class="ferd-takn" src="/images/gti/takn.png" alt="" width="34" height="34" loading="lazy">
          <div>
            <div class="ferd-nafn">${hreinsa(s.titill)}</div>
            <div class="ferd-gerd">${hreinsa(s.undir)}</div>
          </div>
        </div>
        <a class="ferd-boka" href="${slod}" target="_blank" rel="sponsored noopener">${hreinsa(s.hnappur)}</a>
      </article>`;
  }

  function spjoldin() {
    const ferdir = spjoldFyrir(valinn.hluti || "").map((lykill) => ({
      lykill,
      titill: t(SPJOLD[lykill].titill),
      undir: "Guide to Iceland",
      hnappur: t(SPJOLD[lykill].hnappur),
      mynd: lykill,
    }));
    if (Number.isFinite(valinn.lat) && Number.isFinite(valinn.lon)) ferdir.push(naestaBilaleiga(valinn));
    return ferdir;
  }

  window.ferdirTeikna = function () {
    if (typeof valinn === "undefined" || !valinn) return;
    const geimvedur = document.getElementById("geimvedur");
    if (!geimvedur) return;

    let svaedi = document.getElementById("ferdir");
    if (!svaedi) {
      svaedi = document.createElement("section");
      svaedi.id = "ferdir";
      svaedi.setAttribute("aria-labelledby", "ferdir-titill");
      geimvedur.after(svaedi);
    }

    svaedi.innerHTML = `
      <div class="ferdir-haus">
        <span class="ferdir-kicker">${hreinsa(t("toursKicker"))}</span>
        <span class="ferdir-merki">${hreinsa(t("toursPartner"))}</span>
      </div>
      <h2 class="ferdir-titill" id="ferdir-titill">${hreinsa(t("toursTitle", { place: valinn.nafn }))}</h2>
      <div class="ferdir-rod">
        ${spjoldin().map((s) => spjald(s, valinn.id)).join("")}
      </div>
      <p class="ferdir-fotur">${hreinsa(t("toursDisclosure"))}</p>`;
  };

  // Teikna strax ef gögnin komu á undan þessari skrá.
  window.ferdirTeikna();
})();
