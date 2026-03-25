#!/usr/bin/env bash
# Managed by Ansible — do not edit manually.
# Scans for nearby WiFi networks and outputs JSON.
# No sudo required.
set -euo pipefail

# Trigger a fresh scan (may fail if one is already running — that's fine)
wpa_cli -i wlan0 scan >/dev/null 2>&1 || true
sleep 2

RAW=$(wpa_cli -i wlan0 scan_results 2>/dev/null) || {
    echo '{"error": "wpa_cli scan_results failed"}'
    exit 1
}

# Parse scan results: skip header line, filter empty SSIDs, deduplicate keeping strongest signal
echo "$RAW" | awk -F'\t' '
BEGIN { print "[" }
NR > 1 && $5 != "" {
    ssid = $5
    signal = $3 + 0
    flags = $4

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
