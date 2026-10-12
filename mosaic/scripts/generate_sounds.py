#!/usr/bin/env python3
"""
Generates the kitchen display's built-in alert tones.

The sounds are committed to `src/assets/sounds/`, so this script only needs to be
re-run when a tone is changed. It exists so the tones stay reproducible and
auditable rather than arriving as opaque binaries: a kitchen alert is a piece
of the product, and "why does it sound like that" should have an answer.

Everything is synthesised with numpy — no sample libraries, no licensing
questions. Tones are bell-like (a struck resonator: instant attack, long
exponential decay, slightly inharmonic partials) because a pure sine reads as
a machine fault while a bell reads as a notification.

    python3 scripts/generate_sounds.py
"""

import math
import os
import struct
import wave

import numpy as np

RATE = 22050  # plenty for tones under 4 kHz, and half the size of 44.1k
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "assets", "sounds")

# Equal temperament, A4 = 440 Hz.
NOTES = {
    "E5": 659.26, "A5": 880.00, "C6": 1046.50,
    "E6": 1318.51, "G6": 1567.98, "A6": 1760.00,
}


def bell(freq, duration, decay=7.0, partials=((1.0, 1.0), (2.01, 0.38), (3.04, 0.16), (4.07, 0.06))):
    """A struck-bell tone: inharmonic partials under one exponential decay.

    The partial ratios are deliberately a little sharp of whole numbers, which
    is what stops it sounding like a synthesiser test tone.
    """
    t = np.linspace(0, duration, int(RATE * duration), endpoint=False)
    wave_out = np.zeros_like(t)
    for ratio, amp in partials:
        # Higher partials of a real bell die away faster than the fundamental.
        wave_out += amp * np.sin(2 * math.pi * freq * ratio * t) * np.exp(-decay * ratio * 0.55 * t)

    # A 4 ms attack ramp removes the click that an instantaneous onset makes
    # on cheap kitchen speakers.
    attack = int(RATE * 0.004)
    if attack and attack < len(wave_out):
        wave_out[:attack] *= np.linspace(0, 1, attack)
    return wave_out


def beep(freq, duration, decay=18.0):
    """A short, hard-edged tone for urgency. Third harmonic gives it bite."""
    t = np.linspace(0, duration, int(RATE * duration), endpoint=False)
    env = np.exp(-decay * t)
    out = (np.sin(2 * math.pi * freq * t) + 0.28 * np.sin(2 * math.pi * freq * 3 * t)) * env
    attack = int(RATE * 0.003)
    if attack and attack < len(out):
        out[:attack] *= np.linspace(0, 1, attack)
    return out


def silence(duration):
    return np.zeros(int(RATE * duration))


def sequence(*parts):
    """Concatenates segments, then pads a short tail so the decay is not cut."""
    return np.concatenate(list(parts) + [silence(0.05)])


def overlay(base, addition, at):
    """Mixes `addition` into `base` starting at `at` seconds, extending if needed."""
    start = int(RATE * at)
    end = start + len(addition)
    if end > len(base):
        base = np.concatenate([base, np.zeros(end - len(base))])
    base[start:end] += addition
    return base


def write(name, samples, peak=0.82):
    """Normalises to a fixed peak and writes 16-bit mono PCM.

    Every tone is normalised to the same peak so the display's own volume
    control is the only thing that changes how loud an alert is — otherwise a
    quieter tone would be silently ignored in a noisy kitchen.
    """
    highest = np.max(np.abs(samples))
    if highest > 0:
        samples = samples / highest * peak
    pcm = np.clip(samples, -1.0, 1.0)
    frames = struct.pack("<%dh" % len(pcm), *(int(v * 32767) for v in pcm))

    path = os.path.join(OUT_DIR, name)
    with wave.open(path, "wb") as fh:
        fh.setnchannels(1)
        fh.setsampwidth(2)
        fh.setframerate(RATE)
        fh.writeframes(frames)
    print("%-22s %6.2f s  %6.1f KB" % (name, len(pcm) / RATE, len(frames) / 1024))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    # New order — a rising major third, the friendliest "look up" interval.
    # The two notes overlap so it lands as one gesture, not two events.
    new_order = sequence(bell(NOTES["C6"], 0.75, decay=6.0))
    new_order = overlay(new_order, bell(NOTES["E6"], 0.95, decay=5.2) * 0.9, 0.14)
    write("new-order.wav", new_order)

    # Order modified — same family, but falling, so the kitchen can tell the
    # two apart without looking at the screen.
    modified = sequence(bell(NOTES["E6"], 0.55, decay=7.5))
    modified = overlay(modified, bell(NOTES["C6"], 0.75, decay=6.5) * 0.9, 0.13)
    write("order-modified.wav", modified)

    # Cancelled — a low, flat double knock. Deliberately unpleasant: this one
    # means stop cooking, and it should not be mistakable for a new ticket.
    write("order-cancelled.wav", sequence(
        beep(NOTES["A5"], 0.18, decay=14.0),
        silence(0.07),
        beep(NOTES["E5"], 0.30, decay=9.0),
    ))

    # Late order — three quick high beeps, the classic timer pattern.
    write("order-late.wav", sequence(
        beep(NOTES["A6"], 0.10, decay=26.0), silence(0.07),
        beep(NOTES["A6"], 0.10, decay=26.0), silence(0.07),
        beep(NOTES["A6"], 0.16, decay=20.0),
    ))

    # Served — a single short upward blip, quiet confirmation of an action the
    # cook just took. It has to be brief; it fires all shift long.
    write("order-served.wav", sequence(bell(NOTES["G6"], 0.22, decay=16.0)), peak=0.55)


if __name__ == "__main__":
    main()
