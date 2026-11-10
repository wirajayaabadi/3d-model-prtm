// Suara halaman video. Musik latar adalah rekaman pilihan tim (assets/background-music.mp3, salinan dari
// docs/background-music.mp3): 120 BPM, C mayor, sekitar 2,5 menit. Garis waktu di shots.js dipotong mengikuti birama
// dan bagian lagu itu, dan waktu video sama dengan waktu rekaman, jadi potongan gambar jatuh tepat di ketukan.
// Efek di atas musik disintesis dengan Web Audio: desir pergantian teks, "cekrek" kamera pada foto kunjungan, denting
// saat tag muncul, deru mesin truk dan desis rem angin di SPBU. Tidak ada derau latar yang terus-menerus: lapisan
// "suasana terminal" dan derau jalan pada mesin dihapus karena terdengar sebagai desis di adegan 3D.
// Semua peristiwa adalah fungsi dari waktu video, sehingga suara mengikuti jeda, lompat adegan dan geser garis waktu.
import { SHOTS, TOTAL, locate, labelDelay } from './shots.js';
import musicUrl from './assets/background-music.mp3?url';

const LOOKAHEAD = 0.5; // detik efek yang dijadwalkan di depan; cukup untuk frame yang tersendat
const MUSIC_GAIN = 0.5; // rekaman sudah di-master keras (puncak -0,4 dB); diturunkan agar efek tetap terdengar
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const PING_NOTES = [72, 76, 79, 84, 88]; // C – E – G – C – E, senada dengan lagu (C mayor)

// Rekaman musik diunduh dan didekode sekali; hasilnya dipakai konteks waktu-nyata maupun render luring.
let trackPromise;
export function loadTrack() {
  trackPromise ??= fetch(musicUrl)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((data) => new OfflineAudioContext(2, 1, 44100).decodeAudioData(data));
  return trackPromise;
}

// Efek satu-kali yang terikat pada garis waktu.
function buildCues() {
  const cues = [];
  const add = (t, fn) => t >= 0 && t < TOTAL && cues.push({ t, fn });
  SHOTS.forEach((s, i) => {
    const prev = SHOTS[i - 1];
    if (prev && prev.cap !== s.cap) add(s.start - 0.3, (m, at) => m.whoosh(at, s.kind === 'photo' && prev.kind === 'photo' ? 0.05 : 0.09));
    if (s.id.startsWith('v.')) add(s.start + 0.2, (m, at) => m.shutter(at));
    (s.labels || []).forEach(([, , delay], n) => add(s.start + labelDelay(n, delay), (m, at) => m.ping(at, PING_NOTES[n % PING_NOTES.length])));
    if (s.layout === 'section') add(s.start + 0.4, (m, at) => m.chime(at, 0.09));
    if (s.id === 'aerial') add(s.start + 0.55, (m, at) => m.chime(at, 0.06));
    if (s.tripEase) add(s.start + s.dur * 0.86, (m, at) => m.airBrake(at));
  });
  return cues.sort((a, b) => a.t - b.t);
}
const CUES = buildCues();

// Kekuatan suara berkelanjutan (0..1) pada waktu video t: deru mesin dan tinggi nadanya.
const ENGINE = { gate: 0.3, gateLow: 0.5, bays: 0.22, baysLow: 0.35, bayClose: 0.35, wheel: 1, truck: 1, tripExit: 1, tripRoad: 1, trip: 1 };
export function bedLevels(t) {
  const { shot: s, p } = locate(t);
  const engine = ENGINE[s.id] || 0;
  const slowing = s.tripEase ? Math.min(1, Math.max(0, (p - 0.6) / 0.3)) : 0;
  return { engine: engine * (1 - slowing * 0.75), pitch: engine >= 1 ? 1 - slowing * 0.45 : 0.62 };
}

// Graf audio dan penjadwal; dipakai oleh konteks waktu-nyata maupun OfflineAudioContext (uji tingkat suara).
export class Mix {
  constructor(ctx, track = null) {
    this.ctx = ctx;
    this.track = track; // AudioBuffer rekaman musik; bisa menyusul setelah selesai didekode
    const g = (v) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    this.master = g(0.9);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; // hanya pengaman puncak; keseimbangan diatur lewat tingkat musik dan tiap efek
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    this.master.connect(limiter).connect(ctx.destination);
    this.musicOut = g(MUSIC_GAIN); // rekaman langsung ke master, tanpa gema tambahan
    this.sfxOut = g(1.6); // efek diangkat agar tidak tenggelam di bawah rekaman yang padat
    this.musicOut.connect(this.master);
    this.sfxOut.connect(this.master);
    // Gema ruang dari derau yang meluruh, hanya untuk efek
    const len = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.8;
    }
    const verb = ctx.createConvolver();
    verb.buffer = ir;
    this.sfxOut.connect(g(0.35)).connect(verb).connect(g(0.32)).connect(this.master);
    // Derau putih bersama
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // Suara berkelanjutan: mesin truk (dua gergaji rendah yang diredam + getar), tanpa derau
    this.engineGain = g(0);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    this.engineOsc = [0, 7].map((cents, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 58 * (i ? 1.5 : 1);
      o.detune.value = cents;
      o.connect(lp);
      o.start();
      return o;
    });
    const chug = g(0.75), lfo = ctx.createOscillator(), lfoGain = g(0.25);
    lfo.frequency.value = 11;
    lfo.connect(lfoGain).connect(chug.gain);
    lfo.start();
    this.engineLfo = lfo;
    lp.connect(chug).connect(this.engineGain).connect(this.sfxOut);
    this.newBus();
  }
  // Bus generasi: semua efek terjadwal lewat sini agar bisa dibungkam saat jeda atau lompat waktu
  newBus() {
    this.bus = this.ctx.createGain();
    this.bus.connect(this.sfxOut);
  }
  kill() {
    const now = this.ctx.currentTime, old = this.bus;
    old.gain.setTargetAtTime(0, now, 0.03);
    setTimeout(() => old.disconnect(), 300);
    this.newBus();
    this.stopTrack();
  }
  beds(at, t, on = true) {
    const b = on ? bedLevels(t) : { engine: 0, pitch: 0.62 };
    this.engineGain.gain.setTargetAtTime(b.engine * 0.04, at, 0.3);
    this.engineOsc.forEach((o, i) => o.frequency.setTargetAtTime(58 * b.pitch * (i ? 1.5 : 1), at, 0.4));
    this.engineLfo.frequency.setTargetAtTime(6 + 9 * b.pitch, at, 0.4);
  }

  // ---------- Musik ----------
  // Putar rekaman mulai waktu konteks `at`, dari posisi `offset` detik di dalam rekaman (= waktu video).
  playTrack(at, offset) {
    this.stopTrack();
    if (!this.track || offset >= this.track.duration) return;
    const src = this.ctx.createBufferSource(), fade = this.ctx.createGain();
    src.buffer = this.track;
    fade.gain.setValueAtTime(0.0001, at);
    fade.gain.linearRampToValueAtTime(1, at + 0.05); // masuk lembut agar tidak berbunyi "klik" di tengah lagu
    src.connect(fade).connect(this.musicOut);
    src.start(at, Math.max(0, offset));
    this.playing = { src, fade };
  }
  stopTrack() {
    const p = this.playing;
    if (!p) return;
    const now = this.ctx.currentTime;
    p.fade.gain.cancelScheduledValues(now);
    p.fade.gain.setTargetAtTime(0, now, 0.03);
    p.src.stop(now + 0.25);
    this.playing = null;
  }

  // ---------- Pembangun bunyi ----------
  // Selubung: serang cepat, meluruh ke `tail` (bagian dari puncak), lalu padam di ujung
  env(peak, at, attack, dur, tail = 0) {
    const n = this.ctx.createGain();
    n.gain.setValueAtTime(0.0001, at);
    n.gain.linearRampToValueAtTime(peak, at + attack);
    if (tail > 0) {
      n.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * tail), at + dur - 0.03);
      n.gain.linearRampToValueAtTime(0.0001, at + dur);
    } else n.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    n.connect(this.bus);
    return n;
  }
  osc(type, freq, at, dur, dest) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(dest);
    o.start(at);
    o.stop(at + dur + 0.05);
    return o;
  }
  burst(at, dur, dest, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = rate;
    s.connect(dest);
    s.start(at, Math.random() * 1.5, dur + 0.05);
    return s;
  }
  filter(type, freq, q, dest) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(dest);
    return f;
  }

  // ---------- Efek ----------
  whoosh(at, peak = 0.085, dur = 0.75) {
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.linearRampToValueAtTime(peak, at + dur * 0.45);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    amp.connect(this.bus);
    const f = this.filter('bandpass', 300, 0.9, amp);
    f.frequency.setValueAtTime(300, at);
    f.frequency.exponentialRampToValueAtTime(2600, at + dur * 0.5);
    f.frequency.exponentialRampToValueAtTime(700, at + dur);
    this.burst(at, dur, f);
  }
  shutter(at) {
    for (const [dt, len, peak] of [[0, 0.02, 0.16], [0.065, 0.03, 0.12]]) this.burst(at + dt, len, this.filter('highpass', 2200, 0.8, this.env(peak, at + dt, 0.001, len)), 1.4);
    this.osc('square', 1900, at, 0.006, this.env(0.03, at, 0.001, 0.006));
  }
  ping(at, note) {
    this.osc('sine', hz(note), at, 0.5, this.env(0.06, at, 0.004, 0.5));
    this.osc('sine', hz(note + 12), at, 0.2, this.env(0.02, at, 0.003, 0.2));
  }
  chime(at, peak = 0.08) {
    [[84, 1], [91, 0.55], [96, 0.35]].forEach(([note, k], i) => this.osc('sine', hz(note), at + i * 0.07, 1.8, this.env(peak * k, at + i * 0.07, 0.005, 1.8)));
  }
  airBrake(at) {
    this.burst(at, 0.7, this.filter('highpass', 3200, 0.6, this.env(0.07, at, 0.02, 0.7)));
  }

  // Jadwalkan efek dengan waktu video di [from, to); toAudio memetakan waktu video ke waktu konteks audio.
  schedule(from, to, toAudio) {
    for (const c of CUES) if (c.t >= from && c.t < to) c.fn(this, toAudio(c.t));
  }
}

// Pengendali waktu-nyata: mengikuti waktu video, jeda, lompatan, dan tombol bisu.
export class Soundtrack {
  constructor() {
    this.muted = false;
    try {
      this.muted = localStorage.getItem('itj-film-muted') === '1';
    } catch {}
    this.on = false;
  }
  get available() {
    return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
  }
  // Unduh dan dekode musik sejak halaman dibuka, supaya sudah siap saat video diputar. Bila gagal, video tetap
  // berjalan dengan efek saja.
  preload() {
    if (!this.available || this.loading) return;
    this.loading = loadTrack()
      .then((track) => {
        this.track = track;
        if (this.mix) this.mix.track = track;
      })
      .catch((e) => console.warn('Musik latar tidak dapat dimuat', e));
  }
  // Dipanggil dari gestur pengguna (klik putar, tombol): browser baru mengizinkan suara setelah itu
  unlock() {
    if (!this.available) return;
    if (!this.mix) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.mix = new Mix(new Ctx(), this.track);
      this.out = this.mix.master.gain;
      this.out.value = this.muted ? 0 : 0.9;
      this.preload();
    }
    if (this.mix.ctx.state === 'suspended') this.mix.ctx.resume().catch(() => {});
  }
  setMuted(muted) {
    this.muted = muted;
    try {
      localStorage.setItem('itj-film-muted', muted ? '1' : '0');
    } catch {}
    if (this.mix) this.out.setTargetAtTime(muted ? 0 : 0.9, this.mix.ctx.currentTime, 0.05);
  }
  update(t, playing) {
    const m = this.mix;
    if (!m || m.ctx.state !== 'running') return;
    const now = m.ctx.currentTime;
    if (!playing) {
      if (this.on) {
        m.kill();
        m.beds(now, t, false);
        this.on = false;
      }
      return;
    }
    // Mulai, atau waktu video melompat/tertinggal dari jam audio: bungkam yang sedang berbunyi dan jangkarkan ulang
    if (!this.on || Math.abs(this.anchorAudio + (t - this.anchorFilm) - now) > 0.14) {
      if (this.on) m.kill();
      this.anchorAudio = now + 0.04;
      this.anchorFilm = t;
      this.cursor = t;
      this.on = true;
    }
    // Musik: mulai dari posisi rekaman yang sama dengan waktu video (juga bila rekaman baru selesai didekode)
    if (m.track && !m.playing && t < m.track.duration) {
      const at = Math.max(now + 0.02, this.anchorAudio);
      m.playTrack(at, this.anchorFilm + (at - this.anchorAudio));
    }
    const until = t + LOOKAHEAD;
    if (until > this.cursor) {
      m.schedule(this.cursor, until, (x) => this.anchorAudio + (x - this.anchorFilm));
      this.cursor = until;
    }
    m.beds(now, t);
  }
}

// Render luring untuk memeriksa tingkat suara (dipakai dari konsol/pengujian, bukan saat video diputar).
export async function renderSoundtrack(from = 0, to = TOTAL, sampleRate = 22050, { music = true, sfx = true } = {}) {
  const ctx = new OfflineAudioContext(2, Math.ceil((to - from) * sampleRate), sampleRate);
  const mix = new Mix(ctx, music ? await loadTrack() : null);
  if (!sfx) mix.sfxOut.gain.value = 0;
  mix.playTrack(0, from);
  mix.schedule(from, to, (x) => x - from);
  for (let x = from; x < to; x += 0.25) mix.beds(x - from, x);
  return ctx.startRendering();
}
