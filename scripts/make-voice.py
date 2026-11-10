#!/usr/bin/env python3
"""Membuat berkas suara narasi video dari naskah src/film/narration.json.

Mesin suara: Piper (sumber terbuka, berjalan di komputer sendiri) dengan suara Indonesia `id_ID-news_tts-medium`,
atau `say` bawaan macOS (suara Damayanti) sebagai cadangan.

  pip install piper-tts
  # unduh id_ID-news_tts-medium.onnx dan .onnx.json dari https://huggingface.co/rhasspy/piper-voices (id/id_ID/news_tts/medium)
  python3 scripts/make-voice.py --model jalur/ke/id_ID-news_tts-medium.onnx
  python3 scripts/make-voice.py --engine say            # tanpa Piper

Tiap kalimat ditulis ke src/film/assets/voice/<id>.m4a (AAC, lewat `afconvert` macOS), dan durasinya ke
src/film/assets/voice/index.json. Pemutar membaca durasi itu untuk menurunkan musik selama narasi; tests/film.test.js
memeriksa bahwa setiap kalimat muat di slotnya. Untuk memakai rekaman sendiri, timpa berkas .m4a lalu jalankan
`python3 scripts/make-voice.py --measure` agar index.json dihitung ulang.
"""
import argparse, json, subprocess, sys, tempfile, wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / 'src/film/narration.json'
OUT = ROOT / 'src/film/assets/voice'
RATE = 22050
TARGET_RMS_DB = -20.0  # tingkat rata-rata tiap kalimat; keseimbangan terhadap musik diatur di src/film/audio.js
PEAK_DB = -1.5


def read_wav(path):
    with wave.open(str(path), 'rb') as w:
        assert w.getsampwidth() == 2, 'butuh WAV 16-bit'
        x = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float32) / 32768
        if w.getnchannels() > 1:
            x = x.reshape(-1, w.getnchannels()).mean(1)
        return x, w.getframerate()


def write_wav(path, x, rate):
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())


def polish(x, rate):
    """Buang hening di awal/akhir, samakan tingkat suara, beri fade pendek."""
    win = max(1, int(rate * 0.01))
    env = np.sqrt(np.convolve(x * x, np.ones(win) / win, 'same'))
    loud = np.flatnonzero(env > 10 ** (-45 / 20))
    if len(loud):
        pad = int(rate * 0.03)
        x = x[max(0, loud[0] - pad):min(len(x), loud[-1] + pad)]
    rms = float(np.sqrt(np.mean(x * x))) or 1e-9
    x = x * (10 ** (TARGET_RMS_DB / 20) / rms)
    peak = float(np.abs(x).max())
    if peak > 10 ** (PEAK_DB / 20):
        x = np.tanh(x / peak * 1.5) / np.tanh(1.5) * 10 ** (PEAK_DB / 20)  # puncak dilunakkan, bukan dipotong
    fade = int(rate * 0.008)
    x[:fade] *= np.linspace(0, 1, fade)
    x[-fade:] *= np.linspace(1, 0, fade)
    return x


def synth_piper(voice, text, speed, path):
    from piper import SynthesisConfig
    with wave.open(str(path), 'wb') as w:
        voice.synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=1 / speed))


def synth_say(text, speed, path):
    aiff = Path(str(path) + '.aiff')
    subprocess.run(['say', '-v', 'Damayanti', '-r', str(round(170 * speed)), '-o', str(aiff), text], check=True)
    subprocess.run(['afconvert', '-f', 'WAVE', '-d', f'LEI16@{RATE}', '-c', '1', str(aiff), str(path)], check=True)
    aiff.unlink()


def m4a_seconds(path):
    out = subprocess.run(['afinfo', str(path)], check=True, capture_output=True, text=True).stdout
    return float(next(l for l in out.splitlines() if 'estimated duration' in l).split(':')[1].split()[0])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--engine', choices=['piper', 'say'], default='piper')
    ap.add_argument('--model', help='berkas .onnx suara Piper')
    ap.add_argument('--espeak-data', help='folder espeak-ng-data (bila jalur bawaan Piper terlalu panjang)')
    ap.add_argument('--speed', type=float, default=1.0, help='kecepatan bicara; 1.1 = 10%% lebih cepat')
    ap.add_argument('--only', nargs='*', help='hanya id kalimat ini')
    ap.add_argument('--measure', action='store_true', help='tidak membuat suara; hanya menghitung ulang index.json dari berkas yang ada')
    ap.add_argument('--keep-wav', help='folder untuk menyimpan salinan WAV (pemeriksaan)')
    a = ap.parse_args()

    script = json.loads(SCRIPT.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    index_path = OUT / 'index.json'
    index = json.loads(index_path.read_text()) if index_path.exists() else {'engine': None, 'seconds': {}}
    voice = None
    if not a.measure and a.engine == 'piper':
        if not a.model:
            sys.exit('--model wajib untuk Piper (lihat petunjuk di kepala berkas ini)')
        from piper import PiperVoice
        voice = PiperVoice.load(a.model, **({'espeak_data_dir': a.espeak_data} if a.espeak_data else {}))

    for seg in script['segments']:
        target = OUT / f"{seg['id']}.m4a"
        if not a.measure and (not a.only or seg['id'] in a.only):
            speed = a.speed * seg.get('speed', 1)
            with tempfile.TemporaryDirectory() as tmp:
                raw, clean = Path(tmp) / 'raw.wav', Path(tmp) / 'clean.wav'
                text = seg.get('tts', seg['text'])
                synth_piper(voice, text, speed, raw) if voice else synth_say(text, speed, raw)
                x, rate = read_wav(raw)
                x = polish(x, rate)
                write_wav(clean, x, rate)
                if a.keep_wav:
                    Path(a.keep_wav).mkdir(parents=True, exist_ok=True)
                    write_wav(Path(a.keep_wav) / f"{seg['id']}.wav", x, rate)
                subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '64000', str(clean), str(target)], check=True)
            index['engine'] = 'piper id_ID-news_tts-medium' if voice else 'macOS say (Damayanti)'
        if not target.exists():
            sys.exit(f'berkas suara belum ada: {target}')
        index['seconds'][seg['id']] = round(m4a_seconds(target), 2)
        print(f"{seg['id']:10s} {index['seconds'][seg['id']]:5.2f} s  {seg['text']}")

    index['seconds'] = {s['id']: index['seconds'][s['id']] for s in script['segments']}
    index_path.write_text(json.dumps(index, indent=2, ensure_ascii=False) + '\n')
    print(f"total {sum(index['seconds'].values()):.1f} s → {index_path.relative_to(ROOT)}")


if __name__ == '__main__':
    main()
