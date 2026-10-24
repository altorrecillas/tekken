"""The game's music (assets/music) from Kevin MacLeod's originals (incompetech.com, CC BY 4.0; see CREDITS.txt).
Each stage has a style of its own and several tracks, so a fight is not one loop played over and over: El Porche
urban funk and hip hop, the rooftop Latin disco and salsa, the 10K finish line rock, the festival club and dance;
plus an angrier track for the final round of every stage, the menus, training and the arcade ending.
Every track: a long quiet intro cut to its last 4 seconds (a track can start in the middle of a round, when the one
before ends), the faded ending cut short with a quick fade of its own (the next track comes in sooner), 32 Hz
high-pass, loudness normalized to -16 LUFS in two passes (true peak -1.5 dB), 128 kbps MP3.
It also measures each track's tempo and first beat and prints the BEATS table of js/audio/audio.js (the festival's
lights and dancers keep the music's time).
usage: python3 tools/music_build.py <folder with the original mp3s and incompetech's pieces.json>   (writes assets/music/*.mp3)
The originals: https://incompetech.com/music/royalty-free/mp3-royaltyfree/<title>.mp3"""
import json, os, re, subprocess, sys

import numpy as np

GAME = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(GAME, 'assets/music')

# file -> original title; the order inside a stage is the order the tracks follow each other in
TRACKS = {
    'menu': 'Latin Industries',
    'training': 'Funkorama',
    'ending': 'Super Power Cool Dude',
    'porche_a': 'MTA', 'porche_b': 'Rocket Power', 'porche_c': 'Wepa', 'porche_final': 'Urban Gauntlet',
    'terrace_a': 'Electro Cabello', 'terrace_b': 'Arroz Con Pollo', 'terrace_c': 'Disco con Tutti', 'terrace_final': 'El Magicia',
    'street_a': 'Hotrock', 'street_b': 'Exhilarate', 'street_c': 'Exit the Premises', 'street_final': 'Summon the Rawk',
    'festival_a': 'Pamgaea', 'festival_b': 'District Four', 'festival_c': 'Who Likes to Party', 'festival_d': 'Club Diver',
    'festival_final': 'Cut and Run',
}
KEEP_INTRO = {'menu', 'training', 'ending'}  # (these start from the top: nothing plays before them)


def levels(path, sr=22050):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32)
    w = sr // 2
    n = len(x) // w
    db = 20 * np.log10(np.sqrt((x[:n * w].reshape(n, w) ** 2).mean(1) + 1e-12) + 1e-9)
    return db, n * 0.5


def span(path, keep_intro):
    """where the track starts (the intro kept to its last 4 s) and ends (1 s after the music last plays loud)"""
    db, dur = levels(path)
    med = np.median(db)
    n = len(db)
    intro = next((i * 0.5 for i in range(n - 8) if (db[i:i + 8] > med - 4).all()), 0.0)
    last = max(i for i in range(n) if db[i] > med - 6) * 0.5
    start = 0.0 if keep_intro else max(0.0, intro - 4.0)
    end = min(dur, last + 1.5)
    return start, end


def onset_env(path, sr=11025, hop=128):
    """spectral flux: how much new sound starts at each moment"""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32)
    n = (len(x) - 1024) // hop
    win = np.hanning(1024)
    S = np.abs(np.fft.rfft(np.stack([x[i * hop:i * hop + 1024] * win for i in range(n)]), axis=1))
    flux = np.maximum(0, np.diff(np.log1p(S * 10), axis=0)).sum(1)
    flux -= np.convolve(flux, np.ones(16) / 16, 'same')
    return np.maximum(flux, 0), sr / hop


def beat(path, bpm0):
    """the track's tempo (the catalogue's, its half or its double, refined within 2 %) and its first beat (s): the
    comb of beats that lands on the most onsets. Below 85 bpm the dancing tempo is doubled (a half-time reading)"""
    env, fps = onset_env(path)
    best = None
    for mult in (0.5, 1, 2):
        for b in np.linspace(bpm0 * mult * 0.98, bpm0 * mult * 1.02, 81):
            if not 70 <= b <= 190:
                continue
            period = fps * 60 / b
            ph = np.arange(0, period, 0.5)
            idx = (np.arange(int(len(env) / period) - 1)[None, :] * period + ph[:, None]).astype(int)
            sc = env[idx].mean(1)
            k = sc.argmax()
            if best is None or sc[k] > best[0]:
                best = (sc[k], b, ph[k] / fps)
    _, b, off = best
    return [round(b if b >= 85 else b * 2, 2), round(off, 3)]


def build(src_dir):
    os.makedirs(OUT, exist_ok=True)
    # incompetech's catalogue (its tempos): https://incompetech.com/music/royalty-free/pieces.json, next to the originals
    cp = os.path.join(src_dir, 'pieces.json')
    cat = {p['title']: p for p in json.load(open(cp))} if os.path.exists(cp) else {}
    beats = {}
    for name, title in TRACKS.items():
        src = os.path.join(src_dir, title + '.mp3')
        start, end = span(src, name in KEEP_INTRO)
        fade_in = 0.05 if start == 0 else 0.6
        flt = f'atrim={start:.2f}:{end:.2f},asetpts=PTS-STARTPTS,highpass=f=32,afade=t=in:d={fade_in},afade=t=out:st={max(0, end - start - 2.5):.2f}:d=2.5'
        # loudness: measure, then normalize linearly with the measured values
        m = subprocess.run(['ffmpeg', '-v', 'info', '-i', src, '-af', flt + ',loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'],
                           capture_output=True, text=True, check=True).stderr
        j = json.loads(re.findall(r'\{[^{}]*"input_i"[^{}]*\}', m)[-1])
        ln = (f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}"
              f":measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
        out = os.path.join(OUT, name + '.mp3')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af', flt + ',' + ln, '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '128k',
                        '-map_metadata', '-1', out], check=True)
        print(f'{name:15s} {title:24s} {start:5.1f}-{end:6.1f} s  {os.path.getsize(out) // 1024:5d} KB  (was {float(j["input_i"]):.1f} LUFS)')
        beats[name] = beat(out, float(cat[title]['bpm'])) if title in cat else None
    # (js/audio/audio.js BEATS: paste this line there when the tracks change)
    print('const BEATS = { ' + ', '.join(f'{k}: [{v[0]:g}, {v[1]:g}]' for k, v in beats.items() if v) + ' };')


if __name__ == '__main__':
    build(sys.argv[1])
