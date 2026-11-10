// Suara halaman video, seluruhnya disintesis dengan Web Audio (tanpa berkas audio, jadi tetap berjalan offline dan
// bebas lisensi): musik latar pada kisi ketukan 100 BPM (pad, bas, arpeggio, piano, ketukan ringan) yang berubah
// tekstur per bagian video, ditambah efek: desir pergantian adegan, "cekrek" kamera pada foto kunjungan, denting saat
// label muncul, dentum pembuka, deru mesin truk, desis rem angin di SPBU, dan suasana terminal.
// Semua peristiwa adalah fungsi dari waktu video, sehingga suara mengikuti jeda, lompat adegan dan geser garis waktu.
import { SHOTS, TOTAL, locate, partStart, labelDelay } from './shots.js';

const BPM = 100, BEAT = 60 / BPM, STEP = BEAT / 2, BAR = BEAT * 4;
const LOOKAHEAD = 0.5; // detik yang dijadwalkan di depan; cukup untuk frame yang tersendat
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const shotStart = (id) => SHOTS.find((s) => s.id === id).start;

// Progresi vi–IV–I–V di D mayor: Bm, G, D, A (satu akor per birama).
const CHORDS = [
  { bass: 47, pad: [59, 62, 66], arp: [71, 74, 78, 83] },
  { bass: 43, pad: [59, 62, 67], arp: [67, 71, 74, 79] },
  { bass: 50, pad: [57, 62, 66], arp: [66, 69, 74, 78] },
  { bass: 45, pad: [57, 61, 64], arp: [64, 69, 73, 76] },
];
const FINAL_BAR = Math.floor((TOTAL - 3.4) / BAR); // akor D penutup, dibiarkan berdengung sampai video selesai
const chordAt = (bar) => (bar === FINAL_BAR ? CHORDS[2] : bar === FINAL_BAR - 1 ? CHORDS[3] : CHORDS[bar % 4]);
// Melodi piano bagian kunjungan: frasa 8 birama, 8 langkah per birama (0 = diam).
const MELODY = [
  [78, 0, 74, 0, 71, 0, 74, 0], [79, 0, 74, 0, 71, 0, 74, 76], [78, 0, 74, 0, 69, 0, 74, 0], [76, 0, 73, 0, 69, 0, 73, 74],
  [74, 0, 78, 0, 83, 0, 81, 0], [79, 0, 0, 78, 74, 0, 0, 0], [78, 0, 81, 0, 78, 0, 74, 0], [76, 0, 0, 0, 73, 0, 76, 0],
];
const T = { map: shotStart('where'), full: shotStart('aerial'), visit: partStart(1), closing: partStart(2) };
export function sectionAt(t) {
  return t < T.map ? 'intro' : t < T.full ? 'map' : t < T.visit ? 'full' : t < T.closing ? 'visit' : 'closing';
}

// Efek satu-kali yang terikat pada garis waktu.
function buildCues() {
  const cues = [];
  const add = (t, fn) => t >= 0 && t < TOTAL && cues.push({ t, fn });
  add(0.2, (m, at) => m.impact(at, 0.36));
  add(T.map - 2.4, (m, at) => m.riser(at, 2.3, 0.07));
  SHOTS.forEach((s, i) => {
    if (i > 0) add(s.start - 0.3, (m, at) => m.whoosh(at, s.kind === 'photo' && SHOTS[i - 1].kind === 'photo' ? 0.045 : 0.085));
    if (s.id.startsWith('v.')) add(s.start + 0.22, (m, at) => m.shutter(at));
    (s.labels || []).forEach(([, , delay], n) => add(s.start + labelDelay(n, delay), (m, at) => m.ping(at, [74, 78, 81, 86, 90][n % 5])));
    if (s.layout === 'section') add(s.start + 0.45, (m, at) => m.chime(at, 0.08));
    if (s.id === 'aerial') add(s.start + 0.6, (m, at) => m.chime(at, 0.05));
    if (s.trip) add(s.start + s.dur * 0.9, (m, at) => m.airBrake(at));
    if (s.layout === 'end') {
      add(s.start - 2.2, (m, at) => m.riser(at, 2.1, 0.05));
      add(s.start + 0.1, (m, at) => m.impact(at, 0.22));
    }
  });
  return cues.sort((a, b) => a.t - b.t);
}
const CUES = buildCues();

// Kekuatan suara berkelanjutan (0..1) pada waktu video t: deru mesin, tinggi nada mesin, suasana terminal.
export function bedLevels(t) {
  const { shot, p } = locate(t);
  const engine = { gate: 0.3, bays: 0.22, bayClose: 0.35, truck: 1, trip: 1 }[shot.id] || 0;
  const slowing = shot.id === 'trip' ? Math.min(1, Math.max(0, (p - 0.72) / 0.2)) : 0;
  const amb = shot.kind !== '3d' ? 0 : shot.world === 'map' ? 0.45 : shot.layout === 'end' ? 0.5 : 1;
  return { engine: engine * (1 - slowing * 0.75), pitch: engine >= 1 ? 1 - slowing * 0.45 : 0.62, amb };
}

// Graf audio dan penjadwal; dipakai oleh konteks waktu-nyata maupun OfflineAudioContext (uji tingkat suara).
export class Mix {
  constructor(ctx) {
    this.ctx = ctx;
    const g = (v) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    this.master = g(0.9);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; // hanya pengaman puncak; keseimbangan diatur lewat tingkat tiap instrumen
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    this.master.connect(limiter).connect(ctx.destination);
    this.musicOut = g(1.15);
    this.sfxOut = g(0.9);
    this.musicOut.connect(this.master);
    this.sfxOut.connect(this.master);
    // Gema ruang dari derau yang meluruh
    const len = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.8;
    }
    const verb = ctx.createConvolver();
    verb.buffer = ir;
    this.verbIn = g(1);
    this.verbIn.connect(verb).connect(g(0.32)).connect(this.master);
    this.musicOut.connect(g(0.5)).connect(this.verbIn);
    this.sfxOut.connect(g(0.35)).connect(this.verbIn);
    // Gema ketukan untuk arpeggio (not 1/8 bertitik)
    this.delayIn = g(1);
    const delay = ctx.createDelay(1), fb = g(0.32);
    delay.delayTime.value = STEP * 1.5;
    this.delayIn.connect(delay).connect(fb).connect(delay);
    delay.connect(g(0.4)).connect(this.musicOut);
    // Derau putih bersama
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // Suara berkelanjutan: mesin truk (dua gergaji rendah + getar) dan suasana terminal (derau lembut)
    this.engineGain = g(0);
    this.ambGain = g(0);
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
    const road = this.loopNoise(), roadBand = ctx.createBiquadFilter();
    roadBand.type = 'bandpass';
    roadBand.frequency.value = 420;
    roadBand.Q.value = 0.5;
    road.connect(roadBand).connect(g(0.5)).connect(chug);
    lp.connect(chug).connect(this.engineGain).connect(this.sfxOut);
    const air = this.loopNoise(), airBand = ctx.createBiquadFilter();
    airBand.type = 'bandpass';
    airBand.frequency.value = 700;
    airBand.Q.value = 0.25;
    air.connect(airBand).connect(this.ambGain).connect(this.sfxOut);
    this.newBus();
  }
  loopNoise() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.start();
    return s;
  }
  // Bus generasi: semua not dan efek terjadwal lewat sini agar bisa dibungkam saat jeda atau lompat waktu
  newBus() {
    const c = this.ctx;
    this.bus = { dry: c.createGain(), fx: c.createGain(), sfx: c.createGain() };
    this.bus.dry.connect(this.musicOut);
    this.bus.fx.connect(this.delayIn);
    this.bus.sfx.connect(this.sfxOut);
  }
  kill() {
    const now = this.ctx.currentTime, old = this.bus;
    for (const n of Object.values(old)) n.gain.setTargetAtTime(0, now, 0.03);
    setTimeout(() => Object.values(old).forEach((n) => n.disconnect()), 300);
    this.newBus();
  }
  beds(at, t, on = true) {
    const b = on ? bedLevels(t) : { engine: 0, pitch: 0.62, amb: 0 };
    this.engineGain.gain.setTargetAtTime(b.engine * 0.04, at, 0.3);
    this.ambGain.gain.setTargetAtTime(b.amb * 0.035, at, 0.5);
    this.engineOsc.forEach((o, i) => o.frequency.setTargetAtTime(58 * b.pitch * (i ? 1.5 : 1), at, 0.4));
    this.engineLfo.frequency.setTargetAtTime(6 + 9 * b.pitch, at, 0.4);
  }

  // ---------- Instrumen ----------
  env(peak, at, attack, dur, dest) {
    const n = this.ctx.createGain();
    n.gain.setValueAtTime(0.0001, at);
    n.gain.linearRampToValueAtTime(peak, at + attack);
    n.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    n.connect(dest);
    return n;
  }
  osc(type, freq, at, dur, dest, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
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
  pad(chord, at, dur, level = 1) {
    for (const note of chord.pad) {
      const amp = this.ctx.createGain();
      amp.gain.setValueAtTime(0.0001, at);
      amp.gain.linearRampToValueAtTime(0.02 * level, at + Math.min(0.9, dur * 0.4));
      amp.gain.setValueAtTime(0.02 * level, at + dur - Math.min(1.1, dur * 0.4));
      amp.gain.linearRampToValueAtTime(0.0001, at + dur);
      amp.connect(this.bus.dry);
      const lp = this.filter('lowpass', 850, 0.3, amp);
      for (const cents of [-7, 7]) this.osc('sawtooth', hz(note), at, dur, lp, cents);
    }
  }
  bass(note, at, dur = 1.0, level = 1) {
    this.osc('sine', hz(note), at, dur, this.env(0.26 * level, at, 0.02, dur, this.bus.dry));
    this.osc('triangle', hz(note + 12), at, dur, this.env(0.1 * level, at, 0.02, dur * 0.7, this.bus.dry));
  }
  // Keluaran not melodi: sedikit ke kiri/kanan agar lebar, kering + gema ketukan
  voice(pan = 0) {
    const out = this.ctx.createStereoPanner();
    out.pan.value = pan;
    out.connect(this.bus.dry);
    out.connect(this.bus.fx);
    return out;
  }
  pluck(note, at, level = 1, pan = 0) {
    const out = this.voice(pan);
    this.osc('triangle', hz(note), at, 0.5, this.env(0.14 * level, at, 0.004, 0.5, out));
    this.osc('sine', hz(note + 12), at, 0.25, this.env(0.05 * level, at, 0.004, 0.25, out));
  }
  piano(note, at, level = 1, pan = 0) {
    const out = this.voice(pan);
    this.osc('triangle', hz(note), at, 1.5, this.env(0.15 * level, at, 0.006, 1.5, out));
    this.osc('sine', hz(note), at, 1.8, this.env(0.09 * level, at, 0.006, 1.8, out));
    this.osc('sine', hz(note + 12), at, 0.6, this.env(0.035 * level, at, 0.004, 0.6, out));
  }
  kick(at) {
    const o = this.osc('sine', 110, at, 0.3, this.env(0.38, at, 0.003, 0.26, this.bus.dry));
    o.frequency.setValueAtTime(110, at);
    o.frequency.exponentialRampToValueAtTime(42, at + 0.13);
  }
  hat(at, level = 1) {
    this.burst(at, 0.05, this.filter('highpass', 7000, 0.7, this.env(0.06 * level, at, 0.002, 0.05, this.bus.dry)));
  }

  // ---------- Efek ----------
  whoosh(at, peak = 0.085, dur = 0.75) {
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.linearRampToValueAtTime(peak, at + dur * 0.45);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    amp.connect(this.bus.sfx);
    const f = this.filter('bandpass', 300, 0.9, amp);
    f.frequency.setValueAtTime(300, at);
    f.frequency.exponentialRampToValueAtTime(2600, at + dur * 0.5);
    f.frequency.exponentialRampToValueAtTime(700, at + dur);
    this.burst(at, dur, f);
  }
  shutter(at) {
    for (const [dt, len, peak] of [[0, 0.02, 0.16], [0.065, 0.03, 0.12]]) this.burst(at + dt, len, this.filter('highpass', 2200, 0.8, this.env(peak, at + dt, 0.001, len, this.bus.sfx)), 1.4);
    this.osc('square', 1900, at, 0.006, this.env(0.03, at, 0.001, 0.006, this.bus.sfx));
  }
  ping(at, note) {
    this.osc('sine', hz(note), at, 0.5, this.env(0.06, at, 0.004, 0.5, this.bus.sfx));
    this.osc('sine', hz(note + 12), at, 0.2, this.env(0.02, at, 0.003, 0.2, this.bus.sfx));
  }
  chime(at, peak = 0.08) {
    [[86, 1], [93, 0.55], [98, 0.35]].forEach(([note, k], i) => this.osc('sine', hz(note), at + i * 0.07, 1.8, this.env(peak * k, at + i * 0.07, 0.005, 1.8, this.bus.sfx)));
  }
  impact(at, peak = 0.5) {
    const o = this.osc('sine', 82, at, 1.4, this.env(peak, at, 0.01, 1.4, this.bus.sfx));
    o.frequency.setValueAtTime(82, at);
    o.frequency.exponentialRampToValueAtTime(38, at + 0.9);
    this.osc('triangle', 164, at, 0.5, this.env(peak * 0.25, at, 0.005, 0.5, this.bus.sfx));
    this.burst(at, 0.5, this.filter('lowpass', 500, 0.5, this.env(peak * 0.35, at, 0.005, 0.5, this.bus.sfx)));
  }
  riser(at, dur = 2.2, peak = 0.07) {
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(peak, at + dur * 0.92);
    amp.gain.linearRampToValueAtTime(0.0001, at + dur);
    amp.connect(this.bus.sfx);
    const f = this.filter('bandpass', 400, 1.4, amp);
    f.frequency.setValueAtTime(400, at);
    f.frequency.exponentialRampToValueAtTime(5200, at + dur);
    this.burst(at, dur, f);
  }
  airBrake(at) {
    this.burst(at, 0.7, this.filter('highpass', 3200, 0.6, this.env(0.07, at, 0.02, 0.7, this.bus.sfx)));
  }

  // ---------- Penjadwal ----------
  // Jadwalkan semua peristiwa dengan waktu video di [from, to); toAudio memetakan waktu video ke waktu konteks audio.
  schedule(from, to, toAudio) {
    for (let k = Math.ceil(from / STEP - 1e-9); k * STEP < to; k++) this.step(k, toAudio(k * STEP));
    for (const c of CUES) if (c.t >= from && c.t < to) c.fn(this, toAudio(c.t));
  }
  step(k, at) {
    const bar = Math.floor(k / 8), pos = k % 8, chord = chordAt(bar);
    if (bar > FINAL_BAR) return;
    if (bar === FINAL_BAR) {
      if (pos !== 0) return;
      this.pad(chord, at, TOTAL - bar * BAR + 0.8, 1.15);
      this.bass(38, at, 3.2);
      chord.arp.concat(86).forEach((n, i) => this.piano(n, at + i * 0.13, 0.9));
      return;
    }
    const sec = sectionAt(k * STEP);
    if (pos === 0) {
      this.pad(chord, at, BAR + 1.1, sec === 'full' ? 0.85 : 1);
      if (sec !== 'intro') this.bass(chord.bass, at, sec === 'full' ? 1.0 : 1.6, sec === 'visit' ? 0.7 : 1);
    }
    const pan = pos % 2 ? 0.3 : -0.3;
    if (sec === 'map' && pos % 2 === 0) this.pluck(chord.arp[[0, 2, 1, 3][pos / 2]], at, 0.75, pos % 4 ? 0.3 : -0.3);
    if (sec === 'full') {
      this.pluck(chord.arp[[0, 1, 2, 3, 2, 1, 2, 3][pos]], at, pos % 4 === 0 ? 1 : 0.7, pan);
      if (pos === 0 || pos === 4) this.kick(at);
      if (pos === 4) this.bass(chord.bass, at, 0.9, 0.8);
      if (pos % 2 === 1) this.hat(at, pos === 3 || pos === 7 ? 1 : 0.6);
    }
    if (sec === 'visit') {
      const note = MELODY[bar % 8][pos];
      if (note) this.piano(note, at, 1, -0.12);
      if (pos === 4) this.pluck(chord.arp[0], at, 0.5);
    }
    if (sec === 'closing') this.pluck(chord.arp[[0, 1, 2, 3, 2, 1, 2, 3][pos]], at, 0.8, pan);
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
  // Dipanggil dari gestur pengguna (klik putar, tombol): browser baru mengizinkan suara setelah itu
  unlock() {
    if (!this.available) return;
    if (!this.mix) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.mix = new Mix(new Ctx());
      this.out = this.mix.master.gain;
      this.out.value = this.muted ? 0 : 0.9;
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
    // Mulai, atau waktu video melompat/tertinggal dari jam audio: bungkam yang terjadwal dan jangkarkan ulang
    if (!this.on || Math.abs(this.anchorAudio + (t - this.anchorFilm) - now) > 0.14) {
      if (this.on) m.kill();
      this.anchorAudio = now + 0.04;
      this.anchorFilm = t;
      this.cursor = t;
      this.on = true;
      const bar = Math.floor(t / BAR), into = t - bar * BAR;
      if (bar < FINAL_BAR && into > 0.05) m.pad(chordAt(bar), now + 0.04, Math.max(1.4, BAR - into + 1.1)); // akor birama berjalan, agar tidak hening
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
  const mix = new Mix(ctx);
  if (!music) mix.musicOut.gain.value = 0;
  if (!sfx) mix.sfxOut.gain.value = 0;
  mix.schedule(from, to, (x) => x - from);
  for (let x = from; x < to; x += 0.25) mix.beds(x - from, x);
  return ctx.startRendering();
}
