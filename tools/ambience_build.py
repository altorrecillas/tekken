"""The stages' background sound (assets/sfx/amb_<stage>.mp3), from CC0 field recordings: a seamless loop, mono, the
low rumble and the hiss filtered off, the loud moments evened out (a car passing close becomes a car passing down the
street) and levelled, so that it sits under the music and the fight. The game plays it in a loop for its stage
(js/audio/audio.js `ambience`).
  porche   El Porche: a city street (IgnasD, "High traffic road sounds", CC0)
           https://opengameart.org/content/high-traffic-road-sounds -> gatve Varniu_2.ogg
  terrace  the rooftop at sunset: an evening outdoors (Kresiek The Furry, "AMB Outside 1", CC0)
           https://opengameart.org/content/amb-outside-1 -> amb_outdoor1_loop.ogg
usage: python3 tools/ambience_build.py <stage> <recording>      needs ffmpeg and numpy"""
import os, subprocess, sys

import numpy as np

GAME = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SR = 44100
# stage: (seconds kept, crossfade seconds, filters before levelling, mean level dBFS)
STAGES = {
    'porche': (48.0, 4.0, 'highpass=f=70,lowpass=f=3200,acompressor=threshold=-30dB:ratio=3:attack=200:release=1500:makeup=1', -26.0),
    'terrace': (29.0, 3.0, 'highpass=f=90,lowpass=f=9000', -26.0),
}


def main(stage, src):
    keep, xf, chain, level = STAGES[stage]
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', src, '-af', chain, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).astype(np.float64)
    # (the recording's first half second is often a fade-in or a click)
    x = x[int(0.5 * SR):int((0.5 + keep + xf) * SR)]
    # seamless loop: the last `xf` seconds are crossfaded into the first ones (equal power), then cut off
    n = int(xf * SR)
    t = np.linspace(0, np.pi / 2, n)
    body = x[:-n].copy()
    body[:n] = x[:n] * np.sin(t) + x[-n:] * np.cos(t)
    body *= 10 ** ((level - 20 * np.log10(np.sqrt((body ** 2).mean()) + 1e-12)) / 20)
    pk = np.abs(body).max()
    if pk > 10 ** (-1 / 20):
        body *= 10 ** (-1 / 20) / pk
    out = os.path.join(GAME, f'assets/sfx/amb_{stage}.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-codec:a', 'libmp3lame', '-b:a', '64k', out],
                   input=body.astype(np.float32).tobytes(), check=True)
    print(f'{out}: {len(body) / SR:.1f} s, {os.path.getsize(out) // 1024} KB')


if __name__ == '__main__':
    if len(sys.argv) < 3 or sys.argv[1] not in STAGES:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
