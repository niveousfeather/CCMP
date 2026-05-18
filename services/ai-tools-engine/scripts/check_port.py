from __future__ import annotations

import json
import socket
import sys
import urllib.error
import urllib.request


HOST = "127.0.0.1"
PORT = 8010
HEALTH_URL = f"http://{HOST}:{PORT}/health"


def can_connect() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(2)
        return sock.connect_ex((HOST, PORT)) == 0


def read_health() -> tuple[bool, dict[str, object] | None, str | None]:
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=3) as response:
            raw = response.read().decode("utf-8", errors="replace")
            data = json.loads(raw)
            return data.get("service") == "nexusai-tools-engine", data, None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        return False, None, str(exc)


def main() -> int:
    print("NexusAI Tools Engine port check")
    print(f"Port: {HOST}:{PORT}")
    if not can_connect():
        print("Status: FREE")
        return 0

    ok, data, error = read_health()
    if ok:
        print("Status: OK")
        print("Existing service: nexusai-tools-engine")
        if data:
            diagnostics = data.get("diagnostics")
            if diagnostics:
                print(f"Diagnostics: {json.dumps(diagnostics, ensure_ascii=False)}")
        return 0

    print("Status: OCCUPIED_BY_OTHER_PROCESS")
    if error:
        print(f"Health check failed: {error}")
    print("Inspect the port manually:")
    print("  netstat -ano | findstr :8010")
    print("If it is safe to stop that process:")
    print("  taskkill /PID <pid> /F")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
