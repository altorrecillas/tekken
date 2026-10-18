"""The fight's recorded sound effects (assets/sfx/fight.mp3 + fight.json): punches, kicks, body thuds, blocks, open-hand
slaps, footsteps and swishes, all CC0, in one file (one download, one decode) with a table of where each take starts.
Sources (download and unzip them anywhere, then pass the two folders):
  Kenney, "Impact Sounds" 1.0 (CC0): https://kenney.nl/assets/impact-sounds -> Audio/*.ogg
  artisticdude, "Swishes Sound Pack" (CC0): https://opengameart.org/content/swishes-sound-pack -> swishes/*.wav
Each take: mono 44.1 kHz, the silence before its onset cut, the tail faded out once it falls 50 dB under its peak, all
the takes of a group levelled to the same loudness (a punch never comes out much louder than the next), the loudest
peak of the file at -1 dBFS. The game picks a take at random (never the same one twice running), with a little pitch
and level variation, and layers them (js/audio/audio.js `hit`, `whoosh`, `play`).
usage: python3 tools/sfx_build.py <kenney Audio folder> <swishes folder>
needs ffmpeg (with libmp3lame) and numpy."""
import json, os, subprocess, sys

import numpy as np

GAME = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SR = 44100
LEAD, GAP = 0.08, 0.06          # silence before the first take and between takes (seconds)
# group: (source folder, file names); the swishes' four lighter takes are 10-13, the nine heavier ones 1-9
GROUPS = {
    'punchL': ('k', [f'impactPunch_medium_00{i}.ogg' for i in range(5)]),
    'punchH': ('k', [f'impactPunch_heavy_00{i}.ogg' for i in range(5)]),
    'thudM': ('k', [f'impactSoft_medium_00{i}.ogg' for i in range(5)]),
    'thudH': ('k', [f'impactSoft_heavy_00{i}.ogg' for i in range(5)]),
    'slap': ('k', [f'impactGeneric_light_00{i}.ogg' for i in range(5)]),
    'block': ('k', [f'impactWood_light_00{i}.ogg' for i in range(5)]),
    'stepC': ('k', [f'footstep_concrete_00{i}.ogg' for i in range(5)]),
    'stepW': ('k', [f'footstep_wood_00{i}.ogg' for i in range(5)]),
    'swishL': ('s', [f'swish-{i}.wav' for i in (10, 11, 12, 13)]),
    'swishH': ('s', [f'swish-{i}.wav' for i in range(1, 10)]),
}


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def trim(x):
    """the take from just before its onset to where it has died away, with short fades at both cuts"""
    a = np.abs(x)
    pk = a.max()
    on = max(0, int(np.argmax(a > pk * 0.05)) - int(0.0015 * SR))
    end = len(a) - int(np.argmax(a[::-1] > pk * 10 ** (-50 / 20)))
    y = x[on:end].copy()
    fi, fo = int(0.001 * SR), min(int(0.015 * SR), len(y) // 3)
    y[:fi] *= np.linspace(0, 1, fi)
    y[-fo:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, fo))
    return y - y.mean()


def loudness(y):
    """RMS of the loud part (the first 120 ms after the onset): what the ear compares between two hits"""
    seg = y[:int(0.12 * SR)]
    return np.sqrt((seg ** 2).mean())


def main(kdir, sdir):
    takes = {}
    for g, (src, names) in GROUPS.items():
        ys = [trim(decode(os.path.join(kdir if src == 'k' else sdir, n))) for n in names]
        ref = np.median([loudness(y) for y in ys])
        takes[g] = [y * (ref / max(loudness(y), 1e-9)) for y in ys]
    peak = max(np.abs(y).max() for ys in takes.values() for y in ys)
    k = 10 ** (-1 / 20) / peak
    out, table, t = [np.zeros(int(LEAD * SR))], {}, LEAD
    # (where the first take passes a fifth of its peak: the game finds the same point in the decoded file and shifts the
    # table by the difference, whatever silence the decoder adds or trims at the start of an MP3)
    first = next(iter(takes.values()))[0]
    sync = LEAD + int(np.argmax(np.abs(first) > 0.2 * np.abs(first).max())) / SR
    for g, ys in takes.items():
        table[g] = []
        for y in ys:
            y = y * k
            table[g].append([round(t, 5), round(len(y) / SR, 5)])
            out += [y, np.zeros(int(GAP * SR))]
            t += len(y) / SR + int(GAP * SR) / SR
    pcm = np.concatenate(out).astype(np.float32)
    mp3 = os.path.join(GAME, 'assets/sfx/fight.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-codec:a', 'libmp3lame', '-b:a', '128k', mp3],
                   input=pcm.tobytes(), check=True)
    with open(os.path.join(GAME, 'assets/sfx/fight.json'), 'w') as f:
        f.write('{"sync": %.5f, "groups": {\n' % sync + ',\n'.join(f' "{g}": {json.dumps(v)}' for g, v in table.items()) + '\n}}\n')
    print(f'{mp3}: {len(pcm) / SR:.2f} s, {os.path.getsize(mp3) // 1024} KB, ' + ', '.join(f'{g} x{len(v)}' for g, v in table.items()))


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
