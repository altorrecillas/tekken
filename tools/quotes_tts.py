"""The fighters' spoken lines, made with the Piper neural voices: the victory lines (assets/voice/quote_<id>.mp3) and
the lines of the fight's presentation (assets/voice/intro_<id>.mp3, with --intro). Each fighter on a
voice of his own (model, speaker, pitch, pace), cleaned up, given a little presence, gently compressed, with a short
room around it (the announcer has the big echo) and levelled like the announcer's clips.
The text shown on screen is `say` (victory) and `introSay` (presentation) in js/fight/styles.js (keep them the same);
`sayAt` there is the frame of the win pose the line starts on and `sayLen` / `introLen` how long each lasts in frames
(the win screen can't be skipped before the line is said; the presentation's shot of a fighter lasts as long as his
line): copy the frames this prints.
The PUÑETALITY (the finishing move after a win, js/fight/fatality.js): the line the winner says in it
(assets/voice/fatal_<id>.mp3, with --fatal; `fatalSay` in styles.js) and the announcer's call (assets/voice/
punetality.mp3, with --announcer: davefx, deeper, with the announcer's big echo like the other clips).
usage: python3 tools/quotes_tts.py <folder with the .onnx voices> [--intro | --fatal | --announcer] [ids...]
voices (https://huggingface.co/rhasspy/piper-voices): es_ES-davefx-medium, es_ES-sharvard-medium (speakers M=0, F=1).
needs piper (pip install piper-tts) and ffmpeg."""
import os, re, subprocess, sys, tempfile

GAME = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
# id: text spoken, model, speaker, length scale (pace), pitch (by resampling: the voice's size moves with it)
QUOTES = {
    'alejandro': ('¿Eso era todo? Ni me he despeinado.', 'es_ES-sharvard-medium', 0, 0.95, 1.00),
    'aleix': ('Te lo dije, no me puedes ganar.', 'es_ES-davefx-medium', 0, 0.95, 0.95),
    'camilo': ('No molestes, estoy trabajando.', 'es_ES-davefx-medium', 0, 1.00, 1.05),
    'rafa': ('¿Ya? Iba a empezar a calentar.', 'es_ES-sharvard-medium', 0, 1.00, 0.95),
    'zapponi': ('¡Espectacular, vale!', 'es_ES-sharvard-medium', 0, 1.05, 0.90),
    'dani': ('Más sabe el zorro por viejo que por zorro.', 'es_ES-davefx-medium', 0, 1.00, 0.90),
    'noemi': ('Te falta tomar áloe vera.', 'es_ES-sharvard-medium', 1, 0.95, 1.00),
    'orion': ('Clave incorrecta.', 'es_ES-davefx-medium', 0, 1.15, 0.84),
}
# fighters who are machines: their voice robotic (ROBOT_FX after the voice's own chain)
ROBOT = {'orion'}
# a robot's voice: ring-modulated (half of it, against a low hum), a metal comb (a short echo fed back), shifted a little
# off its own pitch, a touch of bit-crush, its band narrowed like a speaker's
def robot_fx(src, dst):
    fc = ('[0:a]asplit=2[d][w];sine=frequency=58:sample_rate=44100,volume=1.0[s];[w][s]amultiply[rm];'
          '[d][rm]amix=inputs=2:weights=0.55 0.6:normalize=0,'
          'aecho=0.9:0.75:7|13:0.45|0.3,afreqshift=shift=-28,acrusher=bits=9:mode=log:aa=1:mix=0.18,'
          'highpass=f=180,lowpass=f=7000,equalizer=f=1300:width_type=o:width=1:g=4,'
          'acompressor=threshold=-20dB:ratio=4:attack=3:release=80:makeup=2[out]')
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-filter_complex', fc, '-map', '[out]', '-ac', '1', '-shortest', dst], check=True)
# the presentation's lines, said in the fighter's own voice above (while the camera is on him before the first round)
INTROS = {
    'alejandro': 'Calienta bien, que esto va a ser rápido.',
    'aleix': 'No hay juego que se me resista.',
    'camilo': 'Tengo una reunión. Acabemos rápido.',
    'rafa': 'Tranquilo, que iré despacito.',
    'zapponi': '¡Esto va a ser espectacular, vale!',
    'dani': 'Ponte los guantes, chaval.',
    'noemi': 'Voy cargadita de áloe vera, cuidado conmigo.',
    'orion': 'Necesito la clave.',
}

# the line said in the fighter's PUÑETALITY
FATALS = {
    'noemi': 'Esto va a escocer un poquito.',
    'camilo': 'Hoy toca día de brazo.',
    'dani': 'Juego, set y partido.',
    'alejandro': 'Récord personal.',
    'rafa': 'Te dije que iría despacito.',
    'zapponi': '¡Eso sí que ha sido espectacular, vale!',
    'orion': 'Acceso denegado. Borrando usuario.',
    'aleix': 'Fin de la partida.',
}
# the announcer's call as the finishing move ends (spelt as it is said: «pu-ñe-TÁ-li-ti»)
ANNOUNCER = {'punetality': 'Puñetáliti.', 'win_orion': '¡Gana Orión!', 'win_aleix': '¡Gana Aléish!'}  # (Aleix said the Catalan way: «a-LEISH»)


def volume(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.search(r'mean_volume: (-?[\d.]+)', r).group(1)), float(re.search(r'max_volume: (-?[\d.]+)', r).group(1))


def make(vid, voices, tmp, intro=False, fatal=False):
    text, model, speaker, length, pitch = QUOTES[vid]
    if intro:
        text = INTROS[vid]
    if fatal:
        text = FATALS[vid]
    raw, pre = os.path.join(tmp, vid + '.wav'), os.path.join(tmp, vid + '_pre.wav')
    subprocess.run(['piper', '-m', os.path.join(voices, model + '.onnx'), '-s', str(speaker), '--length-scale', str(length), '-f', raw],
                   input=text.encode(), check=True, capture_output=True)
    chain = (f'asetrate={int(22050 * pitch)},aresample=44100,atempo={1 / pitch:.4f},'
             'highpass=f=85,lowpass=f=10000,equalizer=f=2800:width_type=o:width=1.2:g=2.5,equalizer=f=220:width_type=o:width=1:g=1.5,'
             'acompressor=threshold=-20dB:ratio=3:attack=5:release=90:makeup=2,'
             'aecho=0.85:0.5:28|52:0.14|0.07,adelay=40,apad=pad_dur=0.2')
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-af', chain, '-ac', '1', pre], check=True)
    if vid in ROBOT:
        rob = os.path.join(tmp, vid + '_rob.wav')
        robot_fx(pre, rob)
        pre = rob
    mean, peak = volume(pre)
    gain = min(-18.0 - mean, -1.5 - peak)  # like the announcer (about -18 dB), never past -1.5 dB peak
    out = os.path.join(GAME, 'assets/voice/%s_%s.mp3' % ('intro' if intro else 'fatal' if fatal else 'quote', vid))
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', pre, '-af', f'volume={gain:.2f}dB', '-ar', '44100', '-ac', '1', '-b:a', '80k', out], check=True)
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], capture_output=True, text=True).stdout)
    # (where the voice stops: the last moment within 40 dB of its peak; the room's echo and the padding come after)
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', out, '-ac', '1', '-ar', '44100', '-f', 's16le', '-'], capture_output=True).stdout
    a = [abs(int.from_bytes(raw[i:i + 2], 'little', signed=True)) for i in range(0, len(raw) - 1, 2)]
    pk = max(a) or 1
    end = next((len(a) - i for i, v in enumerate(reversed(a)) if v > pk / 100), len(a)) / 44100
    print(f'{vid:10s} {dur:.2f} s ({round(dur * 60)} frames), the voice ends at frame {int(end * 60) + 1}  «{text}»')


def announcer(key, voices, tmp):
    """the announcer's call: davefx a little slower and deeper than the fighters, the arena's long echo"""
    raw, pre = os.path.join(tmp, key + '.wav'), os.path.join(tmp, key + '_pre.wav')
    subprocess.run(['piper', '-m', os.path.join(voices, 'es_ES-davefx-medium.onnx'), '--length-scale', '1.12', '-f', raw],
                   input=ANNOUNCER[key].encode(), check=True, capture_output=True)
    pitch = 0.86
    chain = (f'asetrate={int(22050 * pitch)},aresample=44100,atempo={1 / pitch:.4f},'
             'highpass=f=70,lowpass=f=9500,equalizer=f=160:width_type=o:width=1:g=3,equalizer=f=2600:width_type=o:width=1.2:g=2,'
             'acompressor=threshold=-22dB:ratio=4:attack=4:release=120:makeup=3,'
             'aecho=0.8:0.6:70|150:0.3|0.18,apad=pad_dur=0.6')
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-af', chain, '-ac', '1', pre], check=True)
    mean, peak = volume(pre)
    gain = min(-16.0 - mean, -1.0 - peak)
    out = os.path.join(GAME, 'assets/voice/%s.mp3' % key)
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', pre, '-af', f'volume={gain:.2f}dB', '-ar', '44100', '-ac', '1', '-b:a', '80k', out], check=True)
    print(key, 'written')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    intro, fatal, ann = '--intro' in sys.argv, '--fatal' in sys.argv, '--announcer' in sys.argv
    ids = [a for a in sys.argv[2:] if not a.startswith('--')]
    with tempfile.TemporaryDirectory() as tmp:
        if ann:
            for key in ids or list(ANNOUNCER):
                announcer(key, sys.argv[1], tmp)
        else:
            for vid in ids or list(FATALS if fatal else QUOTES):
                make(vid, sys.argv[1], tmp, intro, fatal)
