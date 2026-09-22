# Northseek API — JavaScript-útgáfa

Kemur í stað Python-Workersins `northseek-api`.

## Af hverju

`northseek-api` (Python Worker / Pyodide) hrynur reglulega við ræsingu tilviks:

```
SystemError: Cannot enter a promising task from inside another running promising task. This is a bug in Pyodide.
  at initPyInstance (pyodide:python-entrypoint-helper)
```

Eftir það skilar tilvikið Error 1101 á **öllum** slóðum (líka `/`) þar til Cloudflare hendir því.
Þetta er villa í keyrsluumhverfinu, ekki í Northseek-kóðanum, og rollback lagar hana ekki.
Í prófun 22. sept. kl. 22:30–22:47 UTC svaraði Python-API-ið 37 af 240 fyrirspurnum;
JS-útgáfan svaraði 160 af 160.

## Hvað var gert

- `src/` er lína-fyrir-línu þýðing á `main.py`, `api_logic.py`, `scoring.py`,
  `sources_worker.py`, `locations.py`. Python-rúnnun (`round`, ties-to-even) og
  `sum()` (Neumaier) eru endurgerð svo úttakið sé **eins** — staðfest með því að keyra
  Python- og JS-kóðann á sömu KV-gögnum fyrir `vakt`/`skor`, dagur 0–2.
- Sama KV (`NORTHSEEK_CACHE`), sömu lyklar og sama gagnasnið; Python og JS geta lesið gögn hvor annars.

### Villur sem voru lagaðar í leiðinni

1. **API-ið lá niðri frá miðnætti til ~03:13 UTC á hverri nóttu.** `is_ready()` krafðist þess
   að fyrsti dagur sól-/tunglgagna væri dagurinn í dag, en þau eru endurnýjuð í fjórum
   hollum á klukkustund. Nú er lesið frá deginum í dag, sótt eru 5 dagar (ekki 4) og
   úreltir staðir eru endurnýjaðir fyrst.
2. **Sólvindsgögn voru sólarhrings gömul.** NOAA raðar nýjustu mælingu fremst; kóðinn leitaði
   aftan frá. Nú er nýjasta virka mælingin valin.

## Worker-ar

| Worker | Hlutverk |
|---|---|
| `northseek-api-js` | Þessi kóði. https://northseek-api-js.throstur-oskarsson.workers.dev |
| `northseek` | Framendi. Kóði í `backend/static/` |
| `northseek-api` | Gamla Python-útgáfan. Keyrir enn cron-verkin þar til skipt er. |

## Skipti (í þessari röð)

1. **Cron-verk færð:** bæta crons í `wrangler.jsonc` hér og `wrangler deploy`;
   fjarlægja crons af `northseek-api`.
   ```
   "triggers": { "crons": ["0 */3 * * *", "*/20 * * * *", "*/5 * * * *", "7,17,27,37,47,57 * * * *", "13 * * * *"] }
   ```
2. **Framendi:** `npx wrangler deploy` í `backend/static/` (eða merge á greinina sem Workers Builds fylgist með).
3. **DNS:** fjarlægja CNAME `northseek.net → ljosvaktin.onrender.com`, tengja
   `northseek.net` og `www.northseek.net` sem Custom Domain á `northseek`.
4. Láta Render keyra áfram í um viku sem varaleið.

**Rollback:** fjarlægja Custom Domains og setja CNAME aftur á `ljosvaktin.onrender.com`.

## Git

Þessi grein (`cloudflare-js-api`) inniheldur allt sem þarf:

- `cloudflare-api/` — JS-útgáfan (kemur í stað Python-skránna). Sett upp með `npx wrangler deploy` í þessari möppu.
- `backend/static/worker.js` — rekstrarútgáfa framendans, án prófunarmerkis.
- `backend/static/wrangler.jsonc` — `NORTHSEEK_API` bendir á `northseek-api-js`.
- `backend/static/index.html` — sækir `/api/vakt` af eigin léni í stað Render.
- `backend/static/.assetsignore` — `worker.js` og `wrangler.jsonc` voru aðgengileg á vefnum.

Aftengja þarf Workers Builds fyrir `northseek-api` í Cloudflare-mælaborðinu
(Settings → Build), annars reynir hún að byggja Python-kóða sem er ekki lengur til.
