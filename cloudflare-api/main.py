# Northseek Cloudflare Python API

import json
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from workers import WorkerEntrypoint, Response

import scoring
from locations import STADIR


class Default(WorkerEntrypoint):

    async def fetch(self, request):

        path = urlparse(request.url).path

        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store"
        }

        # Health endpoint
        if path == "/api/heilsa":

            data = {
                "ok": True,
                "service": "northseek-api",
                "backend": "cloudflare",
                "status": "running"
            }

            return Response(
                json.dumps(data),
                headers=headers
            )

        # Test locations and scoring
        if path == "/api/profa":

            now = datetime.now(timezone.utc)

            myrkur_fra = now
            myrkur_til = now + timedelta(hours=8)

            nidurstada = scoring.reikna_skor(
                virkni=50,
                kp=4,
                sky_opacitet=20,
                tungl_pct=30,
                tungl_uppi=0.5,
                myrkur_fra=myrkur_fra,
                myrkur_til=myrkur_til
            )

            data = {
                "ok": True,
                "service": "northseek-api",
                "test": True,
                "stadir_fjoldi": len(STADIR),
                "fyrsti_stadur": STADIR[0]["nafn"],
                "reiknid": nidurstada
            }

            return Response(
                json.dumps(
                    data,
                    ensure_ascii=False
                ),
                headers=headers
            )

        # Root endpoint
        if path == "/":

            data = {
                "service": "northseek-api",
                "message": "Northseek API is running"
            }

            return Response(
                json.dumps(data),
                headers=headers
            )

        # Unknown endpoint
        return Response(
            json.dumps({
                "villa": "fannst ekki"
            }),
            status=404,
            headers=headers
        )
