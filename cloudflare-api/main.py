# Northseek Cloudflare Python API

import json
from urllib.parse import urlparse

from workers import WorkerEntrypoint, Response


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
