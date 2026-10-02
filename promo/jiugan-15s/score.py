#!/usr/bin/env python3
"""score.py — 揪甘心 15 s, on the onetake synthetic palette (one room). Times mirror comp.html's T / TAPS / LAUNCH.
Materials by role: wood = the host's mouse and keys · air = the link's flight · bubble = a friend's thumb ·
glass = an answer landing in the ranking (each row its own pitch) · sub = the two landings. Run → sfx.wav."""
import os, sys
sys.path.insert(0, os.path.expanduser("~/.claude/skills/onetake/scripts"))
from sfx_palette import Score, air, glass, wood, sub, bubble
import numpy as np
rng = np.random.default_rng(11)
s = Score(dur=15.0, T60=1.0); P = s.place

# 1 · 快速建立 — muted keys under the title, three date clicks, the button
TYPE0, CPS, N = 0.45, 14, 11
P(wood(230, 0.08), 0.36, 0.22, -0.2, 0.15)
for i in range(N):
    if rng.uniform() < 0.3: continue
    P(wood(170 + rng.uniform(-18, 18), 0.08), TYPE0 + i / CPS + rng.uniform(0, 0.004), 0.10 * rng.uniform(0.7, 1.2), -0.15, 0.15)
for t, f in zip((1.38, 1.72, 2.06), (523, 587, 659)):
    P(wood(250, 0.07), t, 0.26, -0.3, 0.18); P(glass(f, 0.5, 0.5), t + 0.01, 0.07, -0.3, 0.35)
P(wood(240, 0.08), 2.95, 0.32, -0.1, 0.2); P(wood(190, 0.07), 3.01, 0.2, -0.1, 0.2)

# 2 · the link flies — one long air across the stereo field, a felt landing as it splits onto the phones
P(air(0.35, 300, 1800, 1.3, 0.5), 3.0, 0.16, -0.2, 0.4)
P(air(1.0, 200, 3200, 1.2, 0.55), 3.3, 0.5, -0.6, 0.5, pan_to=0.3)
P(sub(66, 0.6), 4.27, 0.34, 0.0, 0.3)
for k in range(4): P(bubble(560 + k * 40, 0.2), 4.52 + k * 0.05, 0.14, -0.6 + k * 0.4, 0.35)

# 3 · 快速投票 — every tap a rounded pop; ○ bright, △ middle, ✕ low; 送出 a small two-note glass
TAPS = [((5.30, 5.58, 5.86), 6.30, 'AAA'), ((5.45, 5.80, 6.10), 6.62, 'IAA'),
        ((5.55, 5.92, 6.30), 6.85, 'UAA'), ((5.38, 5.70, 6.18), 6.98, 'AAA')]
PITCH = {'A': 620, 'I': 500, 'U': 380}
for k, (taps, sub_t, v) in enumerate(TAPS):
    pan = -0.6 + k * 0.4; g = 0.30 if k == 0 else 0.17          # 小明's phone is the close-up
    for t, st in zip(taps, v): P(bubble(PITCH[st] + rng.uniform(-15, 15), 0.2), t, g, pan, 0.3)
    P(glass(784, 0.7, 0.6), sub_t, 0.10 if k else 0.15, pan, 0.45); P(glass(1046, 0.8, 0.5), sub_t + 0.07, 0.08 if k else 0.12, pan, 0.45)

# 4 · 自動彙整 — the answers leave on one breath and land as glass, row by row (row 1 highest)
P(air(0.9, 260, 2200, 1.2, 0.45), 7.55, 0.3, 0.0, 0.5)
P(sub(58, 0.6), 7.62, 0.14, 0.0, 0.3)
ROWPITCH = {1: 1046, 2: 880, 0: 659}                            # slot index → pitch (RANK = 1, 2, 0)
VOTES = ['AAA', 'IAA', 'UAA', 'AAA']
for k in range(4):
    for r in range(3):
        t = 7.62 + k * 0.12 + r * 0.05 + 0.62
        f = ROWPITCH[r] * (1.0 if VOTES[k][r] == 'A' else 0.89 if VOTES[k][r] == 'I' else 0.75)
        P(glass(f, 0.6, 0.55), t, 0.075, -0.3 + r * 0.3, 0.4)
# the best slot: one chord, then the hold is quiet
P(glass(1046, 1.6, 0.5), 9.25, 0.16, 0.0, 0.6); P(glass(1318, 1.6, 0.4), 9.27, 0.12, 0.05, 0.6); P(glass(1568, 1.6, 0.3), 9.3, 0.08, -0.05, 0.6)

# 5 · the fold and the name
P(air(0.75, 2400, 260, 1.3, 0.6), 11.0, 0.3, 0.0, 0.5)
P(sub(52, 1.1), 11.75, 0.5, 0.0, 0.45); P(glass(523, 1.6, 0.4), 11.77, 0.12, 0.0, 0.6)
for i in range(3): P(wood(200 - i * 12, 0.09), 11.55 + i * 0.07 + 0.06, 0.18, -0.15 + i * 0.15, 0.25)
for i, f in enumerate((659, 784, 1046)): P(glass(f, 1.2, 0.4), 12.05 + i * 0.16, 0.07, -0.3 + i * 0.3, 0.6)

s.write(os.path.join(os.path.dirname(os.path.abspath(__file__)), "sfx.wav"))
