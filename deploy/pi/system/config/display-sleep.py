#!/usr/bin/env python3
"""Display sleep handler for kiosk touchscreen.

Called by swayidle when the idle timeout expires. Turns the display off via
DPMS and grabs the touchscreen at the evdev level so that no touch events
reach sway/chromium while the screen is off.

When a touch is detected on the grabbed device the script turns the display
back on, keeps the grab for a short period (so the "wake" touch doesn't
register as a tap in the app), then releases and exits.  A synthetic
cursor move pokes the compositor so it registers activity — without this,
sway never sees input (we grabbed it all) and swayidle cannot re-arm.
"""

import glob
import os
import subprocess
import time

import evdev
import evdev.ecodes as e

XDG_RUNTIME_DIR = "/tmp/kiosk-xdg"


def ensure_sway_env():
    """Set SWAYSOCK and WAYLAND_DISPLAY so swaymsg can reach the compositor."""
    os.environ.setdefault("XDG_RUNTIME_DIR", XDG_RUNTIME_DIR)
    if "WAYLAND_DISPLAY" not in os.environ:
        # Find the most recent wayland socket (wayland-0 after boot, may
        # increment after deploy-triggered sway restarts).
        candidates = sorted(glob.glob(os.path.join(XDG_RUNTIME_DIR, "wayland-*")),
                            key=os.path.getmtime, reverse=True)
        for c in candidates:
            if not c.endswith(".lock"):
                os.environ["WAYLAND_DISPLAY"] = os.path.basename(c)
                break
    if "SWAYSOCK" not in os.environ:
        socks = sorted(glob.glob(os.path.join(XDG_RUNTIME_DIR, "sway-ipc.*.sock")),
                        key=os.path.getmtime, reverse=True)
        if socks:
            os.environ["SWAYSOCK"] = socks[0]


def find_touchscreen():
    """Return the first multitouch-capable InputDevice, or None."""
    for path in evdev.list_devices():
        dev = evdev.InputDevice(path)
        abs_codes = [code for code, _ in dev.capabilities().get(e.EV_ABS, [])]
        if e.ABS_MT_POSITION_X in abs_codes:
            return dev
        dev.close()
    return None


def main():
    ensure_sway_env()
    dev = find_touchscreen()
    if dev is None:
        return

    # Turn display off
    subprocess.run(["swaymsg", "output", "*", "dpms", "off"], check=False)

    dev.grab()
    try:
        # Block until a touch event arrives
        for event in dev.read_loop():
            if event.type in (e.EV_KEY, e.EV_ABS):
                break

        # Turn display back on immediately
        subprocess.run(["swaymsg", "output", "*", "dpms", "on"], check=False)

        # Keep the grab for a moment so remaining touch-up / move events
        # from the wake gesture don't reach the app, and so the display has
        # time to power on before the user can interact.
        deadline = time.monotonic() + 4.0
        while time.monotonic() < deadline:
            try:
                dev.read()  # drain queued events
            except BlockingIOError:
                pass
            time.sleep(0.05)
    finally:
        dev.ungrab()
        dev.close()

    # Poke the compositor so it registers activity and sends "resumed" to
    # swayidle.  Without this, sway never sees input (we grabbed it all)
    # and swayidle cannot re-arm — display sleep would work only once.
    subprocess.run(
        ["swaymsg", "seat", "-", "cursor", "move", "1", "0"],
        check=False,
    )


if __name__ == "__main__":
    main()
