from flask import Blueprint, Response
import time
import json
from ..modules.discovery import get_device_inventory
from ..modules.alerts import get_recent_alerts

stream_api = Blueprint("stream_api", __name__)

@stream_api.route("/metrics")
def stream_metrics():
    def generate():
        while True:
            try:
                devices = get_device_inventory()
                alerts_data = get_recent_alerts(limit=50)

                payload = {
                    "devices": devices,
                    "alerts": alerts_data.get("alerts", [])
                }
                
                yield f"data: {json.dumps(payload)}\n\n"
            except Exception as e:
                import logging
                logging.getLogger("unioss.stream").error(f"SSE error: {e}")
            
            # pushing every 5 seconds keeps frontend perfectly synchronous with poller
            time.sleep(5)
            
    return Response(generate(), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
    })
