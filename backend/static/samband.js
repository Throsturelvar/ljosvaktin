// Tillögur að „Contact us“ ofarlega á síðunni (aðeins á grein auglysingar-syni).
//
// ?samband=a|b|c|d velur útfærslu (geymt í sessionStorage eins og ?syni):
//   a  tengill í valmynd haussins
//   b  mjór borði fyrir ofan hausinn
//   c  lína undir inngangstextanum
//   d  hnappur í haus sem opnar lítinn glugga með netfangi og „Afrita“
// Neðst til vinstri er rofi til að skipta á milli tillagna.

(function () {
  const NETFANG = ["northseeknet", "gmail.com"].join("@");
  const MAL = typeof tungumal === "string" && tungumal === "is" ? "is" : "en";
  const T = {
    en: {
      tengill: "Contact",
      bordi: "Tour operator, press or feedback?",
      inngangur: "Questions, tips or partnerships? Write to us at",
      gluggi: "Questions, feedback or partnerships – we read every email.",
      afrita: "Copy",
      afritad: "Copied",
      rofi: "Contact proposal",
    },
    is: {
      tengill: "Hafa samband",
      bordi: "Ferðaþjónusta, fjölmiðlar eða ábending?",
      inngangur: "Spurningar, ábendingar eða samstarf? Skrifaðu okkur á",
      gluggi: "Spurningar, ábendingar eða samstarf – við lesum allan póst.",
      afrita: "Afrita",
      afritad: "Afritað",
      rofi: "Tillaga að sambandi",
    },
  }[MAL];

  const UMSLAG = '<svg class="samband-umslag" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="1.5"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg>';
  const POSTUR = `mailto:${NETFANG}?subject=${encodeURIComponent("Northseek")}`;

  function lesaVal() {
    const leit = new URLSearchParams(location.search).get("samband");
    let val = leit;
    try {
      if (leit) sessionStorage.setItem("northseek_samband", leit);
      else val = sessionStorage.getItem("northseek_samband");
    } catch (_) {}
    return /^[abcd]$/.test(val || "") ? val : "a";
  }

  function afritaHnappur() {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "samband-afrita";
    b.textContent = T.afrita;
    b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(NETFANG); } catch (_) { return; }
      b.textContent = T.afritad;
      setTimeout(() => { b.textContent = T.afrita; }, 1600);
    });
    return b;
  }

  const smidir = {
    a() {
      const nav = document.querySelector("header nav");
      if (!nav) return;
      const a = document.createElement("a");
      a.href = POSTUR;
      a.className = "samband-a";
      a.innerHTML = UMSLAG + `<span>${T.tengill}</span>`;
      nav.append(a);
    },
    b() {
      const haus = document.querySelector("header");
      if (!haus) return;
      const d = document.createElement("div");
      d.className = "samband-b";
      d.innerHTML = `<span>${T.bordi}</span> <a href="${POSTUR}">${UMSLAG}${NETFANG}</a>`;
      haus.before(d);
    },
    c() {
      const inn = document.querySelector(".hero-copy");
      if (!inn) return;
      const p = document.createElement("p");
      p.className = "samband-c";
      p.innerHTML = `${UMSLAG}<span>${T.inngangur} <a href="${POSTUR}">${NETFANG}</a></span>`;
      inn.after(p);
    },
    d() {
      const haegri = document.querySelector(".haus-haegri");
      if (!haegri) return;
      const vefja = document.createElement("div");
      vefja.className = "samband-d";
      vefja.innerHTML =
        `<button type="button" class="samband-d-hnappur" aria-expanded="false" aria-controls="samband-d-gluggi">${UMSLAG}<span>${T.tengill}</span></button>` +
        `<div class="samband-d-gluggi" id="samband-d-gluggi" hidden>` +
        `<p>${T.gluggi}</p><div class="samband-d-rod"><a href="${POSTUR}">${NETFANG}</a></div></div>`;
      vefja.querySelector(".samband-d-rod").append(afritaHnappur());
      const hnappur = vefja.querySelector("button");
      const gluggi = vefja.querySelector(".samband-d-gluggi");
      const setja = (opid) => { gluggi.hidden = !opid; hnappur.setAttribute("aria-expanded", String(opid)); };
      hnappur.addEventListener("click", (e) => { e.stopPropagation(); setja(gluggi.hidden); });
      document.addEventListener("click", (e) => { if (!vefja.contains(e.target)) setja(false); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") setja(false); });
      haegri.prepend(vefja);
    },
  };

  function rofi(val) {
    const r = document.createElement("div");
    r.className = "samband-rofi";
    r.innerHTML = `<span>${T.rofi}</span>` + ["a", "b", "c", "d"]
      .map((k) => `<a href="?samband=${k}"${k === val ? ' aria-current="true"' : ""}>${k.toUpperCase()}</a>`).join("");
    document.body.append(r);
  }

  const val = lesaVal();
  smidir[val]();
  rofi(val);
})();
