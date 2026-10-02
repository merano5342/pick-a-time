#!/usr/bin/env python3
"""score.py — 揪甘心 25 s on the onetake synthetic palette (one room). Times mirror comp.html's T / TAPS / LAUNCH.
wood = 阿傑's thumb on his own phone · air = things crossing the map · bubble = a friend's vote ·
glass = answers landing / AI · sub = the landings. Run → sfx.wav."""
import os, sys
sys.path.insert(0, os.path.expanduser("~/.claude/skills/onetake/scripts"))
from sfx_palette import Score, air, glass, wood, sub, bubble
import numpy as np
rng = np.random.default_rng(11)
s = Score(dur=25.0, T60=1.0); P = s.place
HOSTPAN, PAN = 0.5, [-0.5, 0.5, -0.5, 0.5]

# 1 · 快速建立
P(wood(230, 0.08), 0.30, 0.22, 0.0, 0.15)
for i in range(11):
    if rng.uniform() < 0.3: continue
    P(wood(170 + rng.uniform(-18, 18), 0.08), 0.45 + i / 14 + rng.uniform(0, 0.004), 0.10 * rng.uniform(0.7, 1.2), 0.0, 0.15)
for t, f in zip((1.40, 1.72, 2.04), (523, 587, 659)):
    P(bubble(520, 0.16), t, 0.2, 0.0, 0.2); P(glass(f, 0.5, 0.5), t + 0.01, 0.07, 0.0, 0.35)
P(wood(240, 0.08), 2.55, 0.32, 0.0, 0.2)
P(air(0.35, 300, 1800, 1.3, 0.5), 2.6, 0.16, 0.0, 0.4)

# 2 · the link crosses the map, three phones wake
P(air(1.2, 220, 2600, 1.2, 0.5), 3.15, 0.45, HOSTPAN, 0.5, pan_to=-0.4)
for k in range(3): P(glass(784 + k * 98, 0.7, 0.6), 4.32 + k * 0.06, 0.1, PAN[k], 0.45)
P(sub(66, 0.5), 4.32, 0.2, 0.0, 0.3)

# 3 · 快速投票
TAPS = [((5.55, 5.82, 6.08), 6.38, 'AAA'), ((7.05, 6.40, 6.68), 7.32, 'IAA'), ((6.62, 6.92, 7.22), 7.82, 'UAA'), ((6.20, 6.50, 6.80), 7.95, 'AAA')]
PITCH = {'A': 620, 'I': 500, 'U': 380}
FOCUS = {0: (5.3, 6.6), 1: (6.9, 7.5)}                      # whose phone the camera is on
for k, (taps, sub_t, v) in enumerate(TAPS):
    for t, st in zip(taps, v):
        on = k in FOCUS and FOCUS[k][0] <= t <= FOCUS[k][1]
        P(bubble(PITCH[st] + rng.uniform(-15, 15), 0.2), t, 0.30 if on else 0.08, PAN[k], 0.3)
    P(glass(784, 0.7, 0.6), sub_t, 0.12, PAN[k], 0.45); P(glass(1046, 0.8, 0.5), sub_t + 0.07, 0.09, PAN[k], 0.45)
P(air(0.45, 2600, 300, 1.4, 0.4), 6.6, 0.32, -0.5, 0.4, pan_to=0.5)   # the whip to Lily

# 4 · 自動彙整
P(air(1.0, 260, 2200, 1.2, 0.45), 8.1, 0.32, 0.0, 0.5)
ROWPITCH = {1: 1046, 2: 880, 0: 659}
VOTES = ['AAA', 'IAA', 'UAA', 'AAA']
for k in range(4):
    for r in range(3):
        f = ROWPITCH[r] * (1.0 if VOTES[k][r] == 'A' else 0.89 if VOTES[k][r] == 'I' else 0.75)
        P(glass(f, 0.6, 0.55), 8.12 + k * 0.11 + r * 0.05 + 0.78, 0.07, PAN[k] * 0.5, 0.4)
P(glass(1046, 1.6, 0.5), 9.70, 0.15, 0.0, 0.6); P(glass(1318, 1.6, 0.4), 9.72, 0.11, 0.05, 0.6); P(glass(1568, 1.6, 0.3), 9.75, 0.08, -0.05, 0.6)

# 5 · AI 選餐廳
P(air(0.8, 300, 2200, 1.2, 0.5), 10.9, 0.3, 0.0, 0.5, pan_to=HOSTPAN)
P(sub(60, 0.5), 11.62, 0.24, HOSTPAN, 0.3)
P(wood(240, 0.08), 11.95, 0.26, 0.0, 0.2)
for i, t in enumerate((12.30, 12.58, 12.90)): P(bubble(560 + i * 60, 0.18), t, 0.24, 0.0, 0.25)
P(glass(1175, 0.5, 0.4), 12.72, 0.06, 0.0, 0.4)
P(wood(240, 0.08), 13.20, 0.26, 0.0, 0.2)
for i in range(6):                                            # AI thinking: a soft rising shimmer
    P(glass(880 * 2 ** (i / 12 * 2), 0.5, 0.25), 13.32 + i * 0.13, 0.045, -0.3 + i * 0.12, 0.6)
for i, f in enumerate((784, 988, 1175)): P(bubble(f * 0.6, 0.2), 14.2 + i * 0.12, 0.18, 0.0, 0.3)
P(wood(250, 0.07), 15.15, 0.28, 0.0, 0.2); P(glass(1318, 0.9, 0.5), 15.17, 0.1, 0.0, 0.45)
P(air(1.0, 2000, 300, 1.3, 0.35), 15.6, 0.35, HOSTPAN, 0.5, pan_to=0.0)
P(sub(54, 0.9), 16.55, 0.45, 0.0, 0.4); P(glass(523, 1.4, 0.4), 16.57, 0.1, 0.0, 0.6)
for k in range(4): P(glass(988 + k * 110, 0.9, 0.5), 17.25 + k * 0.07, 0.08, PAN[k], 0.5)

# 6 · the name
P(air(0.75, 2400, 260, 1.3, 0.6), 19.4, 0.3, -0.3, 0.5, pan_to=0.0)
P(sub(52, 1.1), 20.15, 0.5, 0.0, 0.45); P(glass(523, 1.6, 0.4), 20.17, 0.12, 0.0, 0.6)
for i in range(3): P(wood(200 - i * 12, 0.09), 19.95 + i * 0.07 + 0.06, 0.18, -0.15 + i * 0.15, 0.25)
for i, f in enumerate((659, 784, 988, 1175)): P(glass(f, 1.2, 0.4), 20.5 + i * 0.14, 0.07, -0.3 + i * 0.2, 0.6)

s.write(os.path.join(os.path.dirname(os.path.abspath(__file__)), "sfx.wav"))
