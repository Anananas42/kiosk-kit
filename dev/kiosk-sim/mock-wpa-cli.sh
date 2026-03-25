#!/usr/bin/env bash
# Mock wpa_cli — stateful simulator installed as /usr/sbin/wpa_cli.
# State lives in /tmp/mock-wifi-state/.
# Seed available networks via MOCK_WIFI_NETWORKS env var (JSON array).
set -euo pipefail

STATE_DIR="/tmp/mock-wifi-state"
SCAN_FILE="$STATE_DIR/scan.json"
NETWORKS_FILE="$STATE_DIR/networks.json"
CONNECTED_FILE="$STATE_DIR/connected.json"
WPA_CONF="/etc/wpa_supplicant/wpa_supplicant-wlan0.conf"

mkdir -p "$STATE_DIR"

# Parse arguments — skip "-i wlan0" if present
ARGS=("$@")
CMD=""
CMD_ARGS=()

i=0
while [ $i -lt ${#ARGS[@]} ]; do
    case "${ARGS[$i]}" in
        -i)
            # skip interface arg
            i=$((i + 2))
            ;;
        *)
            if [ -z "$CMD" ]; then
                CMD="${ARGS[$i]}"
            else
                CMD_ARGS+=("${ARGS[$i]}")
            fi
            i=$((i + 1))
            ;;
    esac
done

case "$CMD" in
    scan)
        echo "OK"
        ;;

    scan_results)
        # Output: header line then tab-separated rows
        # bssid / frequency / signal level / flags / ssid
        echo -e "bssid / frequency / signal level / flags / ssid"
        if [ -f "$SCAN_FILE" ]; then
            # Parse JSON array and output tab-separated lines
            # Each entry: {"ssid":"...","signal":-45,"security":"wpa"}
            jq -r '.[] | [
                ("00:11:22:33:44:" + (. as $n | $n.ssid | explode | .[0:2] | map(. % 100) | map(tostring) | join(""))),
                "2412",
                (.signal | tostring),
                (if .security == "wpa" then "[WPA2-PSK-CCMP][ESS]" else "[ESS]" end),
                .ssid
            ] | join("\t")' "$SCAN_FILE"
        fi
        ;;

    status)
        if [ -f "$CONNECTED_FILE" ] && [ "$(cat "$CONNECTED_FILE")" != "null" ]; then
            SSID=$(jq -r '.ssid' "$CONNECTED_FILE")
            echo "bssid=00:11:22:33:44:55"
            echo "freq=2412"
            echo "ssid=$SSID"
            echo "id=0"
            echo "mode=station"
            echo "pairwise_cipher=CCMP"
            echo "group_cipher=CCMP"
            echo "key_mgmt=WPA2-PSK"
            echo "wpa_state=COMPLETED"
            echo "address=dc:a6:32:aa:bb:cc"
        else
            echo "wpa_state=DISCONNECTED"
        fi
        ;;

    signal_poll)
        if [ -f "$CONNECTED_FILE" ] && [ "$(cat "$CONNECTED_FILE")" != "null" ]; then
            SIGNAL=$(jq -r '.signal' "$CONNECTED_FILE")
            echo "RSSI=$SIGNAL"
            echo "LINKSPEED=72"
            echo "NOISE=-90"
            echo "FREQUENCY=2412"
        else
            echo "FAIL"
        fi
        ;;

    reconfigure)
        # Re-read wpa_supplicant.conf and connect to highest-priority network
        # that exists in scan.json
        if [ -f "$WPA_CONF" ] && [ -f "$SCAN_FILE" ]; then
            # Extract saved SSIDs with priorities from conf
            BEST_SSID=""
            BEST_PRIO=-1

            # Parse network blocks from conf
            CURRENT_SSID=""
            CURRENT_PRIO=0
            while IFS= read -r line; do
                if [[ "$line" =~ ssid=\"([^\"]+)\" ]]; then
                    CURRENT_SSID="${BASH_REMATCH[1]}"
                fi
                if [[ "$line" =~ priority=([0-9]+) ]]; then
                    CURRENT_PRIO="${BASH_REMATCH[1]}"
                fi
                if [[ "$line" =~ ^\} ]]; then
                    if [ -n "$CURRENT_SSID" ]; then
                        # Check if this SSID is in scan results
                        IN_RANGE=$(jq -r --arg ssid "$CURRENT_SSID" '[.[] | select(.ssid == $ssid)] | length' "$SCAN_FILE")
                        if [ "$IN_RANGE" -gt 0 ] && [ "$CURRENT_PRIO" -gt "$BEST_PRIO" ]; then
                            BEST_SSID="$CURRENT_SSID"
                            BEST_PRIO="$CURRENT_PRIO"
                        fi
                    fi
                    CURRENT_SSID=""
                    CURRENT_PRIO=0
                fi
            done < "$WPA_CONF"

            if [ -n "$BEST_SSID" ]; then
                # Get signal from scan data
                SIGNAL=$(jq -r --arg ssid "$BEST_SSID" '.[] | select(.ssid == $ssid) | .signal' "$SCAN_FILE")
                jq -n --arg ssid "$BEST_SSID" --argjson signal "$SIGNAL" '{"ssid":$ssid,"signal":$signal}' > "$CONNECTED_FILE"
            else
                echo "null" > "$CONNECTED_FILE"
            fi
        elif [ -f "$WPA_CONF" ]; then
            # No scan file — no networks in range
            echo "null" > "$CONNECTED_FILE"
        else
            echo "null" > "$CONNECTED_FILE"
        fi
        echo "OK"
        ;;

    list_networks)
        echo -e "network id / ssid / bssid / flags"
        if [ -f "$WPA_CONF" ]; then
            ID=0
            CURRENT_SSID=""
            if [ -f "$CONNECTED_FILE" ] && [ "$(cat "$CONNECTED_FILE")" != "null" ]; then
                CURRENT_SSID=$(jq -r '.ssid' "$CONNECTED_FILE")
            fi
            while IFS= read -r line; do
                if [[ "$line" =~ ssid=\"([^\"]+)\" ]]; then
                    SSID="${BASH_REMATCH[1]}"
                    FLAGS=""
                    if [ "$SSID" = "$CURRENT_SSID" ]; then
                        FLAGS="[CURRENT]"
                    fi
                    echo -e "$ID\t$SSID\tany\t$FLAGS"
                    ID=$((ID + 1))
                fi
            done < "$WPA_CONF"
        fi
        ;;

    add_network)
        # Return next network ID
        if [ -f "$WPA_CONF" ]; then
            COUNT=$(grep -c 'ssid=' "$WPA_CONF" 2>/dev/null || echo "0")
        else
            COUNT=0
        fi
        echo "$COUNT"
        ;;

    set_network)
        # set_network <id> <key> <value> — no-op in mock, config is managed via conf file
        echo "OK"
        ;;

    enable_network)
        echo "OK"
        ;;

    save_config)
        echo "OK"
        ;;

    remove_network)
        echo "OK"
        ;;

    select_network)
        echo "OK"
        ;;

    *)
        echo "Unknown command: $CMD" >&2
        exit 1
        ;;
esac
