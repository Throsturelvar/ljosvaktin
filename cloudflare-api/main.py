
"""Northseek API Worker. Public GETs read KV only; cron jobs fetch upstreams."""

import json
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs

from workers import WorkerEntrypoint, Response

from locations import STADIR
from sources_worker import (
    read_store,
    update_kp,
    update_ovation,
    update_solar,
    update_cloud,
    update_sunmoon,
)
from api_logic import vakt, skor, is_ready


def response(payload, status=200):
    return Response(
        json.dumps(payload, ensure_ascii=False),
        status=status,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
        },
    )


class Default(WorkerEntrypoint):

    # --------------------------------------------------
    # Scheduled data updates
    # --------------------------------------------------

    async def scheduled(self, controller, env, ctx):
        cron = controller.cron
        now = datetime.now(timezone.utc)

        # Python Worker bindings are accessed through self.env.

        if cron == "0 */3 * * *":
            await update_kp(self.env)

        elif cron == "*/20 * * * *":
            await update_ovation(self.env)

        elif cron == "*/5 * * * *":
            await update_solar(self.env)

        elif cron == "7,17,27,37,47,57 * * * *":

            # Read the runtime variable directly.
            # Do not log its value or the contact email.

            try:
                met_user_agent = self.env.MET_USER_AGENT
            except (AttributeError, KeyError) as exc:
                raise RuntimeError(
                    "MET_USER_AGENT is not accessible in "
                    "this Worker's runtime environment. "
                    "Check Variables and Secrets and "
                    "redeploy the Worker."
                ) from exc

            if not isinstance(met_user_agent, str):
                raise RuntimeError(
                    "MET_USER_AGENT was found but is not "
                    "a Python string."
                )

            if not met_user_agent.strip():
                raise RuntimeError(
                    "MET_USER_AGENT is empty."
                )

            print(
                "Northseek MET: runtime variable "
                "is accessible; starting cloud update"
            )

            await update_cloud(
                self.env,
                met_user_agent,
                (now.minute - 7) // 10,
            )

            print(
                "Northseek MET: cloud update completed"
            )

        elif cron == "13 * * * *":
            await update_sunmoon(
                self.env,
                now.hour % 4,
            )

    # --------------------------------------------------
    # HTTP API
    # --------------------------------------------------

    async def fetch(self, request):
        url = urlparse(request.url)
        path = url.path

        # --------------------------------------------------
        # Root
        # --------------------------------------------------

        if path == "/":
            return response({
                "service": "northseek-api",
                "message": "Northseek API is running",
            })

        # --------------------------------------------------
        # Scoring regression test
        # --------------------------------------------------

        if path == "/api/profa":
            import scoring
            from datetime import timedelta

            now = datetime.now(timezone.utc)

            value = scoring.reikna_skor(
                50,
                4,
                20,
                30,
                0.5,
                now,
                now + timedelta(hours=8),
            )

            return response({
                "ok": True,
                "test": True,
                "stadir_fjoldi": len(STADIR),
                "fyrsti_stadur": STADIR[0]["nafn"],
                "reiknid": value,
            })

        # --------------------------------------------------
        # Known API paths
        # --------------------------------------------------

        if path not in (
            "/api/heilsa",
            "/api/kp",
            "/api/ovation",
            "/api/geimvedur",
            "/api/vakt",
            "/api/skor",
        ):
            return response(
                {"villa": "fannst ekki"},
                404,
            )

        try:

            # --------------------------------------------------
            # NOAA Kp forecast
            # --------------------------------------------------

            if path == "/api/kp":
                data = await read_store(
                    self.env,
                    "kp",
                )

                if not data:
                    return response({
                        "ok": False,
                        "cache": "empty",
                    }, 503)

                forecast = data["forecast"]

                future = [
                    row
                    for row in forecast
                    if row.get("observed")
                    in ("predicted", "estimated")
                ]

                return response({
                    "ok": True,
                    "service": "northseek-api",
                    "source": "NOAA SWPC",
                    "cache": "KV",
                    "updated_at": data["updated_at"],
                    "fjoldi": len(forecast),
                    "spa_fjoldi": len(future),
                    "fyrstu_spa_faerslur": future[:5],
                })

            # --------------------------------------------------
            # NOAA OVATION
            # --------------------------------------------------

            if path == "/api/ovation":
                data = await read_store(
                    self.env,
                    "ovation",
                )

                if not data:
                    return response({
                        "ok": False,
                        "cache": "empty",
                    }, 503)

                return response({
                    "ok": True,
                    "service": "northseek-api",
                    "source": data["source"],
                    "cache": "KV",
                    "updated_at": data["updated_at"],
                    "forecast_time": data.get(
                        "forecast_time"
                    ),
                    "stadir_fjoldi": len(
                        data["stadir"]
                    ),
                    "stadir": data["stadir"],
                })

            # --------------------------------------------------
            # Solar wind
            # --------------------------------------------------

            if path == "/api/geimvedur":
                data = await read_store(
                    self.env,
                    "solar",
                )

                return response(
                    {
                        "ok": bool(data),
                        "cache": "KV",
                        "data": data,
                    },
                    200 if data else 503,
                )

            # --------------------------------------------------
            # Shared data for health, vakt and skor
            # --------------------------------------------------

            kp = await read_store(
                self.env,
                "kp",
            )

            clouds = await read_store(
                self.env,
                "cloud",
            )

            sunmoon = await read_store(
                self.env,
                "sunmoon",
            )

            # --------------------------------------------------
            # Health
            # --------------------------------------------------

            if path == "/api/heilsa":
                ovation = await read_store(
                    self.env,
                    "ovation",
                )

                solar = await read_store(
                    self.env,
                    "solar",
                )

                return response({
                    "ok": True,
                    "service": "northseek-api",
                    "backend": "cloudflare",
                    "status": "running",
                    "ready": is_ready(
                        kp,
                        clouds,
                        sunmoon,
                    ),
                    "updated_at": {
                        name: (data or {}).get(
                            "updated_at"
                        )
                        for name, data in (
                            ("kp", kp),
                            ("cloud", clouds),
                            ("sunmoon", sunmoon),
                            ("ovation", ovation),
                            ("solar", solar),
                        )
                    },
                })

            # --------------------------------------------------
            # Require forecast data
            # --------------------------------------------------

            if not is_ready(
                kp,
                clouds,
                sunmoon,
            ):
                return response({
                    "villa": "gögn ekki tilbúin ennþá",
                    "message":
                        "Cloud and sun/moon caches "
                        "are still being populated",
                }, 503)

            # --------------------------------------------------
            # Day parameter: 0, 1 or 2
            # --------------------------------------------------

            raw_day = parse_qs(
                url.query
            ).get("dagur", ["0"])[0]

            try:
                day = min(
                    2,
                    max(0, int(raw_day)),
                )
            except ValueError:
                day = 0

            # --------------------------------------------------
            # Aurora watch
            # --------------------------------------------------

            if path == "/api/vakt":
                solar = await read_store(
                    self.env,
                    "solar",
                )

                result = vakt(
                    day,
                    kp,
                    clouds,
                    sunmoon,
                    solar,
                )

                if result is None:
                    return response({
                        "villa":
                            "gögn ekki tilbúin ennþá",
                    }, 503)

                return response({
                    "reiknad": datetime.now(
                        timezone.utc
                    ).isoformat(),
                    "dagur": day,
                    **result,
                })

            # --------------------------------------------------
            # Scores for all locations
            # --------------------------------------------------

            if path == "/api/skor":
                ovation = (
                    await read_store(
                        self.env,
                        "ovation",
                    )
                    if day == 0
                    else None
                )

                return response({
                    "reiknad": datetime.now(
                        timezone.utc
                    ).isoformat(),
                    "dagur": day,
                    "stadir": skor(
                        day,
                        kp,
                        clouds,
                        sunmoon,
                        ovation,
                    ),
                })

        except Exception as exc:
            print(
                f"Northseek {path}: {exc}"
            )

            return response({
                "villa": "Villa í API",
                "service": "northseek-api",
            }, 502)
