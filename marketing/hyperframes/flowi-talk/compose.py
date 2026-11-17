"""Final composite: footage + graphics behind the speaker + speaker cutout + graphics in front.

python3 compose.py <work dir> <out.mp4> [start_s end_s]
Needs in the work dir: base.mov (tightened cut), matte.mp4 (person alpha as a grey video, any size), pngB/ and pngF/ (RGBA
frame sequences rendered from back.html / front.html), zoom.json (punch-ins), mix.wav (final audio).
"""
import glob, json, subprocess, sys, os
import cv2, numpy as np

D, OUT = sys.argv[1], sys.argv[2]
Z = json.load(open(f'{D}/zoom.json'))
END, FPS, W, H = Z['end'], 30, 1080, 1920
N = int(round(END * FPS))
a0 = int(float(sys.argv[3]) * FPS) if len(sys.argv) > 3 else 0
a1 = int(float(sys.argv[4]) * FPS) if len(sys.argv) > 4 else N
zoom = Z['zoom']
COLL = Z.get('collage', [])   # windows where the speaker is shown as a grey cut-out over the collage
CX, CY = 540, 640


def zoom_at(t):
    cur, prev = 1.0, 1.0
    for i, (tt, z, ease) in enumerate(zoom):
        if tt > t: break
        prev = zoom[i - 1][1] if i else z
        cur = z
        if ease and t < tt + ease:
            p = (t - tt) / ease
            cur = prev + (z - prev) * (1 - (1 - p) ** 3)
    return cur


def seq(d):
    fs = sorted(glob.glob(f'{D}/{d}/*.png'))
    return fs


PB, PF = seq('pngB'), seq('pngF')
cap = cv2.VideoCapture(f'{D}/base.mov')
NB = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
mw, mh = 540, 960
MATTE = os.environ.get('MATTE', f'{D}/matte.mp4')   # grey video of the person alpha; MOFF = base frame its first frame belongs to
MOFF = int(os.environ.get('MOFF', '0'))
mp = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-i', MATTE, '-vf', f'scale={mw}:{mh},format=gray', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
audio = ['-i', f'{D}/mix.wav'] if os.path.exists(f'{D}/mix.wav') and a0 == 0 and a1 == N else []
enc = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-'] + audio +
                       ['-c:v', 'libx264', '-crf', '19', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-g', '60'] + (['-c:a', 'aac', '-b:a', '192k', '-shortest'] if audio else []) + ['-movflags', '+faststart', OUT], stdin=subprocess.PIPE)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
vig = 1 - 0.22 * np.clip((((xx - W / 2) / (W * .75)) ** 2 + ((yy - H / 2) / (H * .75)) ** 2), 0, 1)
vig = vig[..., None].astype(np.float32)
last, lastm = None, None
kern = np.ones((3, 3), np.uint8)
for i in range(a1):
    ok, fr = cap.read() if i < NB else (False, None)
    if ok: last = fr
    raw = mp.stdout.read(mw * mh) if MOFF <= i < NB else b''
    if len(raw) == mw * mh: lastm = np.frombuffer(raw, np.uint8).reshape(mh, mw)
    if i < a0: continue
    t = i / FPS
    z = zoom_at(t)
    img = last
    M = None
    if abs(z - 1) > 1e-3:
        M = np.float32([[z, 0, CX * (1 - z)], [0, z, CY * (1 - z)]])
        img = cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    img = img.astype(np.float32) * vig
    fb = PB[i] if i < len(PB) else None
    if fb and lastm is not None:
        b = cv2.imread(fb, cv2.IMREAD_UNCHANGED)
        if b is not None and b.shape[2] == 3: b = np.dstack([b, np.full(b.shape[:2], 255, np.uint8)])
        if b is not None and b[..., 3].any():
            m = cv2.erode(lastm, kern)
            m = cv2.resize(m, (W, H), interpolation=cv2.INTER_LINEAR)
            m = cv2.GaussianBlur(m, (0, 0), 1.6)
            if M is not None: m = cv2.warpAffine(m, M, (W, H), flags=cv2.INTER_LINEAR)
            m = (m.astype(np.float32) / 255)[..., None]
            if any(c0 <= t < c1 for c0, c1 in COLL):
                g = img @ np.float32([0.114, 0.587, 0.299])
                g = np.clip((g - 110) * 1.18 + 118, 0, 255)[..., None]
                img = img * 0.18 + g * np.float32([0.80, 0.82, 0.84])
            a = (b[..., 3:4].astype(np.float32) / 255) * (1 - m)
            img = img * (1 - a) + b[..., :3].astype(np.float32) * a
    ff = PF[i] if i < len(PF) else None
    if ff:
        f = cv2.imread(ff, cv2.IMREAD_UNCHANGED)
        if f is not None and f.shape[2] == 3:
            img = f.astype(np.float32)
        elif f is not None and f[..., 3].any():
            a = f[..., 3:4].astype(np.float32) / 255
            img = img * (1 - a) + f[..., :3].astype(np.float32) * a
    enc.stdin.write(np.clip(img, 0, 255).astype(np.uint8).tobytes())
    if i % 300 == 0: print('frame', i, flush=True)
enc.stdin.close(); enc.wait(); mp.kill()
print('done', OUT)
