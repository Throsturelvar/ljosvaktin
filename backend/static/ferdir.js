// „Aurora tours tonight“: samstarfssvæði fyrir neðan Next hour.
//
// Þar til ferðafyrirtæki kaupa plássið eru hlekkirnir þóknunarhlekkir
// Guide to Iceland. Hlekkirnir fara um /go/gti?k=<lykill>&s=<staður>, sem
// telur smellinn og framsendir (sjá GTI_SLODIR í worker.js).
//
// Tvö spjöld eftir landshluta valins staðar. Nýtt spjald: bæta við SPJOLD
// hér, slóð í GTI_SLODIR í worker.js og texta í /i18n/*.json (+ en í index.html).
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

  function spjoldFyrir(hluti) {
    if (/^Norðurland/.test(hluti)) return ["akureyri", "gisting"];
    if (/^(Höfuðborgarsvæðið|Reykjanes|Suðurnes|Suðurland|Vesturland)$/.test(hluti)) return ["reykjavik", "sigling"];
    return ["gisting", "allar"];
  }

  const hreinsa = (x) =>
    String(x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function spjald(lykill, stadurId, medMynd) {
    const s = SPJOLD[lykill];
    const slod = `/go/gti?k=${lykill}&s=${encodeURIComponent(stadurId)}`;
    return `
      <article class="ferd${medMynd ? " med-mynd" : ""}">
        ${medMynd ? '<div class="ferd-mynd" role="presentation"></div>' : ""}
        <div class="ferd-midja">
          <img class="ferd-takn" src="/images/gti/takn.png" alt="" width="34" height="34" loading="lazy">
          <div>
            <div class="ferd-nafn">${hreinsa(t(s.titill))}</div>
            <div class="ferd-gerd">Guide to Iceland</div>
          </div>
        </div>
        <a class="ferd-boka" href="${slod}" target="_blank" rel="sponsored noopener">${hreinsa(t(s.hnappur))}</a>
      </article>`;
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
        ${spjoldFyrir(valinn.hluti || "").map((k, i) => spjald(k, valinn.id, i === 0)).join("")}
      </div>
      <p class="ferdir-fotur">${hreinsa(t("toursDisclosure"))}</p>`;
  };

  // Teikna strax ef gögnin komu á undan þessari skrá.
  window.ferdirTeikna();
})();
