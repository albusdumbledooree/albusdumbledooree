"""FLOWI reels audio: code-made music bed + sound effects + voice-over, mixed and loudness-normalised.

python3 audio.py <assets dir> <name>   reads <name>.mp3 (voice) and <name>.cues.json (from build.js),
writes <name>-mix.wav (voice + music + sfx) and <name>-nomusic.wav (voice + sfx, for adding a trending
sound in the Instagram app). Everything is synthesised here: no recordings, no licences to track.
"""
import json, subprocess, sys
import numpy as np

SR = 48000
rng = np.random.default_rng(7)  # fixed seed: the same file every run


def t_arr(d):
    return np.arange(int(d * SR)) / SR


def env(n, a=0.002, d=0.2):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)


def lp(x, cut):  # one-pole low-pass
    a = np.exp(-2 * np.pi * cut / SR)
    from scipy.signal import lfilter
    return lfilter([1 - a], [1, -a], x)


def bp(x, lo, hi):
    from scipy.signal import butter, sosfilt
    return sosfilt(butter(2, [lo, hi], btype="band", fs=SR, output="sos"), x)


# ---------- sound effects ----------
def sfx_whoosh(d=0.42):
    t = t_arr(d); n = rng.standard_normal(len(t))
    from scipy.signal import butter, sosfilt
    out = np.zeros_like(t); seg = 256
    for i in range(0, len(t), seg):  # band-pass sweeping up then down
        p = i / len(t); f = 400 + 3800 * np.sin(np.pi * p) ** 2
        sos = butter(2, [f * 0.6, min(f * 1.6, SR / 2 - 100)], btype="band", fs=SR, output="sos")
        out[i:i + seg] = sosfilt(sos, n[max(0, i - 2048):i + seg])[-len(out[i:i + seg]):]
    return out * np.sin(np.pi * t / d) ** 1.5 * 0.9


def sfx_pop():
    t = t_arr(0.09); f = 900 * np.exp(-t * 40) + 380
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.001, 0.025) * 0.8


def sfx_stamp():
    t = t_arr(0.35)
    body = np.sin(2 * np.pi * np.cumsum(120 * np.exp(-t * 18) + 55) / SR) * env(len(t), 0.001, 0.09)
    crack = bp(rng.standard_normal(len(t)), 900, 5000) * env(len(t), 0.0005, 0.02)
    return (body * 1.0 + crack * 0.6) * 0.9


def sfx_thud():
    t = t_arr(0.6)
    return np.sin(2 * np.pi * np.cumsum(90 * np.exp(-t * 9) + 38) / SR) * env(len(t), 0.002, 0.22) * 1.1


def sfx_ding():
    t = t_arr(1.4); out = np.zeros_like(t)
    for f, a, d in [(1318.5, 1, 0.6), (1975.5, 0.5, 0.4), (2637, 0.25, 0.25), (3951, 0.12, 0.15)]:
        out += a * np.sin(2 * np.pi * f * t) * env(len(t), 0.001, d)
    return out * 0.35


def sfx_sparkle():
    out = np.zeros(int(0.9 * SR))
    for k, f in enumerate([2093, 2637, 3136, 4186, 3520, 2794]):
        s = int(k * 0.06 * SR); t = t_arr(0.4)
        tone = np.sin(2 * np.pi * f * t) * env(len(t), 0.001, 0.09) * 0.18
        out[s:s + len(t)] += tone[:len(out) - s]
    return out


def sfx_tick():
    t = t_arr(0.04)
    return bp(rng.standard_normal(len(t)), 2000, 7000) * env(len(t), 0.0003, 0.008) * 0.6


def sfx_riser(d=1.0):
    t = t_arr(d); n = bp(rng.standard_normal(len(t)), 1500, 9000)
    return n * (t / d) ** 2.2 * 0.35


SFX = {"whoosh": sfx_whoosh, "pop": sfx_pop, "stamp": sfx_stamp, "thud": sfx_thud, "ding": sfx_ding,
       "sparkle": sfx_sparkle, "tick": sfx_tick, "riser": sfx_riser}
GAIN = {"whoosh": 0.55, "pop": 0.5, "stamp": 0.75, "thud": 0.8, "ding": 0.6, "sparkle": 0.5, "tick": 0.35, "riser": 0.45}


# ---------- music: 120 BPM, Am - F - C - G, kick / clap / hats / sub bass / pluck, side-chained ----------
def music(dur, bpm=120):
    beat = 60 / bpm; n = int(dur * SR); out = np.zeros(n + SR); side = np.ones(n + SR)
    def put(x, at, g=1.0):
        s = int(at * SR)
        if s >= len(out): return
        e = min(len(out), s + len(x)); out[s:e] += x[:e - s] * g
    kick_t = t_arr(0.35)
    kick = np.sin(2 * np.pi * np.cumsum(160 * np.exp(-kick_t * 30) + 45) / SR) * env(len(kick_t), 0.001, 0.14)
    clap = bp(rng.standard_normal(int(0.2 * SR)), 900, 4000) * env(int(0.2 * SR), 0.001, 0.05)
    hat = bp(rng.standard_normal(int(0.06 * SR)), 6000, 12000) * env(int(0.06 * SR), 0.0005, 0.015)
    roots = [57, 53, 48, 55]  # A3 F3 C3 G3 (midi)
    chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
    hz = lambda m: 440 * 2 ** ((m - 69) / 12)
    beats = int(dur / beat) + 1
    for b in range(beats):
        at = b * beat; bar = (b // 4) % 4
        put(kick, at, 0.9)
        s = int(at * SR); dk = np.minimum(1, 0.35 + np.arange(int(0.22 * SR)) / (0.22 * SR) * 0.65)
        side[s:s + len(dk)] = np.minimum(side[s:s + len(dk)], dk[:len(side) - s])
        if b % 2 == 1: put(clap, at, 0.45)
        put(hat, at + beat / 2, 0.3); put(hat, at + beat * 0.75, 0.12)
        # sub bass on the off-beat
        tb = t_arr(beat * 0.45); f = hz(roots[bar] - 24)
        put(np.tanh(2 * np.sin(2 * np.pi * f * tb)) * env(len(tb), 0.004, 0.2), at + beat / 2, 0.42)
        # pluck chord stabs on the "and" of 2 and 4
        if b % 2 == 1:
            tp = t_arr(0.5); st = np.zeros(len(tp))
            for m in chords[bar]:
                ph = 2 * np.pi * hz(m + 12) * tp
                st += (2 * (ph / (2 * np.pi) % 1) - 1)  # saw
            put(lp(st, 2200) * env(len(tp), 0.002, 0.12) * 0.11, at + beat / 2)
    out = out[:n] * side[:n] * 0.95
    fade = int(1.2 * SR); out[-fade:] *= np.linspace(1, 0, fade)
    return out


def load_voice(path, dur):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    v = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    out = np.zeros(int(dur * SR)); out[:min(len(v), len(out))] = v[:len(out)]
    return out


def duck_curve(voice, floor=0.38):  # music dips under the voice
    from scipy.ndimage import maximum_filter1d, uniform_filter1d
    lvl = maximum_filter1d(np.abs(voice), int(0.12 * SR))
    on = (lvl > 0.02).astype(float)
    on = uniform_filter1d(on, int(0.25 * SR))
    return 1 - (1 - floor) * on


def write(path, x):
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.95
    raw = (x.astype(np.float32)).tobytes()
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ac", "1", "-ar", str(SR), "-i", "-",
                    "-af", "loudnorm=I=-14:TP=-1.5:LRA=9", "-ar", str(SR), "-ac", "2", path], input=raw, check=True)


def main():
    d, name = sys.argv[1], sys.argv[2]
    cues = json.load(open(f"{d}/{name}.cues.json"))
    dur = cues["duration"]
    voice = load_voice(f"{d}/{name}.mp3", dur)
    fx = np.zeros(int(dur * SR) + 2 * SR)
    for c in cues["sfx"]:
        x = SFX[c["type"]]() * GAIN[c["type"]] * c.get("gain", 1)
        s = int(max(0, c["t"] - (0.25 if c["type"] == "whoosh" else 0)) * SR)
        if c["type"] == "riser": s = int(max(0, c["t"] - 1.0) * SR)
        fx[s:s + len(x)] += x[:len(fx) - s]
    fx = fx[:len(voice)]
    m = music(dur) * duck_curve(voice) * 0.42
    write(f"{d}/{name}-mix.wav", voice * 1.0 + fx * 0.55 + m)
    write(f"{d}/{name}-nomusic.wav", voice * 1.0 + fx * 0.55)
    print(name, "ok", round(dur, 2), "s,", len(cues["sfx"]), "sfx")


if __name__ == "__main__":
    main()
