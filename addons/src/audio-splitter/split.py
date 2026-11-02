#!/usr/bin/env python3
"""Squeezy Audio Splitter engine.

Splits a video or audio file into three stems: vocals, music and sfx.
  best : BS-RoFormer pulls the vocals (speech and singing) out first, then
         TIGER-DnR splits what is left into music and sound effects.
  fast : TIGER-DnR only (dialog / music / effects in one pass).

Writes progress.json while it works, done.json when finished, error.txt if it fails.
Usage: split.py --in <media file> --out <folder> [--quality best|fast]
       split.py --warmup        (downloads the models once)
"""
import argparse, json, os, sys, time, traceback, subprocess, shutil
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")   # Apple GPU: run unsupported ops on the CPU

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, "models")
SR = 44100
ROFORMER = "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
OUT = None


LAST = {}


def heartbeat():
    """Re-stamp progress.json every 15 s, so the panel can tell 'slow' from 'stopped'."""
    import threading
    def run():
        while True:
            time.sleep(15)
            if LAST and LAST.get("pct", 0) < 100:
                progress(LAST["stage"], LAST["pct"], LAST["msg"], beat=True)
    threading.Thread(target=run, daemon=True).start()


def progress(stage, pct, msg="", beat=False):
    if not beat: LAST.update(stage=stage, pct=pct, msg=msg)
    if not OUT: print(stage, pct, msg, flush=True); return
    tmp = os.path.join(OUT, "progress.tmp")
    with open(tmp, "w") as f:
        json.dump({"stage": stage, "pct": round(pct, 1), "msg": msg, "time": time.time(), "pid": os.getpid()}, f)
    os.replace(tmp, os.path.join(OUT, "progress.json"))
    if not beat: print(stage, pct, msg, flush=True)


def ensure_ffmpeg():
    """The vocal model calls `ffmpeg` / `ffprobe` by name: make sure both are on PATH."""
    if shutil.which("ffmpeg") and shutil.which("ffprobe"): return
    try:
        import static_ffmpeg   # downloads ffmpeg + ffprobe once, then just adds them to PATH
        static_ffmpeg.add_paths()
        if shutil.which("ffmpeg"): return
    except Exception:
        pass
    try:   # fall back to the ffmpeg that ships with imageio-ffmpeg
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
        bindir = os.path.join(HERE, "bin"); os.makedirs(bindir, exist_ok=True)
        link = os.path.join(bindir, "ffmpeg.exe" if os.name == "nt" else "ffmpeg")
        if not os.path.exists(link):
            try: os.symlink(exe, link)
            except Exception: shutil.copy2(exe, link)
        os.environ["PATH"] = bindir + os.pathsep + os.environ.get("PATH", "")
    except Exception:
        pass


def ffmpeg_bin():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return shutil.which("ffmpeg") or "ffmpeg"


def decode(src, dst):
    """Any media -> 44.1 kHz stereo float WAV."""
    cmd = [ffmpeg_bin(), "-y", "-v", "error", "-i", src, "-vn", "-ac", "2", "-ar", str(SR), "-c:a", "pcm_f32le", dst]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(dst):
        raise RuntimeError("Could not read the audio of this file (ffmpeg): " + (r.stderr or "")[-400:])


def read_wav(path):
    import soundfile as sf
    import numpy as np
    x, sr = sf.read(path, dtype="float32", always_2d=True)
    if sr != SR:
        import librosa
        x = np.stack([librosa.resample(x[:, c], orig_sr=sr, target_sr=SR) for c in range(x.shape[1])], 1)
    if x.shape[1] == 1:
        x = np.repeat(x, 2, 1)
    return x[:, :2]


def write_wav(path, x):
    import soundfile as sf
    sf.write(path, x, SR, subtype="PCM_24")


def device():
    import torch
    if torch.cuda.is_available(): return torch.device("cuda")
    try:
        if torch.backends.mps.is_available(): return torch.device("mps")
    except Exception:
        pass
    return torch.device("cpu")


# ---------------- TIGER-DnR: dialog / effects / music ----------------
def hub_file(repo, name):
    """Download one file from Hugging Face (3 tries), cached in the models folder."""
    from huggingface_hub import hf_hub_download
    last = None
    for attempt in range(3):
        try:
            return hf_hub_download(repo, name, cache_dir=MODELS)
        except Exception as e:
            last = e; time.sleep(2 + attempt * 3)
    raise RuntimeError("Could not download %s/%s: %s" % (repo, name, last))


def load_tiger(random_weights=False):
    sys.path.insert(0, os.path.join(HERE, "TIGER"))
    import inspect, look2hear.models
    TD = look2hear.models.TIGERDNR
    if random_weights:   # test hook: same network, untrained
        return TD()
    # load the weights directly (independent of the huggingface_hub mixin version)
    cfg = {}
    try:
        with open(hub_file("JusperLee/TIGER-DnR", "config.json")) as f: cfg = json.load(f)
    except Exception:
        cfg = {}
    names = inspect.signature(TD.__init__).parameters
    model = TD(**{k: v for k, v in cfg.items() if k in names})
    wpath = hub_file("JusperLee/TIGER-DnR", "model.safetensors")
    from safetensors.torch import load_file
    sd = load_file(wpath)
    res = model.load_state_dict(sd, strict=False)
    missing = list(getattr(res, "missing_keys", []))
    if len(missing) > max(5, 0.05 * len(sd)):
        raise RuntimeError("TIGER-DnR weights do not match the network (%d missing keys, e.g. %s)" % (len(missing), missing[:3]))
    return model


def run_tiger(model, x, base_pct, span, label, stereo=False, hop=None):
    """x: [T, 2] float32 -> dict dialog/effect/music, each [T, 2].
    TIGER is mono: by default the mid channel goes through once (twice as fast), stereo=True does L and R.
    Runs on the CPU (the Apple GPU path falls back op by op and can stall), in 12 s windows
    that overlap by 1 s and are cross-faded. Progress is reported after every window."""
    import numpy as np, torch
    try: torch.set_num_threads(max(1, os.cpu_count() or 1))
    except Exception: pass
    dev = torch.device("cpu")
    model.to(dev).eval()
    chans = [x[:, 0], x[:, 1]] if stereo else [x.mean(1)]
    nets = (("dialog", model.dialog, 2), ("effect", model.effect, 1), ("music", model.music, 0))
    T = x.shape[0]; win = 12 * SR; ov = SR; step = win - ov
    nwin = max(1, int(np.ceil(max(T - ov, 1) / step)))
    total = len(chans) * len(nets) * nwin; done = 0; t0 = time.time()
    fade = np.linspace(0, 1, ov, dtype=np.float32)
    outs = {"dialog": [], "effect": [], "music": []}
    for c, ch in enumerate(chans):
        for key, net, idx in nets:
            acc = np.zeros(T, np.float32); wsum = np.zeros(T, np.float32)
            for i in range(nwin):
                s0 = i * step; seg = ch[s0:s0 + win]; L = len(seg)
                if L <= 0: break
                buf = np.zeros(win, np.float32); buf[:L] = seg
                with torch.no_grad():
                    y = net(torch.from_numpy(buf)[None, None, :])
                y = y.reshape(y.shape[0], -1, y.shape[-1])[0, idx].float().numpy()[:L]
                w = np.ones(L, np.float32)
                if i > 0: w[:min(ov, L)] = fade[:min(ov, L)]
                if s0 + win < T: w[-ov:] = np.minimum(w[-ov:], fade[::-1][-min(ov, L):])
                acc[s0:s0 + L] += y * w; wsum[s0:s0 + L] += w
                done += 1
                el = time.time() - t0; left = el / done * (total - done)
                progress(label, base_pct + span * done / total,
                         "%s%s, part %d/%d, about %d min left" % (key, (" L", " R")[c] if stereo else "", i + 1, nwin, max(1, round(left / 60))))
            outs[key].append(acc / np.maximum(wsum, 1e-6))
    if not stereo:
        return {k2: np.stack([v[0], v[0]], 1).astype("float32") for k2, v in outs.items()}
    return {k2: np.stack(v, 1).astype("float32") for k2, v in outs.items()}


# ---------------- BS-RoFormer: vocals / instrumental ----------------
def run_roformer(wav, work):
    ensure_ffmpeg()
    from audio_separator.separator import Separator
    sep = Separator(model_file_dir=MODELS, output_dir=work, output_format="WAV")
    sep.load_model(model_filename=ROFORMER)
    files = sep.separate(wav)
    files = [f if os.path.isabs(f) else os.path.join(work, f) for f in files]
    voc = [f for f in files if "(vocals)" in os.path.basename(f).lower()]
    ins = [f for f in files if "(instrumental)" in os.path.basename(f).lower()]
    if not voc or not ins:
        raise RuntimeError("Vocal model returned unexpected files: " + ", ".join(os.path.basename(f) for f in files))
    return read_wav(voc[0]), read_wav(ins[0])


def split(src, out, quality, test_random=False, stereo=False):
    import numpy as np
    os.makedirs(out, exist_ok=True)
    work = os.path.join(out, "_work"); os.makedirs(work, exist_ok=True)
    progress("Reading audio", 2)
    mix_wav = os.path.join(work, "mix.wav")
    decode(src, mix_wav)
    mix = read_wav(mix_wav)
    n = mix.shape[0]
    progress("Loading models", 6)
    tiger = load_tiger(test_random)
    if quality == "best" and not test_random:
        progress("Separating vocals", 10, "BS-RoFormer")
        vocals, inst = run_roformer(mix_wav, work)
        L = min(n, vocals.shape[0], inst.shape[0])
        vocals, inst = vocals[:L], inst[:L]
        st = run_tiger(tiger, inst, 45, 50, "Splitting music / SFX", stereo)
        music, sfx = st["music"][:L], st["effect"][:L]
        # speech the vocal model left behind lands back with the vocals
        vocals = vocals + st["dialog"][:L] * 0.5
    else:
        st = run_tiger(tiger, mix, 10, 85, "Splitting vocals / music / SFX", stereo)
        vocals, music, sfx = st["dialog"], st["music"], st["effect"]
    progress("Writing stems", 96)
    name = os.path.splitext(os.path.basename(src))[0]
    stems = {}
    for key, data in (("vocals", vocals), ("music", music), ("sfx", sfx)):
        peak = float(np.max(np.abs(data))) if data.size else 0
        if peak > 0.999: data = data / peak * 0.999
        p = os.path.abspath(os.path.join(out, "%s - %s.wav" % (name, key.capitalize() if key != "sfx" else "SFX")))
        write_wav(p, data.astype("float32"))
        stems[key] = p
    shutil.rmtree(work, ignore_errors=True)
    with open(os.path.join(out, "done.json"), "w") as f:
        json.dump({"stems": stems, "source": src, "quality": quality, "seconds": n / SR}, f, indent=1)
    progress("Done", 100)


def warmup():
    """Download both models once. Every step is logged to warmup-log.txt."""
    log = open(os.path.join(HERE, "warmup-log.txt"), "w")
    def say(m): print(m, flush=True); log.write(m + "\n"); log.flush()
    ok = True
    try:
        say("1/2  TIGER-DnR (music / SFX / dialog)...")
        load_tiger(); say("     ok")
    except Exception:
        ok = False; say("     FAILED\n" + traceback.format_exc())
    try:
        say("2/2  BS-RoFormer (vocals)...")
        ensure_ffmpeg()
        from audio_separator.separator import Separator
        sep = Separator(model_file_dir=MODELS, output_dir=MODELS)
        sep.load_model(model_filename=ROFORMER); say("     ok")
    except Exception:
        ok = False; say("     FAILED\n" + traceback.format_exc())
    log.close()
    return ok


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src")
    ap.add_argument("--out")
    ap.add_argument("--quality", default="best", choices=["best", "fast"])
    ap.add_argument("--warmup", action="store_true")
    ap.add_argument("--test-random", action="store_true")
    ap.add_argument("--stereo", action="store_true")
    a = ap.parse_args()
    if a.warmup:
        sys.exit(0 if warmup() else 1)
    OUT = a.out
    try:
        os.makedirs(OUT, exist_ok=True)
        for f in ("done.json", "error.txt"):
            try: os.remove(os.path.join(OUT, f))
            except OSError: pass
        heartbeat()
        split(os.path.abspath(a.src), os.path.abspath(a.out), a.quality, a.test_random, a.stereo)
    except Exception as e:
        with open(os.path.join(OUT, "error.txt"), "w") as f:
            f.write(str(e) + "\n\n" + traceback.format_exc())
        progress("Failed", 100, str(e)[:200])
        sys.exit(1)
