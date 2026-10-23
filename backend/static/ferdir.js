// „Aurora tours tonight“: samstarfssvæði fyrir neðan Next hour.
//
// Þar til ferðafyrirtæki kaupa plássið eru hlekkirnir þóknunarhlekkir
// Guide to Iceland. Hlekkirnir fara um /go/gti?k=<lykill>&s=<staður>, sem
// telur smellinn og framsendir (sjá GTI_SLODIR í worker.js).
//
// Þrjú spjöld eftir landshluta valins staðar. Nýtt spjald: bæta við SPJOLD
// hér, mynd í /images/gti/<lykill>.jpg, slóð í GTI_SLODIR í worker.js og texta í /i18n/*.json (+ en í index.html).
//
// index.html kallar á window.ferdirTeikna() í lok teikna(); hér eru notaðar
// víðværu breyturnar valinn og t() þaðan.

(function () {
  // Elding selur Norðurljósasiglinguna beint: „Bóka“ opnar bókunarglugga
  // Bókun á síðunni, á söluleið Northseek (10% þóknun, sjá samning).
  // Smellir eru taldir með /go/smellur (sjá worker.js).
  const ELDING = { leid: "b375a780-a9f3-4c6a-ba46-6e0be1bb15ab", vara: 1312 };
  const BOKUN_SKRIFTA = "https://widgets.bokun.io/assets/javascripts/apps/build/BokunWidgetsLoader.js";

  const SPJOLD = {
    elding: { titill: "gtiBoat", hnappur: "toursBook", undirNafn: "Elding", myndSlod: "/images/elding/sigling.jpg", takn: "/images/elding/takn.png", taknGrunnur: "#0A101C", bokun: ELDING },
    reykjavik: { titill: "gtiReykjavik", hnappur: "toursBook" },
    sigling: { titill: "gtiBoat", hnappur: "toursBook" },
    akureyri: { titill: "gtiAkureyri", hnappur: "toursBook" },
    gisting: { titill: "gtiHotels", hnappur: "toursSeeStays" },
    allar: { titill: "gtiAll", hnappur: "toursBook" },
    // Þriðja spjaldið: norðurljósapakkar með bíl og gistingu (8% þóknun).
    pakki_sudur: { titill: "gtiTripSouth", hnappur: "toursSeeTrip", undir: "gtiTripSub", mynd: "bill" },
    pakki_hringur: { titill: "gtiTripRing", hnappur: "toursSeeTrip", undir: "gtiTripSub", mynd: "bill" },
  };

  function spjoldFyrir(hluti) {
    if (/^Norðurland/.test(hluti)) return ["akureyri", "gisting", "pakki_hringur"];
    if (/^(Höfuðborgarsvæðið|Reykjanes|Suðurnes|Suðurland|Vesturland)$/.test(hluti)) return ["elding", "reykjavik", "pakki_sudur"];
    return ["gisting", "allar", "pakki_hringur"];
  }

  const hreinsa = (x) =>
    String(x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // Bókunarhnappur Bókun: Bókun finnur nýja .bokunButton-hnappa sjálft þegar
  // spjöldin eru teiknuð upp á nýtt, svo skriftan er aðeins sótt einu sinni.
  function bokunHnappur(s, stadurId) {
    const slod = `https://widgets.bokun.io/online-sales/${s.bokun.leid}/experience-calendar/${s.bokun.vara}?partialView=1`;
    return `<button type="button" class="ferd-boka bokunButton" data-src="${hreinsa(slod)}" data-ferd="${s.lykill}" data-stadur="${hreinsa(stadurId)}">${hreinsa(s.hnappur)}</button>`;
  }

  function saekjaBokun(leid) {
    if (document.querySelector(`script[src^="${BOKUN_SKRIFTA}"]`)) return;
    const skrifta = document.createElement("script");
    skrifta.src = `${BOKUN_SKRIFTA}?bookingChannelUUID=${encodeURIComponent(leid)}`;
    skrifta.async = true;
    document.body.appendChild(skrifta);
  }

  // Smellur á bókunarhnapp er talinn án þess að tefja bókunargluggann.
  document.addEventListener("click", (e) => {
    const takki = e.target.closest?.("#ferdir .bokunButton[data-ferd]");
    if (!takki) return;
    try {
      navigator.sendBeacon(`/go/smellur?f=${encodeURIComponent(takki.dataset.ferd)}&s=${encodeURIComponent(takki.dataset.stadur || "")}`);
    } catch (_) {}
  });

  // Hvert spjald hefur sína mynd í /images/gti/<lykill>.jpg (myndir frá GTI),
  // nema það hafi eigin myndSlod og takn.
  function spjald(s, stadurId) {
    const slod = `/go/gti?k=${s.lykill}&s=${encodeURIComponent(stadurId)}`;
    const hnappur = s.bokun
      ? bokunHnappur(s, stadurId)
      : `<a class="ferd-boka" href="${slod}" target="_blank" rel="sponsored noopener">${hreinsa(s.hnappur)}</a>`;
    return `
      <article class="ferd">
        <div class="ferd-mynd" role="presentation" style="background-image:url('${s.myndSlod}')"></div>
        <div class="ferd-midja">
          <img class="ferd-takn" src="${s.takn}"${s.taknGrunnur ? ` style="background:${s.taknGrunnur}"` : ""} alt="" width="34" height="34" loading="lazy">
          <div>
            <div class="ferd-nafn">${hreinsa(s.titill)}</div>
            <div class="ferd-gerd">${hreinsa(s.undir)}</div>
          </div>
        </div>
        ${hnappur}
      </article>`;
  }

  function spjoldin() {
    return spjoldFyrir(valinn.hluti || "").map((lykill) => {
      const s = SPJOLD[lykill];
      return {
        lykill,
        titill: t(s.titill),
        undir: s.undir ? t(s.undir) : s.undirNafn || "Guide to Iceland",
        hnappur: t(s.hnappur),
        myndSlod: s.myndSlod || `/images/gti/${s.mynd || lykill}.jpg`,
        takn: s.takn || "/images/gti/takn.png",
        taknGrunnur: s.taknGrunnur,
        bokun: s.bokun,
      };
    });
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

    const spjold = spjoldin();
    const medBokun = spjold.find((s) => s.bokun);
    if (medBokun) saekjaBokun(medBokun.bokun.leid);

    svaedi.innerHTML = `
      <div class="ferdir-haus">
        <span class="ferdir-kicker">${hreinsa(t("toursKicker"))}</span>
        <span class="ferdir-merki">${hreinsa(t("toursPartner"))}</span>
      </div>
      <h2 class="ferdir-titill" id="ferdir-titill">${hreinsa(t("toursTitle", { place: valinn.nafn }))}</h2>
      <div class="ferdir-rod">
        ${spjold.map((s) => spjald(s, valinn.id)).join("")}
      </div>
      <p class="ferdir-fotur">${hreinsa(t("toursDisclosure"))}</p>`;
  };

  // Teikna strax ef gögnin komu á undan þessari skrá.
  window.ferdirTeikna();
})();
