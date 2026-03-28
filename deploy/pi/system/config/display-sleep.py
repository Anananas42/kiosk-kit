#!/usr/bin/env python3
"""Display sleep handler for kiosk touchscreen.

Called by swayidle when the idle timeout expires. Turns the display off via
wlopm (wlr-output-power-management protocol) and grabs the touchscreen at
the evdev level so that no touch events reach labwc/chromium while the
screen is off.

When a touch is detected on the grabbed device the script turns the display
back on, keeps the grab for a short period (so the "wake" touch doesn't
register as a tap in the app), then releases and exits.  A synthetic uinput
event pokes the compositor so it registers activity — without this, labwc
never sees input (we grabbed it all) and swayidle cannot re-arm.
"""

import time

import evdev
import evdev.ecodes as e
from evdev import UInput

WAKE_GRAB_HOLD_SECS = 4.0


def find_touchscreen():
    """Return the first multitouch-capable InputDevice, or None."""
    for path in evdev.list_devices():
        dev = evdev.InputDevice(path)
        abs_codes = [code for code, _ in dev.capabilities().get(e.EV_ABS, [])]
        if e.ABS_MT_POSITION_X in abs_codes:
            return dev
        dev.close()
    return None


def dpms_off():
    import subprocess
    subprocess.run(["wlopm", "--off", "*"], check=False)


def dpms_on():
    import subprocess
    subprocess.run(["wlopm", "--on", "*"], check=False)


def poke_compositor():
    """Inject a synthetic relative mouse move via uinput.

    This makes labwc register activity so swayidle sees a "resumed" event
    and re-arms the idle timer. Without this, display sleep works only once.
    """
    cap = {e.EV_REL: [e.REL_X, e.REL_Y]}
    with UInput(cap, name="kioskkit-wake") as ui:
        ui.write(e.EV_REL, e.REL_X, 1)
        ui.write(e.EV_REL, e.REL_Y, 0)
        ui.syn()
        time.sleep(0.05)
        # Move back so cursor doesn't drift
        ui.write(e.EV_REL, e.REL_X, -1)
        ui.write(e.EV_REL, e.REL_Y, 0)
        ui.syn()


def main():
    dev = find_touchscreen()
    if dev is None:
        return

    dpms_off()

    dev.grab()
    try:
        # Block until a touch event arrives
        for event in dev.read_loop():
            if event.type in (e.EV_KEY, e.EV_ABS):
                break

        dpms_on()

        # Keep the grab so the wake gesture doesn't register as a tap,
        # and give the display time to power on.
        deadline = time.monotonic() + WAKE_GRAB_HOLD_SECS
        while time.monotonic() < deadline:
            try:
                dev.read()  # drain queued events
            except BlockingIOError:
                pass
            time.sleep(0.05)
    finally:
        dev.ungrab()
        dev.close()

    poke_compositor()


if __name__ == "__main__":
    main()
