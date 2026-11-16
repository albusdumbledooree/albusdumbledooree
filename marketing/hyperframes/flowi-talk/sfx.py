"""Sound: the speaker's voice on top, synthesised effects well under it (no music).

python3 sfx.py <work dir>     reads base.mov + sfx.json + zoom.json, writes mix.wav (48 kHz stereo).
"""
import json, subprocess, sys
import numpy as np

D = sys.argv[1]
SR = 48000
END = json.load(open(f'{D}/zoom.json'))['end']
cues = json.load(open(f'{D}/sfx.json'))
rng = np.random.default_rng(11)


def env(n, a=0.004, d=0.1):
    t = np.arange(n) / SR
    return np.minimum(t / a, 1) * np.exp(-t / d)


def blip():
    n = int(SR * .09); t = np.arange(n) / SR
    f = np.where(t < .03, 1320, 1760)
    return np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * .5 * env(n, .002, .03)


def tick():
    n = int(SR * .05); t = np.arange(n) / SR
    return np.sin(2 * np.pi * 2400 * t) * env(n, .001, .012) * .6


def noise(n): return rng.standard_normal(n)


def lp(x, k):
    y = np.cumsum(x); y[k:] = y[k:] - y[:-k]
    return y / k


def whoosh():
    n = int(SR * .34); t = np.arange(n) / SR
    x = lp(noise(n), 24) * 6
    e = np.sin(np.pi * t / t[-1]) ** 2
    return x * e * .5


def sweep():
    n = int(SR * .3); t = np.arange(n) / SR
    f = 300 * (2400 / 300) ** (t / t[-1])
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / t[-1]) ** 2 * .45


def hit():
    n = int(SR * .6); t = np.arange(n) / SR
    f = 110 * np.exp(-t * 6) + 48
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, .003, .16) + lp(noise(n), 60) * 3 * env(n, .002, .05)) * .8


def slam():
    n = int(SR * .3); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 70 * t) * env(n, .002, .07) + lp(noise(n), 12) * 4 * env(n, .001, .03)) * .8


GEN = {'blip': blip, 'tick': tick, 'whoosh': whoosh, 'sweep': sweep, 'hit': hit, 'slam': slam}
LEVEL = {'blip': .16, 'tick': .09, 'whoosh': .2, 'sweep': .14, 'hit': .3, 'slam': .26}
n = int(END * SR) + SR
bus = np.zeros(n)
for c in cues:
    s = GEN[c['k']]() * LEVEL[c['k']] * c.get('g', 1)
    i = int(c['t'] * SR)
    if i < 0 or i >= n: continue
    s = s[:n - i]
    bus[i:i + len(s)] += s
bus = np.clip(bus, -1, 1)
open(f'{D}/sfx.raw', 'wb').write((bus * 32767).astype('<i2').tobytes())
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', f'{D}/base.mov', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', f'{D}/sfx.raw',
                '-filter_complex', f'[0:a]highpass=f=85,acompressor=threshold=-20dB:ratio=3:attack=8:release=120:makeup=2,loudnorm=I=-15:TP=-1.5:LRA=7,aresample={SR},apad[v];[v][1:a]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.89[m]',
                '-map', '[m]', '-ac', '2', '-ar', str(SR), '-t', f'{END:.3f}', f'{D}/mix.wav'], check=True)
print('mix.wav', END)
