#!/usr/bin/env python3
"""Display sleep handler for kiosk.

Called by swayidle when the idle timeout expires. Turns the display off via
wlopm (wlr-output-power-management protocol).

Two wake strategies depending on available hardware:

Touchscreen present:
  Grabs the touchscreen at the evdev level so that the wake touch doesn't
  reach labwc/chromium (prevents accidental button taps). Waits for touch,
  turns display on, holds the grab briefly, then releases and pokes the
  compositor via uinput so swayidle re-arms.

No touchscreen (keyboard/mouse only):
  Exits immediately after turning the display off. The swayidle 'resume'
  command (configured in labwc autostart) handles turning the display back
  on when the compositor sees any input.
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

    dpms_off()

    if dev is None:
        # No touchscreen — swayidle 'resume' command handles wake.
        return

    # Touchscreen path: grab to swallow the wake touch.
    dev.grab()
    try:
        for event in dev.read_loop():
            if event.type in (e.EV_KEY, e.EV_ABS):
                break

        dpms_on()

        # Hold grab so the wake gesture doesn't register as a tap.
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
