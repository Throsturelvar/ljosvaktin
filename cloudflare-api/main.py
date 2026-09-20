# Northseek Cloudflare Python API

import json
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from workers import WorkerEntrypoint, Response, fetch

import scoring
from locations import STADIR


# --------------------------------------------------
# NOAA data sources
# --------------------------------------------------

NOAA_KP_URL = (
    "https://services.swpc.noaa.gov/"
    "products/noaa-planetary-k-index-forecast.json"
)

NOAA_OVATION_URL = (
    "https://services.swpc.noaa.gov/"
    "json/ovation_aurora_latest.json"
)


# --------------------------------------------------
# Cloudflare KV keys
# --------------------------------------------------

KP_CACHE_KEY = "noaa:kp:forecast"

OVATION_CACHE_KEY = "noaa:ovation:locations"


class Default(WorkerEntrypoint):

    # --------------------------------------------------
    # JSON response helper
    # --------------------------------------------------

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

    # --------------------------------------------------
    # Update NOAA Kp cache
    # --------------------------------------------------

    async def update_kp_cache(self):

        response = await fetch(NOAA_KP_URL)

        if not response.ok:
            raise Exception(
                f"NOAA Kp HTTP {response.status}"
            )

        data = await response.json()

        if not isinstance(data, list) or not data:
            raise Exception(
                "Invalid NOAA Kp data"
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

    # --------------------------------------------------
    # Update NOAA OVATION cache
    # --------------------------------------------------

    async def update_ovation_cache(self):

        response = await fetch(
            NOAA_OVATION_URL
        )

        if not response.ok:
            raise Exception(
                f"NOAA OVATION HTTP {response.status}"
            )

        data = await response.json()

        if (
            not isinstance(data, dict)
            or not isinstance(
                data.get("coordinates"), list
            )
            or not data["coordinates"]
        ):
            raise Exception(
                "Invalid NOAA OVATION data"
            )

        coordinates = data["coordinates"]

        # Build an index of exact grid coordinates.
        # NOAA uses longitude 0-360.

        grid = {
            (lon, lat): value
            for lon, lat, value in coordinates
        }

        locations_result = []

        for stadur in STADIR:

            lat = stadur["lat"]
            lon = stadur["lon"]

            grid_lat = round(lat)
            grid_lon = round(lon % 360) % 360

            key = (
                grid_lon,
                grid_lat
            )

            # Use exact grid point when available.
            # Otherwise use original Northseek logic.

            if key in grid:

                virkni = grid[key]

            else:

                virkni = (
                    scoring.ovation_virkni(
                        lat,
                        lon,
                        data
                    )
                )

            locations_result.append({
                "id": stadur["id"],
                "nafn": stadur["nafn"],
                "lat": lat,
                "lon": lon,
                "virkni_ovation": virkni
            })

        cache_data = {
            "source": "NOAA SWPC OVATION",
            "updated_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "forecast_time": data.get(
                "Forecast Time"
            ),
            "observation_time": data.get(
                "Observation Time"
            ),
            "stadir": locations_result
        }

        # Store only local results, not the full
        # worldwide OVATION grid.

        await self.env.NORTHSEEK_CACHE.put(
            OVATION_CACHE_KEY,
            json.dumps(
                cache_data,
                ensure_ascii=False
            )
        )

        return cache_data

    # --------------------------------------------------
    # Scheduled updates
    # --------------------------------------------------

    async def scheduled(
        self,
        controller,
        env,
        ctx
    ):

        # Kp every 3 hours

        if controller.cron == "0 */3 * * *":

            print(
                "Northseek: updating NOAA Kp"
            )

            await self.update_kp_cache()

            print(
                "Northseek: Kp saved to KV"
            )

        # OVATION every 20 minutes

        elif controller.cron == "*/20 * * * *":

            print(
                "Northseek: updating OVATION"
            )

            await self.update_ovation_cache()

            print(
                "Northseek: OVATION saved to KV"
            )

    # --------------------------------------------------
    # HTTP requests
    # --------------------------------------------------

    async def fetch(self, request):

        path = urlparse(
            request.url
        ).path

        # --------------------------------------------------
        # Health
        # --------------------------------------------------

        if path == "/api/heilsa":

            return self.json_response({
                "ok": True,
                "service": "northseek-api",
                "backend": "cloudflare",
                "status": "running"
            })

        # --------------------------------------------------
        # Test locations and scoring
        # --------------------------------------------------

        if path == "/api/profa":

            now = datetime.now(
                timezone.utc
            )

            result = scoring.reikna_skor(
                virkni=50,
                kp=4,
                sky_opacitet=20,
                tungl_pct=30,
                tungl_uppi=0.5,
                myrkur_fra=now,
                myrkur_til=now + timedelta(
                    hours=8
                )
            )

            return self.json_response({
                "ok": True,
                "service": "northseek-api",
                "test": True,
                "stadir_fjoldi": len(
                    STADIR
                ),
                "fyrsti_stadur":
                    STADIR[0]["nafn"],
                "reiknid": result
            })

        # --------------------------------------------------
        # NOAA Kp from KV
        # --------------------------------------------------

        if path == "/api/kp":

            try:

                cached = await (
                    self.env.NORTHSEEK_CACHE.get(
                        KP_CACHE_KEY
                    )
                )

                if not cached:

                    return self.json_response({
                        "ok": False,
                        "cache": "empty",
                        "message":
                            "Waiting for Kp update"
                    }, status=503)

                data = json.loads(
                    cached
                )

                forecast = data[
                    "forecast"
                ]

                future_forecast = [
                    row for row in forecast
                    if row.get("observed")
                    in (
                        "predicted",
                        "estimated"
                    )
                ]

                return self.json_response({
                    "ok": True,
                    "service": "northseek-api",
                    "source": "NOAA SWPC",
                    "cache": "KV",
                    "updated_at":
                        data["updated_at"],
                    "fjoldi": len(
                        forecast
                    ),
                    "spa_fjoldi": len(
                        future_forecast
                    ),
                    "fyrstu_spa_faerslur":
                        future_forecast[:5]
                })

            except Exception as error:

                return self.json_response({
                    "ok": False,
                    "villa": str(error)
                }, status=502)

        # --------------------------------------------------
        # NOAA OVATION from KV
        # --------------------------------------------------

        if path == "/api/ovation":

            try:

                cached = await (
                    self.env.NORTHSEEK_CACHE.get(
                        OVATION_CACHE_KEY
                    )
                )

                if not cached:

                    return self.json_response({
                        "ok": False,
                        "source":
                            "NOAA SWPC OVATION",
                        "cache": "empty",
                        "message":
                            "Waiting for OVATION update"
                    }, status=503)

                data = json.loads(
                    cached
                )

                return self.json_response({
                    "ok": True,
                    "service": "northseek-api",
                    "source":
                        "NOAA SWPC OVATION",
                    "cache": "KV",
                    "updated_at":
                        data["updated_at"],
                    "forecast_time":
                        data.get(
                            "forecast_time"
                        ),
                    "stadir_fjoldi": len(
                        data["stadir"]
                    ),
                    "stadir":
                        data["stadir"]
                })

            except Exception as error:

                return self.json_response({
                    "ok": False,
                    "villa": str(error)
                }, status=502)

        # --------------------------------------------------
        # Root
        # --------------------------------------------------

        if path == "/":

            return self.json_response({
                "service": "northseek-api",
                "message":
                    "Northseek API is running"
            })

        # --------------------------------------------------
        # Unknown endpoint
        # --------------------------------------------------

        return self.json_response({
            "villa": "fannst ekki"
        }, status=404)
