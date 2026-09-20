import json
from workers import WorkerEntrypoint, Response


class Default(WorkerEntrypoint):

    async def fetch(self, request):

        return Response(
            json.dumps({
                "ok": True,
                "service": "northseek-api",
                "message": "Northseek Python backend is running"
            }),
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "Access-Control-Allow-Origin": "*"
            }
        )
