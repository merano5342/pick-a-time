#!/usr/bin/env python3
"""score.py — 揪甘心 29 s (v4) on the onetake synthetic palette, one room. Times mirror comp.html's T / TAPS / LAUNCH.
wood = 阿傑's thumb · bubble = taps and votes · air = things crossing the map · glass = arrivals and AI · sub = landings."""
import os, sys
sys.path.insert(0, os.path.expanduser("~/.claude/skills/onetake/scripts"))
from sfx_palette import Score, air, glass, wood, sub, bubble
import numpy as np
rng = np.random.default_rng(11)
s = Score(dur=29.0, T60=1.0); P = s.place
PAN = [-0.5, 0.5, -0.5, 0.5]; HP = 0.5

# 0 · the idea
P(bubble(440, 0.24), 0.32, 0.22, -0.2, 0.35)
P(glass(1046, 1.2, 0.6), 1.17, 0.14, -0.1, 0.5); P(glass(1568, 1.2, 0.5), 1.22, 0.1, -0.1, 0.5); P(bubble(620, 0.2), 1.15, 0.22, -0.1, 0.3)
P(wood(240, 0.08), 1.95, 0.28, 0.0, 0.2)
P(air(0.5, 300, 2400, 1.3, 0.4), 2.05, 0.22, 0.0, 0.45)

# 1 · 快速建立 — keys, then two drags: a rising tick per painted day
P(wood(230, 0.08), 2.85, 0.22, 0.0, 0.15)
for i in range(11):
    if rng.uniform() < 0.3: continue
    P(wood(170 + rng.uniform(-18, 18), 0.08), 2.95 + i / 14 + rng.uniform(0, 0.004), 0.10 * rng.uniform(0.7, 1.2), 0.0, 0.15)
DRAGS = [(4.30, 4.85, 4), (5.05, 5.40, 3)]
note = 0; SCALE = [523, 587, 659, 784, 880, 988, 1046]
for t0, t1, n in DRAGS:
    P(air(t1 - t0 + 0.15, 400, 1400, 1.6, 0.5), t0, 0.1, 0.0, 0.3)
    for i in range(n):
        t = t0 + (t1 - t0) * i / (n - 1)
        P(bubble(SCALE[note] * 0.7, 0.14), t, 0.16, -0.2 + i * 0.12, 0.2); P(glass(SCALE[note], 0.4, 0.4), t + 0.01, 0.05, 0.0, 0.3); note += 1
P(wood(240, 0.08), 5.95, 0.32, 0.0, 0.2)
P(air(0.35, 300, 1800, 1.3, 0.5), 6.0, 0.16, 0.0, 0.4)

# 2 · the link crosses the map
P(air(1.3, 220, 2600, 1.2, 0.5), 6.5, 0.45, HP, 0.5, pan_to=-0.4)
for k in range(3): P(glass(784 + k * 98, 0.7, 0.6), 7.72 + k * 0.06, 0.1, PAN[k], 0.45)
P(sub(66, 0.5), 7.72, 0.2, 0.0, 0.3)

# 3 · 快速投票
TAPS = [((9.00, 9.27, 9.53), 9.85, 'AAA'), ((10.50, 9.60, 9.90), 10.95, 'IAA'), ((10.10, 10.40, 10.70), 11.35, 'UAA'), ((9.70, 10.00, 10.30), 11.50, 'AAA')]
PITCH = {'A': 620, 'I': 500, 'U': 380}
FOCUS = {0: (8.8, 9.95), 1: (10.35, 11.0)}
for k, (taps, sub_t, v) in enumerate(TAPS):
    for t, st in zip(taps, v):
        on = k in FOCUS and FOCUS[k][0] <= t <= FOCUS[k][1]
        P(bubble(PITCH[st] + rng.uniform(-15, 15), 0.2), t, 0.30 if on else 0.07, PAN[k], 0.3)
    on = k in FOCUS and FOCUS[k][0] <= sub_t <= FOCUS[k][1]
    P(glass(784, 0.7, 0.6), sub_t, 0.14 if on else 0.08, PAN[k], 0.45); P(glass(1046, 0.8, 0.5), sub_t + 0.07, 0.1 if on else 0.06, PAN[k], 0.45)
P(air(0.45, 2600, 300, 1.4, 0.4), 10.0, 0.32, -0.5, 0.4, pan_to=0.5)

# 4 · 自動彙整
P(air(1.0, 260, 2200, 1.2, 0.45), 11.8, 0.32, 0.0, 0.5)
ROWPITCH = {1: 1046, 2: 880, 0: 659}; VOTES = ['AAA', 'IAA', 'UAA', 'AAA']
for k in range(4):
    for r in range(3):
        f = ROWPITCH[r] * (1.0 if VOTES[k][r] == 'A' else 0.89 if VOTES[k][r] == 'I' else 0.75)
        P(glass(f, 0.6, 0.55), 11.85 + k * 0.11 + r * 0.05 + 0.78, 0.07, PAN[k] * 0.5, 0.4)
P(glass(1046, 1.6, 0.5), 13.5, 0.15, 0.0, 0.6); P(glass(1318, 1.6, 0.4), 13.52, 0.11, 0.05, 0.6); P(glass(1568, 1.6, 0.3), 13.55, 0.08, -0.05, 0.6)

# 5 · AI 選餐廳 — the slot comes home, the button arrives and shimmers, then the flow
P(air(0.9, 300, 2200, 1.2, 0.5), 14.8, 0.3, 0.0, 0.5, pan_to=HP)
P(sub(60, 0.5), 15.75, 0.24, HP, 0.3); P(glass(784, 1.0, 0.5), 15.77, 0.08, HP, 0.5)
P(bubble(520, 0.24), 16.15, 0.22, 0.0, 0.35)
for i, f in enumerate((1318, 1568, 1976)): P(glass(f, 1.0, 0.35), 16.55 + i * 0.09, 0.07, -0.2 + i * 0.2, 0.6)   # the glint
P(wood(240, 0.08), 17.35, 0.28, 0.0, 0.2)
for i, t in enumerate((17.75, 18.05, 18.35)): P(bubble(560 + i * 60, 0.18), t, 0.24, 0.0, 0.25)
P(glass(1175, 0.5, 0.4), 18.15, 0.06, 0.0, 0.4)
P(wood(240, 0.08), 18.7, 0.26, 0.0, 0.2)
for i in range(6): P(glass(880 * 2 ** (i / 6), 0.5, 0.25), 18.82 + i * 0.13, 0.045, -0.3 + i * 0.12, 0.6)
for i, f in enumerate((784, 988, 1175)): P(bubble(f * 0.6, 0.2), 19.7 + i * 0.12, 0.18, 0.0, 0.3)
P(wood(250, 0.07), 20.6, 0.28, 0.0, 0.2); P(glass(1318, 0.9, 0.5), 20.62, 0.1, 0.0, 0.45)
P(air(1.0, 2000, 300, 1.3, 0.35), 21.0, 0.35, HP, 0.5, pan_to=0.0)
P(sub(54, 0.9), 22.0, 0.45, 0.0, 0.4); P(glass(523, 1.4, 0.4), 22.02, 0.1, 0.0, 0.6)
for k in range(4): P(glass(988 + k * 110, 0.9, 0.5), 22.65 + k * 0.07, 0.08, PAN[k], 0.5)
P(air(0.7, 300, 1600, 1.2, 0.5), 22.9, 0.18, 0.0, 0.45, pan_to=-0.5)

# 6 · the name
P(air(0.75, 2400, 260, 1.3, 0.6), 24.7, 0.3, -0.3, 0.5, pan_to=0.0)
P(sub(52, 1.1), 25.45, 0.5, 0.0, 0.45); P(glass(523, 1.6, 0.4), 25.47, 0.12, 0.0, 0.6)
for i in range(3): P(wood(200 - i * 12, 0.09), 25.25 + i * 0.07 + 0.06, 0.18, -0.15 + i * 0.15, 0.25)
for i, f in enumerate((659, 784, 988, 1175)): P(glass(f, 1.2, 0.4), 25.8 + i * 0.14, 0.07, -0.3 + i * 0.2, 0.6)

s.write(os.path.join(os.path.dirname(os.path.abspath(__file__)), "sfx.wav"))
