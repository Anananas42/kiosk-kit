#!/usr/bin/env python3
"""Privileged helper daemon for kioskkit.

Runs as root. Listens on a unix socket and executes a whitelisted set of
system scripts on behalf of the sandboxed kioskkit service. This avoids
the need for sudo (which is blocked by NoNewPrivileges in the service
sandbox).

Protocol: newline-delimited JSON over a unix stream socket.

  Request:  {"action": "wifi-enable"}
  Request:  {"action": "wifi-connect", "args": ["MySSID", "secret"]}
  Response: {"ok": true, "stdout": "..."}
  Response: {"ok": false, "error": "..."}

Each connection handles exactly one request, then closes.
"""

import grp
import json
import os
import signal
import socket
import subprocess
import sys

SOCKET_PATH = "/run/kioskkit/privileged.sock"
SCRIPTS_DIR = "/opt/kioskkit/system"
MAX_REQUEST_SIZE = 65536
CONN_TIMEOUT_SECS = 10

# Whitelist of allowed actions → script filenames.
ALLOWED_ACTIONS = {
    "wifi-enable": "wifi-enable.sh",
    "wifi-disable": "wifi-disable.sh",
    "wifi-connect": "wifi-connect.sh",
    "wifi-forget": "wifi-forget.sh",
    "ota-install": "ota-install.sh",
    "ota-rollback": "ota-rollback.sh",
}


def handle_request(data: bytes) -> dict:
    try:
        req = json.loads(data)
    except json.JSONDecodeError:
        return {"ok": False, "error": "Invalid JSON"}

    action = req.get("action")
    if not action or action not in ALLOWED_ACTIONS:
        return {"ok": False, "error": f"Unknown action: {action}"}

    # Safety net: resolve symlinks and verify the path stays inside SCRIPTS_DIR.
    # Cannot fail today (whitelist values are hardcoded literals), but guards
    # against future edits that might introduce a traversal.
    script = os.path.realpath(os.path.join(SCRIPTS_DIR, ALLOWED_ACTIONS[action]))
    if not script.startswith(SCRIPTS_DIR + "/"):
        return {"ok": False, "error": "Invalid script path"}
    args = req.get("args", [])

    if not isinstance(args, list) or not all(isinstance(a, str) for a in args):
        return {"ok": False, "error": "args must be a list of strings"}

    try:
        result = subprocess.run(
            [script, *args],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode == 0:
            return {"ok": True, "stdout": result.stdout}
        else:
            output = result.stderr or result.stdout
            return {"ok": False, "error": output.strip() or "Script failed"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Script timed out"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def main():
    # Clean up stale socket (RuntimeDirectory=kioskkit creates /run/kioskkit/)
    try:
        os.unlink(SOCKET_PATH)
    except FileNotFoundError:
        pass

    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    # Set umask before bind so the socket is created with correct permissions
    # (no window where it has default perms).
    old_umask = os.umask(0o117)  # creates socket as 0660
    srv.bind(SOCKET_PATH)
    os.umask(old_umask)
    # Set group to kiosk so the sandboxed service can connect
    try:
        kiosk_gid = grp.getgrnam("kiosk").gr_gid
        os.chown(SOCKET_PATH, 0, kiosk_gid)
    except KeyError:
        print("Warning: kiosk group not found, socket permissions may be wrong",
              file=sys.stderr)

    srv.listen(4)
    print(f"Listening on {SOCKET_PATH}", flush=True)

    # Clean shutdown on SIGTERM
    def shutdown(signum, frame):
        srv.close()
        try:
            os.unlink(SOCKET_PATH)
        except FileNotFoundError:
            pass
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    while True:
        try:
            conn, _ = srv.accept()
        except OSError:
            break

        try:
            conn.settimeout(CONN_TIMEOUT_SECS)
            data = b""
            overflow = False
            while b"\n" not in data:
                chunk = conn.recv(4096)
                if not chunk:
                    break
                data += chunk
                if len(data) > MAX_REQUEST_SIZE:
                    overflow = True
                    break
            if overflow:
                response = {"ok": False, "error": "Request too large"}
            else:
                response = handle_request(data)
            conn.sendall(json.dumps(response).encode() + b"\n")
        except Exception as e:
            try:
                conn.sendall(json.dumps({"ok": False, "error": str(e)}).encode() + b"\n")
            except Exception:
                pass
        finally:
            conn.close()


if __name__ == "__main__":
    main()
