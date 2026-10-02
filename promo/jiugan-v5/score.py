#!/usr/bin/env python3
"""score.py — 揪甘心 31.5 s (v5): the user's track (moodmode · Commercial Fun, music/track.mp3) cut to the film, with a
light layer of UI sounds on top. The track is 100 BPM (a beat every 0.6 s from 0.0); the film's beats sit on its grid.

Music edit: track 0.0–26.4 s, then a beat-matched splice to 69.6 s → end, so the track's last hit (72.6 s) lands at
film 29.4 s, where the badge lands. The track's own stop (23.0–24.0 s) is the hold on the decision card; its re-entry
at 24.0 s is the card becoming the pin that goes to every phone.  Run → mix.wav (48 kHz stereo)."""
import os, sys, subprocess, wave
import numpy as np
sys.path.insert(0, os.path.expanduser("~/.claude/skills/onetake/scripts"))
from sfx_palette import Score, air, glass, wood, sub, bubble, SR
HERE = os.path.dirname(os.path.abspath(__file__)); DUR = 31.5
rng = np.random.default_rng(11)

# ── UI sounds: fewer and softer than before, the music carries the energy ──
s = Score(dur=DUR, T60=0.9); P = s.place
PAN = [-0.5, 0.5, -0.5, 0.5]; HP = 0.5
P(bubble(440, 0.24), 0.30, 0.18, -0.2, 0.3)
P(glass(1046, 1.0, 0.5), 1.22, 0.12, -0.1, 0.4); P(glass(1568, 1.0, 0.4), 1.26, 0.08, -0.1, 0.4)
P(wood(240, 0.08), 1.80, 0.22, 0.0, 0.2)
for i in range(11):
    if rng.uniform() < 0.45: continue
    P(wood(170 + rng.uniform(-18, 18), 0.07), 2.70 + i / 16, 0.07, 0.0, 0.12)
SCALE = [523, 587, 659, 784, 880, 988, 1046]; n = 0
for t0, t1, c in [(4.2, 4.8, 4), (5.1, 5.4, 3)]:
    for i in range(c):
        P(glass(SCALE[n], 0.4, 0.4), t0 + (t1 - t0) * i / (c - 1), 0.07, -0.2 + i * 0.12, 0.25); n += 1
P(wood(240, 0.08), 6.00, 0.26, 0.0, 0.2)
P(air(1.2, 220, 2400, 1.2, 0.5), 6.6, 0.28, HP, 0.45, pan_to=-0.4)
for k in range(3): P(glass(784 + k * 98, 0.6, 0.5), 7.80 + k * 0.3, 0.08, PAN[k], 0.4)
PITCH = {'A': 620, 'I': 500, 'U': 380}
for t, st in zip((9.0, 9.3, 9.6), 'AAA'): P(bubble(PITCH[st], 0.18), t, 0.22, -0.5, 0.25)
P(glass(784, 0.6, 0.5), 9.9, 0.1, -0.5, 0.4)
P(air(0.4, 2600, 300, 1.4, 0.4), 10.0, 0.18, -0.5, 0.35, pan_to=0.5)
P(bubble(500, 0.18), 10.5, 0.22, 0.5, 0.25); P(glass(784, 0.6, 0.5), 10.8, 0.08, 0.5, 0.4)
for t, k in ((11.1, 2), (11.4, 3)): P(glass(880, 0.6, 0.5), t, 0.06, PAN[k], 0.4)
for k in range(4):
    for r in range(3): P(glass(880 + r * 110, 0.5, 0.4), 11.85 + k * 0.11 + r * 0.05 + 0.78, 0.045, PAN[k] * 0.5, 0.35)
P(glass(1046, 1.4, 0.5), 13.8, 0.12, 0.0, 0.5); P(glass(1318, 1.4, 0.4), 13.82, 0.08, 0.05, 0.5)
P(sub(60, 0.5), 15.9, 0.18, HP, 0.3)
for i, f in enumerate((1318, 1568, 1976)): P(glass(f, 0.9, 0.35), 16.5 + i * 0.09, 0.06, -0.2 + i * 0.2, 0.5)
P(wood(240, 0.08), 17.40, 0.24, 0.0, 0.2)
for i, t in enumerate((18.0, 18.3, 18.6)): P(bubble(560 + i * 60, 0.16), t, 0.18, 0.0, 0.2)
P(wood(240, 0.08), 19.20, 0.22, 0.0, 0.2)
for i in range(5): P(glass(880 * 2 ** (i / 6), 0.45, 0.25), 19.32 + i * 0.15, 0.035, -0.3 + i * 0.15, 0.5)
P(wood(250, 0.07), 21.0, 0.24, 0.0, 0.2); P(glass(1318, 0.8, 0.5), 21.02, 0.08, 0.0, 0.4)
P(air(0.9, 2000, 400, 1.3, 0.4), 21.3, 0.22, HP, 0.45, pan_to=0.0)
P(sub(54, 0.8), 22.2, 0.3, 0.0, 0.35)                                     # the card lands, then the track stops
P(sub(50, 0.9), 24.0, 0.32, 0.0, 0.35)                                    # the re-entry: it becomes the pin
for k in range(1, 4): P(glass(988 + k * 110, 0.8, 0.5), 24.95 + k * 0.15, 0.07, PAN[k], 0.45)
# 叮咚 on 小明's phone, with a buzz under it
P(glass(1318, 1.2, 0.6), 26.30, 0.2, -0.1, 0.45); P(glass(1046, 1.4, 0.6), 26.55, 0.2, -0.1, 0.45)
for i in range(5): P(wood(150, 0.05), 26.30 + i * 0.038, 0.07, -0.1, 0.1)
P(air(0.7, 2400, 300, 1.3, 0.6), 28.3, 0.18, -0.3, 0.45, pan_to=0.0)
P(sub(56, 0.5), 29.0, 0.16, 0.0, 0.3)
P(sub(48, 1.1), 29.4, 0.3, 0.0, 0.4)
s.write(os.path.join(HERE, "sfx.wav"))

# ── music edit ──
def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "s16le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).reshape(-1, 2).astype(np.float64) / 32768
m = load(os.path.join(HERE, "music", "track.mp3"))
X, Y, XF = 26.4, 69.6, 0.012                    # splice beat-to-beat (beats 44 → 116), 12 ms crossfade
a, b = m[:int(X * SR)], m[int(Y * SR):]
f = int(XF * SR); ramp = np.linspace(0, 1, f)[:, None]
music = np.concatenate([a[:-f], a[-f:] * (1 - ramp) + b[:f] * ramp, b[f:]])
out = np.zeros((int(DUR * SR), 2)); L = min(len(out), len(music)); out[:L] = music[:L] * 0.62
sfx = load(os.path.join(HERE, "sfx.wav")); out[:len(sfx)] += sfx[:len(out)] * 0.9
out[int(0.0 * SR):int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))[:, None]
pk = np.abs(out).max(); out *= 10 ** (-4.5 / 20) / pk            # peak −4.5 dBFS so the AAC stays under −3
with wave.open(os.path.join(HERE, "mix.wav"), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(out, -1, 1) * 32767).astype(np.int16).tobytes())
print("mix.wav", DUR, "s · music", round(len(music) / SR, 2), "s · peak −4.5 dBFS")
