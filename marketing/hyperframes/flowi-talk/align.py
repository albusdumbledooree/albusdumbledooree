"""Word timings for the talking-head edit.

python3 align.py <work dir>
Reads chunks.json (pause-bounded chunks of the source audio, each with its exact text), keep.json (kept
source ranges after pause removal) and seg/NN.mov (the cut segments). Spreads each chunk's words across the
chunk by length, maps source time to the tightened cut and writes words.json.
"""
import json, re, subprocess, sys

D = sys.argv[1]
chunks = json.load(open(f'{D}/chunks.json'))
keep = json.load(open(f'{D}/keep.json'))
frames = [int(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
          'stream=nb_frames', '-of', 'csv=p=0', f'{D}/seg/{i:02d}.mov']).decode().strip()) for i in range(len(keep))]
offs, acc = [], 0
for f in frames:
    offs.append(acc / 30); acc += f
DUR = acc / 30


def to_out(t):
    for (a, b), o, f in zip(keep, offs, frames):
        if t < a: return o
        if t <= b: return min(o + (t - a), o + f / 30)
    return DUR


FIX = {'Flowee': 'FLOWI', 'shot': 'schyot', 'bez': 'bu', 'IP,': 'iPhone,', 'IP': 'iPhone,'}
words = []
for c in chunks:
    ws = c['text'].split()
    if not ws: continue
    wt = []
    for w in ws:
        n = max(2, len(re.sub(r"[^a-zA-Z0-9]", '', w)))
        if w[-1] in ',;:': n += 2
        if w[-1] in '.?!': n += 3
        wt.append(n)
    tot, a = sum(wt), 0
    for w, n in zip(ws, wt):
        s = c['s'] + (c['e'] - c['s']) * a / tot
        e = c['s'] + (c['e'] - c['s']) * (a + n * 0.92) / tot
        a += n
        words.append({'w': FIX.get(w, w), 's': round(to_out(s), 3), 'e': round(to_out(e), 3)})
for i, w in enumerate(words):
    w['i'] = i
    if i and w['s'] < words[i - 1]['s'] + 0.05: w['s'] = round(words[i - 1]['s'] + 0.05, 3)
    if w['e'] < w['s'] + 0.08: w['e'] = round(w['s'] + 0.08, 3)
json.dump({'words': words, 'dur': DUR, 'cuts': [round(o, 3) for o in offs[1:]]}, open(f'{D}/words.json', 'w'), ensure_ascii=False)
print(len(words), 'words, duration', DUR)
