"""The fighters' victory lines (assets/voice/quote_<id>.mp3), made with the Piper neural voices: each fighter on a
voice of his own (model, speaker, pitch, pace), cleaned up, given a little presence, gently compressed, with a short
room around it (the announcer has the big echo) and levelled like the announcer's clips.
The text shown on screen is `say` in js/fight/styles.js (keep both the same); `sayAt` there is the frame of the win
pose the line starts on and `sayLen` how long it lasts (frames: a key cannot end the win screen before it is said).
usage: python3 tools/quotes_tts.py <folder with the .onnx voices> [ids...]
voices (https://huggingface.co/rhasspy/piper-voices): es_ES-davefx-medium, es_ES-sharvard-medium (speakers M=0, F=1).
needs piper (pip install piper-tts) and ffmpeg."""
import os, re, subprocess, sys, tempfile

GAME = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
# id: text spoken, model, speaker, length scale (pace), pitch (by resampling: the voice's size moves with it)
QUOTES = {
    'alejandro': ('¿Eso era todo? Ni me he despeinado.', 'es_ES-sharvard-medium', 0, 0.95, 1.00),
    'arnau': ('¡En mi consola esto era más difícil!', 'es_ES-davefx-medium', 0, 0.90, 0.86),
    'camilo': ('No molestes, estoy trabajando.', 'es_ES-davefx-medium', 0, 1.00, 1.05),
    'rafa': ('¿Ya? Iba a empezar a calentar.', 'es_ES-sharvard-medium', 0, 1.00, 0.95),
    'zapponi': ('¡Espectacular, vale!', 'es_ES-sharvard-medium', 0, 1.05, 0.90),
    'dani': ('Más sabe el zorro por viejo que por zorro.', 'es_ES-davefx-medium', 0, 1.00, 0.90),
    'noemi': ('Te falta tomar áloe vera.', 'es_ES-sharvard-medium', 1, 0.95, 1.00),
}


def volume(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.search(r'mean_volume: (-?[\d.]+)', r).group(1)), float(re.search(r'max_volume: (-?[\d.]+)', r).group(1))


def make(vid, voices, tmp):
    text, model, speaker, length, pitch = QUOTES[vid]
    raw, pre = os.path.join(tmp, vid + '.wav'), os.path.join(tmp, vid + '_pre.wav')
    subprocess.run(['piper', '-m', os.path.join(voices, model + '.onnx'), '-s', str(speaker), '--length-scale', str(length), '-f', raw],
                   input=text.encode(), check=True, capture_output=True)
    chain = (f'asetrate={int(22050 * pitch)},aresample=44100,atempo={1 / pitch:.4f},'
             'highpass=f=85,lowpass=f=10000,equalizer=f=2800:width_type=o:width=1.2:g=2.5,equalizer=f=220:width_type=o:width=1:g=1.5,'
             'acompressor=threshold=-20dB:ratio=3:attack=5:release=90:makeup=2,'
             'aecho=0.85:0.5:28|52:0.14|0.07,adelay=40,apad=pad_dur=0.2')
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-af', chain, '-ac', '1', pre], check=True)
    mean, peak = volume(pre)
    gain = min(-18.0 - mean, -1.5 - peak)  # like the announcer (about -18 dB), never past -1.5 dB peak
    out = os.path.join(GAME, 'assets/voice/quote_%s.mp3' % vid)
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', pre, '-af', f'volume={gain:.2f}dB', '-ar', '44100', '-ac', '1', '-b:a', '80k', out], check=True)
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], capture_output=True, text=True).stdout)
    print(f'{vid:10s} {dur:.2f} s ({round(dur * 60)} frames)  «{text}»')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    with tempfile.TemporaryDirectory() as tmp:
        for vid in sys.argv[2:] or list(QUOTES):
            make(vid, sys.argv[1], tmp)
