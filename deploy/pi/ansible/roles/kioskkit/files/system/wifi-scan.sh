#!/usr/bin/env bash
# Managed by Ansible — do not edit manually.
# Scans for nearby WiFi networks via NetworkManager and outputs JSON.
set -euo pipefail

# Trigger a fresh scan (returns immediately, results populate async)
nmcli device wifi rescan ifname wlan0 2>/dev/null || true
sleep 2

# Parse scan results: SSID, signal (0-100), security
# Using --terse with \: field separator; NM escapes colons in SSIDs
nmcli -t -f ssid,signal,security dev wifi list ifname wlan0 2>/dev/null | awk -F: '
BEGIN { print "[" }
{
    # Skip empty SSIDs
    if ($1 == "") next

    ssid = $1
    signal_pct = $2 + 0
    flags = $3

    # Convert NM percentage (0-100) to approximate dBm
    signal = int((signal_pct / 2) - 100)

    # Determine security type
    sec = "open"
    if (flags ~ /WPA/) sec = "wpa"

    # Keep strongest signal per SSID
    if (!(ssid in best) || signal > best_sig[ssid]) {
        best[ssid] = sec
        best_sig[ssid] = signal
    }
}
END {
    first = 1
    for (ssid in best) {
        if (!first) printf ","
        # Escape backslashes and double quotes in SSID
        gsub(/\\/, "\\\\", ssid)
        gsub(/"/, "\\\"", ssid)
        printf "{\"ssid\":\"%s\",\"signal\":%d,\"security\":\"%s\"}", ssid, best_sig[ssid], best[ssid]
        first = 0
    }
    print "]"
}
'
