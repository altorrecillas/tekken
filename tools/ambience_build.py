"""The stages' background sound (assets/sfx/amb_<stage>.mp3), from CC0 field recordings: a seamless loop, mono, the
low rumble and the hiss filtered off, the loud moments evened out (a car passing close becomes a car passing down the
street) and levelled, so that it sits under the music and the fight. The game plays it in a loop for its stage
(js/audio/audio.js `ambience`).
  porche   El Porche: a city street (IgnasD, "High traffic road sounds", CC0)
           https://opengameart.org/content/high-traffic-road-sounds -> gatve Varniu_2.ogg
  terrace  the rooftop at sunset: an evening outdoors (Kresiek The Furry, "AMB Outside 1", CC0)
           https://opengameart.org/content/amb-outside-1 -> amb_outdoor1_loop.ogg
  neon     the neon district (cyberpunk): rain at night, made here (no recording): `python3 tools/ambience_build.py neon`
  pc       inside the PC: fans, coil whine, the hum of the power, data chirping, made here: `python3 tools/ambience_build.py pc`
usage: python3 tools/ambience_build.py <stage> <recording>      needs ffmpeg and numpy (neon: scipy)"""
import os, subprocess, sys

import numpy as np

GAME = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SR = 44100
# stage: (seconds kept, crossfade seconds, filters before levelling, mean level dBFS)
STAGES = {
    'porche': (48.0, 4.0, 'highpass=f=70,lowpass=f=3200,acompressor=threshold=-30dB:ratio=3:attack=200:release=1500:makeup=1', -26.0),
    'terrace': (29.0, 3.0, 'highpass=f=90,lowpass=f=9000', -26.0),
    'neon': (40.0, 4.0, None, -27.0),
    'pc': (36.0, 4.0, None, -28.0),
    'gym': (42.0, 4.0, None, -27.0),
}


def synth_neon(secs):
    """rain on a street at night: the hiss of the rain on the asphalt (its loudness breathing slowly), thousands of
    drops ticking on metal and in puddles, a few drips from the gutters with the bubble's rising pitch, cars on the wet
    road far off, the city's low rumble and the buzz of a neon tube"""
    from scipy.signal import butter, sosfilt
    rng = np.random.default_rng(2099)
    n = int(secs * SR)
    t = np.arange(n) / SR
    bp = lambda x, lo, hi, o=2: sosfilt(butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)
    lp = lambda x, f, o=2: sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
    def slow(rate, depth):  # (a smooth random swell, a few per minute)
        k = rng.standard_normal(int(secs * rate) + 4)
        return 1 + depth * np.interp(t * rate, np.arange(len(k)), k)
    bed = bp(rng.standard_normal(n), 400, 6500) * 0.5 * slow(0.15, 0.12)
    bed += bp(rng.standard_normal(n), 1800, 9000) * 0.18 * slow(0.2, 0.15)
    # drops: short decaying ticks, most faint, a few close and bright
    drops = np.zeros(n)
    m = int(secs * 900)
    pos = rng.integers(0, n - 2000, m)
    amp = np.exp(rng.normal(-3.0, 0.9, m))
    freq = rng.uniform(1400, 5200, m)
    tau = rng.uniform(0.0015, 0.006, m)
    L = 600
    tt = np.arange(L) / SR
    for p0, a, f, ta in zip(pos, amp, freq, tau):
        drops[p0:p0 + L] += a * np.sin(2 * np.pi * f * tt) * np.exp(-tt / ta)
    # drips from gutters: a bubble's plink (the pitch rising as it closes), each gutter its own rhythm
    for period, f0, a in [(0.71, 900, 0.07), (1.13, 1250, 0.05), (0.43, 700, 0.035)]:
        tp = rng.uniform(0, period)
        while tp < secs - 0.1:
            p0 = int(tp * SR); L2 = int(0.05 * SR); tt2 = np.arange(L2) / SR
            fr = f0 * (1 + 0.9 * tt2 / 0.05) * rng.uniform(0.92, 1.08)
            drops[p0:p0 + L2] += a * rng.uniform(0.6, 1.1) * np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-tt2 / 0.012)
            tp += period * rng.uniform(0.8, 1.25)
    # cars passing on the wet road, far off: a swish of tyre spray that swells and fades
    cars = np.zeros(n)
    for c0 in np.arange(rng.uniform(1, 4), secs - 5, 7.5):
        c0 += rng.uniform(-2, 2); d = rng.uniform(3.5, 6)
        env = np.exp(-((t - c0 - d / 2) / (d / 4)) ** 2)
        cars += env * rng.uniform(0.5, 1)
    cars = bp(rng.standard_normal(n), 300, 3000) * cars * 0.35
    rumble = lp(rng.standard_normal(n), 140, 4) * 1.4 * slow(0.1, 0.3)
    # the neon's buzz: 100 Hz and its harmonics, faint, with a crackle now and then
    buzz = sum(np.sin(2 * np.pi * 100 * h * t + h) / h ** 1.3 for h in (1, 2, 3, 5, 7)) * 0.012
    crack = (rng.random(n) < 0.00004).astype(float)
    crack = bp(np.convolve(crack, np.ones(400), 'same') * rng.standard_normal(n), 2000, 8000) * 0.05
    return bed + drops + cars + rumble + buzz + crack


def synth_pc(secs):
    """inside a running computer: the fans' wash of air with their blade tone (slowly speeding up and down), the
    power supply's hum, a coil's faint whine, the clicks and chirps of data, a soft rising sweep now and then"""
    from scipy.signal import butter, sosfilt
    rng = np.random.default_rng(2048)
    n = int(secs * SR)
    t = np.arange(n) / SR
    bp = lambda x, lo, hi, o=2: sosfilt(butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)
    lp = lambda x, f, o=2: sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
    # a seamless speed curve: whole sine periods over the loop's body are not needed (the loop is crossfaded)
    speed = 1 + 0.06 * np.sin(2 * np.pi * t / 17) + 0.03 * np.sin(2 * np.pi * t / 6.3)
    air = bp(rng.standard_normal(n), 120, 2400) * 0.55 * speed
    air += lp(rng.standard_normal(n), 160, 4) * 1.1
    ph = 2 * np.pi * np.cumsum(92 * speed) / SR      # (seven blades at about 790 rpm)
    blade = (np.sin(ph) * 0.05 + np.sin(2 * ph + 0.5) * 0.025) * (1 + 0.2 * np.sin(2 * np.pi * t * 0.31))
    hum = sum(np.sin(2 * np.pi * 50 * h * t + h) / h ** 1.5 for h in (1, 2, 3, 4, 6)) * 0.03
    whine = np.sin(2 * np.pi * 9400 * t + 2 * np.sin(2 * np.pi * 0.7 * t)) * 0.0035 * (1 + np.sin(2 * np.pi * t / 4.1))
    # data: little clicks in bursts, and soft chirps (short blips of a few pitches)
    data = np.zeros(n)
    tb = 0.3
    while tb < secs - 0.5:
        for _ in range(int(rng.integers(3, 14))):
            p0 = int((tb + rng.uniform(0, 0.35)) * SR); L = 220
            if p0 + L < n:
                data[p0:p0 + L] += rng.uniform(0.02, 0.06) * rng.standard_normal(L) * np.exp(-np.arange(L) / 30)
        if rng.random() < 0.45:
            p0 = int((tb + rng.uniform(0, 0.4)) * SR); L = int(0.06 * SR); tt = np.arange(L) / SR
            if p0 + L < n:
                f = rng.choice([1320, 1760, 2210, 2640]) * (1 + 0.3 * tt / 0.06 * rng.choice([-1, 1]))
                data[p0:p0 + L] += 0.03 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / 0.06)
        tb += rng.uniform(0.5, 1.6)
    data = bp(data, 600, 9000)
    # a soft sweep rising now and then (the core spinning up)
    sweep = np.zeros(n)
    for s0 in np.arange(rng.uniform(3, 6), secs - 4, 11):
        L = int(2.6 * SR); tt = np.arange(L) / SR; p0 = int(s0 * SR)
        f = 180 * 2 ** (tt * 1.4)
        sweep[p0:p0 + L] += 0.03 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / 2.6) ** 2
    return air + blade + hum + whine + data + sweep


def synth_gym(secs):
    """a gym hall: the air conditioning's wash, the treadmills' motor whine and the runners' footfalls on the belts,
    plates and dumbbells set down (metal clanks with their ring, rubber thuds), a barbell rattling back on the hooks,
    and the bass of the gym's speakers through the wall"""
    from scipy.signal import butter, sosfilt
    rng = np.random.default_rng(6264)
    n = int(secs * SR)
    t = np.arange(n) / SR
    bp = lambda x, lo, hi, o=2: sosfilt(butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)
    lp = lambda x, f, o=2: sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
    air = bp(rng.standard_normal(n), 150, 3000) * 0.32 + lp(rng.standard_normal(n), 120, 4) * 0.6
    # two treadmills: a motor whine each, and the footfalls (about 2.7 and 2.9 a second), soft thumps on the belt
    tread = np.zeros(n)
    for f0, step, gain in ((410, 1 / 2.7, 0.012), (455, 1 / 2.9, 0.01)):
        tread += gain * np.sin(2 * np.pi * f0 * t + 0.3 * np.sin(2 * np.pi * 0.4 * t))
        for tb in np.arange(rng.uniform(0, step), secs, step):
            p0 = int(tb * SR); L = int(0.07 * SR)
            if p0 + L < n:
                tt = np.arange(L) / SR
                tread[p0:p0 + L] += 0.09 * np.sin(2 * np.pi * 85 * tt) * np.exp(-tt / 0.018) * rng.uniform(0.7, 1.0)
    # metal set down: a clank with a few inharmonic partials ringing out; a rubber thud under it
    clank = np.zeros(n)
    tb = rng.uniform(0.8, 2.5)
    while tb < secs - 1.5:
        p0 = int(tb * SR); L = int(1.2 * SR); tt = np.arange(L) / SR
        base = rng.uniform(380, 900)
        ring = sum(a * np.sin(2 * np.pi * base * k * tt + rng.uniform(0, 6)) * np.exp(-tt / d) for k, a, d in ((1, 1, 0.35), (2.76, 0.55, 0.22), (5.4, 0.3, 0.12), (8.9, 0.15, 0.07)))
        thud = np.sin(2 * np.pi * 70 * tt) * np.exp(-tt / 0.05) * 0.8
        g = rng.uniform(0.05, 0.12) * (0.4 if rng.random() < 0.4 else 1)
        clank[p0:p0 + L] += g * (ring * (1 if rng.random() < 0.7 else 0.3) + thud)
        # (a barbell rattling: a quick run of small clanks)
        if rng.random() < 0.25:
            for k in range(4):
                q0 = p0 + int((0.08 + k * 0.06) * SR)
                if q0 + 2000 < n: clank[q0:q0 + 2000] += 0.03 * np.sin(2 * np.pi * base * 1.9 * np.arange(2000) / SR) * np.exp(-np.arange(2000) / 400)
        tb += rng.uniform(1.6, 4.5)
    # the speakers through the wall: a muffled four-on-the-floor at 128 bpm and a bass line
    beat = 60 / 128
    music = np.zeros(n)
    for k, tb in enumerate(np.arange(0, secs, beat)):
        p0 = int(tb * SR); L = int(0.25 * SR)
        if p0 + L < n:
            tt = np.arange(L) / SR
            music[p0:p0 + L] += 0.16 * np.sin(2 * np.pi * (55 + 60 * np.exp(-tt / 0.02)) * tt) * np.exp(-tt / 0.09)
    bassline = 0.035 * np.sin(2 * np.pi * np.where((t / (beat * 4)) % 1 < 0.5, 55, 41.2) * t) * (0.6 + 0.4 * np.sin(2 * np.pi * t / beat) ** 2)
    music = lp(music + bassline, 220, 4)
    return air + tread + bp(clank, 120, 9000) + music


def main(stage, src):
    keep, xf, chain, level = STAGES[stage]
    if stage in ('neon', 'pc', 'gym'):
        x = {'neon': synth_neon, 'pc': synth_pc, 'gym': synth_gym}[stage](keep + xf + 0.5)[int(0.5 * SR):]
    else:
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
    if len(sys.argv) < 2 or sys.argv[1] not in STAGES or (len(sys.argv) < 3 and sys.argv[1] not in ('neon', 'pc', 'gym')):
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
