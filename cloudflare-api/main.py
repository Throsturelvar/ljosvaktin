# Northseek Cloudflare Python API

import json

from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from workers import WorkerEntrypoint, Response, fetch

import scoring
from locations import STADIR


NOAA_KP_URL = (
    "https://services.swpc.noaa.gov/"
    "products/noaa-planetary-k-index-forecast.json"
)

KP_CACHE_KEY = "noaa:kp:forecast"


class Default(WorkerEntrypoint):

    # -----------------------------------------------
    # JSON response helper
    # -----------------------------------------------

    def json_response(self, data, status=200):

        return Response(
            json.dumps(
                data,
                ensure_ascii=False
            ),
            status=status,
            headers={
                "Content-Type":
                    "application/json; charset=utf-8",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-store"
            }
        )

    # -----------------------------------------------
    # Fetch NOAA and save to Cloudflare KV
    # -----------------------------------------------

    async def update_kp_cache(self):

        response = await fetch(NOAA_KP_URL)

        if not response.ok:

            raise Exception(
                f"NOAA HTTP {response.status}"
            )

        data = await response.json()

        if not isinstance(data, list) or not data:

            raise Exception(
                "NOAA returned invalid Kp data"
            )

        cache_data = {
            "source": "NOAA SWPC",
            "updated_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "forecast": data
        }

        await self.env.NORTHSEEK_CACHE.put(
            KP_CACHE_KEY,
            json.dumps(
                cache_data,
                ensure_ascii=False
            )
        )

        return cache_data

    # -----------------------------------------------
    # Scheduled NOAA update
    # Every 3 hours
    # -----------------------------------------------

    async def scheduled(self, controller, env, ctx):

        if controller.cron != "0 */3 * * *":
            return

        print(
            "Northseek: updating NOAA Kp forecast"
        )

        await self.update_kp_cache()

        print(
            "Northseek: NOAA Kp forecast saved"
        )

    # -----------------------------------------------
    # HTTP requests
    # -----------------------------------------------

    async def fetch(self, request):

        path = urlparse(request.url).path

        # -------------------------------------------
        # Health endpoint
        # -------------------------------------------

        if path == "/api/heilsa":

            return self.json_response({
                "ok": True,
                "service": "northseek-api",
                "backend": "cloudflare",
                "status": "running"
            })

        # -------------------------------------------
        # Test locations and scoring
        # -------------------------------------------

        if path == "/api/profa":

            now = datetime.now(timezone.utc)

            result = scoring.reikna_skor(
                virkni=50,
                kp=4,
                sky_opacitet=20,
                tungl_pct=30,
                tungl_uppi=0.5,
                myrkur_fra=now,
                myrkur_til=now + timedelta(hours=8)
            )

            return self.json_response({
                "ok": True,
                "service": "northseek-api",
                "test": True,
                "stadir_fjoldi": len(STADIR),
                "fyrsti_stadur": STADIR[0]["nafn"],
                "reiknid": result
            })

        # -------------------------------------------
        # TEMPORARY: Initialize NOAA cache now
        # Remove this endpoint after first use
        # -------------------------------------------

        if path == "/api/init-kp":

            try:

                existing = await (
                    self.env.NORTHSEEK_CACHE.get(
                        KP_CACHE_KEY
                    )
                )

                if existing:

                    return self.json_response({
                        "ok": True,
                        "message":
                            "Cache already initialized",
                        "cache": "KV"
                    })

                cache_data = (
                    await self.update_kp_cache()
                )

                return self.json_response({
                    "ok": True,
                    "message":
                        "NOAA cache initialized",
                    "source": "NOAA SWPC",
                    "fjoldi": len(
                        cache_data["forecast"]
                    ),
                    "updated_at":
                        cache_data["updated_at"],
                    "cache": "KV"
                })

            except Exception as error:

                return self.json_response(
                    {
                        "ok": False,
                        "villa": str(error)
                    },
                    status=502
                )

        # -------------------------------------------
        # NOAA Kp forecast from KV
        # -------------------------------------------

        if path == "/api/kp":

            try:

                cached = await (
                    self.env.NORTHSEEK_CACHE.get(
                        KP_CACHE_KEY
                    )
                )

                if not cached:

                    return self.json_response(
                        {
                            "ok": False,
                            "source": "NOAA SWPC",
                            "cache": "empty",
                            "message":
                                "Waiting for scheduled update"
                        },
                        status=503
                    )

                data = json.loads(cached)

                forecast = data["forecast"]

                future_forecast = [
                    row for row in forecast
                    if row.get("observed")
                    in ("predicted", "estimated")
                ]

                return self.json_response({
                    "ok": True,
                    "service": "northseek-api",
                    "source": "NOAA SWPC",
                    "cache": "KV",
                    "updated_at":
                        data["updated_at"],
                    "fjoldi":
                        len(forecast),
                    "spa_fjoldi":
                        len(future_forecast),
                    "fyrstu_spa_faerslur":
                        future_forecast[:5]
                })

            except Exception as error:

                return self.json_response(
                    {
                        "ok": False,
                        "villa": str(error)
                    },
                    status=502
                )

        # -------------------------------------------
        # Root endpoint
        # -------------------------------------------

        if path == "/":

            return self.json_response({
                "service": "northseek-api",
                "message":
                    "Northseek API is running"
            })

        # -------------------------------------------
        # Unknown endpoint
        # -------------------------------------------

        return self.json_response(
            {
                "villa": "fannst ekki"
            },
            status=404
        )
