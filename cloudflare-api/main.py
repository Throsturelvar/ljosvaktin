
"""Northseek API Worker.

Public GET requests read KV only.
Scheduled jobs fetch and cache upstream data.
"""

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


def diagnostic_status(kp, clouds, sunmoon):
    """Read-only explanation of why the API is not ready."""

    today = datetime.now(timezone.utc).date().isoformat()

    cloud_locations = (clouds or {}).get("stadir") or {}
    sunmoon_locations = (sunmoon or {}).get("stadir") or {}

    missing_cloud = []
    missing_sunmoon = []
    invalid_sunmoon = []

    for place in STADIR:
        place_id = place["id"]
        place_name = place["nafn"]

        cloud = cloud_locations.get(place_id)

        if not cloud:
            missing_cloud.append({
                "id": place_id,
                "nafn": place_name,
            })

        days = sunmoon_locations.get(place_id)

        if not days:
            missing_sunmoon.append({
                "id": place_id,
                "nafn": place_name,
                "astaeda": "Engin sól-/tunglgögn",
            })

        elif (
            len(days) < 4
            or days[0].get("dags") != today
        ):
            invalid_sunmoon.append({
                "id": place_id,
                "nafn": place_name,
                "dagar": len(days),
                "fyrsti_dagur": (
                    days[0].get("dags")
                    if days
                    else None
                ),
                "astaeda":
                    "Vantar fjóra daga frá deginum í dag",
            })

    total = len(STADIR)

    return {
        "ok": True,
        "service": "northseek-api",
        "today_utc": today,
        "ready": is_ready(kp, clouds, sunmoon),
        "kp_til": bool(
            kp and kp.get("forecast")
        ),
        "stadir_allir": total,
        "cloud": {
            "med_gogn": total - len(missing_cloud),
            "vantar_fjoldi": len(missing_cloud),
            "vantar": missing_cloud,
            "updated_at": (
                (clouds or {}).get("updated_at")
            ),
        },
        "sunmoon": {
            "med_rett_gogn": (
                total
                - len(missing_sunmoon)
                - len(invalid_sunmoon)
            ),
            "vantar_fjoldi": len(missing_sunmoon),
            "vantar": missing_sunmoon,
            "orettir_dagar_fjoldi": len(
                invalid_sunmoon
            ),
            "orettir_dagar": invalid_sunmoon,
            "updated_at": (
                (sunmoon or {}).get("updated_at")
            ),
        },
    }


class Default(WorkerEntrypoint):

    # --------------------------------------------------
    # Scheduled data updates
    # --------------------------------------------------

    async def scheduled(self, controller, env, ctx):

        cron = controller.cron
        now = datetime.now(timezone.utc)

        if cron == "0 */3 * * *":

            await update_kp(self.env)

        elif cron == "*/20 * * * *":

            await update_ovation(self.env)

        elif cron == "*/5 * * * *":

            await update_solar(self.env)

        elif cron == "7,17,27,37,47,57 * * * *":

            print(
                "Northseek MET DIAG: "
                "scheduled handler started"
            )

            try:
                met_user_agent = (
                    self.env.MET_USER_AGENT
                )

            except Exception as exc:

                print(
                    "Northseek MET DIAG: "
                    "binding lookup failed; "
                    f"error_type={type(exc).__name__}"
                )

                raise RuntimeError(
                    "MET_USER_AGENT binding "
                    "could not be read"
                ) from exc

            is_string = isinstance(
                met_user_agent, str
            )

            is_empty = (
                not met_user_agent.strip()
                if is_string
                else None
            )

            contains_example = (
                "example" in met_user_agent.lower()
                if is_string
                else None
            )

            # Never print the User-Agent or email.

            print(
                "Northseek MET DIAG: "
                "binding read succeeded; "
                f"value_type={type(met_user_agent).__name__}; "
                f"is_string={is_string}; "
                f"is_empty={is_empty}; "
                f"contains_example={contains_example}"
            )

            if not is_string:
                raise RuntimeError(
                    "MET_USER_AGENT is not a string"
                )

            if is_empty:
                raise RuntimeError(
                    "MET_USER_AGENT is empty"
                )

            if contains_example:
                raise RuntimeError(
                    "MET_USER_AGENT contains "
                    "an example placeholder"
                )

            batch = (now.minute - 7) // 10

            print(
                "Northseek MET DIAG: "
                f"starting update_cloud; batch={batch}"
            )

            try:

                await update_cloud(
                    self.env,
                    met_user_agent,
                    batch,
                )

            except Exception as exc:

                print(
                    "Northseek MET DIAG: "
                    "update_cloud failed; "
                    f"error_type={type(exc).__name__}"
                )

                raise

            print(
                "Northseek MET DIAG: "
                "update_cloud completed"
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

        if path == "/":

            return response({
                "service": "northseek-api",
                "message": "Northseek API is running",
            })

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

        if path not in (
            "/api/heilsa",
            "/api/stada",
            "/api/kp",
            "/api/ovation",
            "/api/geimvedur",
            "/api/vakt",
            "/api/skor",
        ):

            return response({
                "villa": "fannst ekki",
            }, 404)

        try:

            if path == "/api/kp":

                data = await read_store(
                    self.env, "kp"
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
                    "fyrstu_spa_faerslur":
                        future[:5],
                })

            if path == "/api/ovation":

                data = await read_store(
                    self.env, "ovation"
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
                    "forecast_time":
                        data.get("forecast_time"),
                    "stadir_fjoldi":
                        len(data["stadir"]),
                    "stadir": data["stadir"],
                })

            if path == "/api/geimvedur":

                data = await read_store(
                    self.env, "solar"
                )

                return response(
                    {
                        "ok": bool(data),
                        "cache": "KV",
                        "data": data,
                    },
                    200 if data else 503,
                )

            kp = await read_store(
                self.env, "kp"
            )

            clouds = await read_store(
                self.env, "cloud"
            )

            sunmoon = await read_store(
                self.env, "sunmoon"
            )

            # Read-only diagnostic endpoint.

            if path == "/api/stada":

                return response(
                    diagnostic_status(
                        kp, clouds, sunmoon
                    )
                )

            if path == "/api/heilsa":

                ovation = await read_store(
                    self.env, "ovation"
                )

                solar = await read_store(
                    self.env, "solar"
                )

                return response({
                    "ok": True,
                    "service": "northseek-api",
                    "backend": "cloudflare",
                    "status": "running",
                    "ready": is_ready(
                        kp, clouds, sunmoon
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

            if not is_ready(
                kp, clouds, sunmoon
            ):

                return response({
                    "villa":
                        "gögn ekki tilbúin ennþá",
                    "message":
                        "Cloud and sun/moon caches "
                        "are still being populated",
                }, 503)

            raw_day = parse_qs(
                url.query
            ).get("dagur", ["0"])[0]

            try:
                day = min(
                    2, max(0, int(raw_day))
                )
            except ValueError:
                day = 0

            if path == "/api/vakt":

                solar = await read_store(
                    self.env, "solar"
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
                    "reiknad":
                        datetime.now(
                            timezone.utc
                        ).isoformat(),
                    "dagur": day,
                    **result,
                })

            if path == "/api/skor":

                ovation = (
                    await read_store(
                        self.env, "ovation"
                    )
                    if day == 0
                    else None
                )

                return response({
                    "reiknad":
                        datetime.now(
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
                f"Northseek {path}: "
                f"{type(exc).__name__}"
            )

            return response({
                "villa": "Villa í API",
                "service": "northseek-api",
            }, 502)
