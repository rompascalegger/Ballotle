/* Ballotle – Chiptune-Sounds, komplett per WebAudio synthetisiert (keine Dateien). */
(function () {
  'use strict';
  let ctx = null, master = null, noiseBuf = null;
  let enabled = true;
  let heartTimer = null, heartRate = 0;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function now() { return ctx.currentTime; }

  function tone(freq, t0, dur, opt) {
    opt = opt || {};
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opt.type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (opt.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.to), t0 + dur);
    if (opt.detune) o.detune.value = opt.detune;
    const v = opt.vol == null ? 0.18 : opt.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + (opt.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(opt.dest || master);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }

  function noise(t0, dur, opt) {
    opt = opt || {};
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = opt.filter || 'bandpass';
    f.frequency.setValueAtTime(opt.freq || 1800, t0);
    if (opt.freqTo) f.frequency.exponentialRampToValueAtTime(opt.freqTo, t0 + dur);
    f.Q.value = opt.q || 1;
    const g = ctx.createGain();
    const v = opt.vol == null ? 0.25 : opt.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + (opt.attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  }

  const N = (semi) => 440 * Math.pow(2, (semi - 9) / 12); // semi 0 = C4

  const S = {
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; if (!v) S.heartbeat(0); },
    unlock() { ensure(); },

    drumroll(ms) {
      if (!enabled || !ensure()) return;
      const t0 = now(), dur = ms / 1000;
      let t = 0, i = 0;
      while (t < dur) {
        const p = t / dur;
        noise(t0 + t, 0.05, { freq: 2200 + 800 * p, q: 0.8, vol: 0.06 + 0.16 * p });
        if (i % 2 === 0) tone(110 + 40 * p, t0 + t, 0.04, { type: 'triangle', vol: 0.05 + 0.07 * p });
        t += 0.055 - 0.03 * p; i++;
      }
    },
    rattle() {
      if (!enabled || !ensure()) return;
      const t0 = now();
      for (let i = 0; i < 7; i++) {
        tone(900 + Math.random() * 500, t0 + i * 0.055 + Math.random() * 0.02, 0.03, { type: 'square', vol: 0.07 });
        noise(t0 + i * 0.055, 0.025, { freq: 3500, q: 4, vol: 0.1 });
      }
    },
    pop() {
      if (!enabled || !ensure()) return;
      const t0 = now();
      tone(220, t0, 0.12, { type: 'triangle', to: 660, vol: 0.2 });
      noise(t0, 0.08, { freq: 5000, q: 2, vol: 0.15 });
    },
    gold(streak) {
      if (!enabled || !ensure()) return;
      const t0 = now(); const base = 12 + Math.min(streak, 8) * 2;
      [0, 4, 7, 12, 16].forEach((s, i) => tone(N(base + s), t0 + i * 0.06, 0.18, { type: 'square', vol: 0.12 }));
      [0, 4, 7, 12, 16].forEach((s, i) => tone(N(base + s + 12), t0 + i * 0.06 + 0.01, 0.14, { type: 'triangle', vol: 0.08 }));
      tone(N(base + 24), t0 + 0.32, 0.5, { type: 'square', vol: 0.09 });
      for (let i = 0; i < 6; i++) tone(2400 + Math.random() * 1800, t0 + 0.3 + i * 0.05, 0.06, { type: 'sine', vol: 0.05 });
    },
    silver() {
      if (!enabled || !ensure()) return;
      const t0 = now();
      tone(N(19), t0, 0.12, { type: 'triangle', vol: 0.2 });
      tone(N(26), t0 + 0.08, 0.25, { type: 'triangle', vol: 0.18 });
      tone(N(31), t0 + 0.08, 0.2, { type: 'sine', vol: 0.08 });
    },
    black() {
      if (!enabled || !ensure()) return;
      const t0 = now();
      tone(160, t0, 0.9, { type: 'sawtooth', to: 30, vol: 0.3 });
      tone(80, t0, 0.7, { type: 'square', to: 25, vol: 0.2 });
      tone(55, t0, 0.5, { type: 'sine', to: 30, vol: 0.5 });
      noise(t0, 0.7, { filter: 'lowpass', freq: 1500, freqTo: 100, vol: 0.5 });
      // absteigende "Wah-wah"-Töne
      [7, 6, 5].forEach((s, i) => tone(N(s - 12), t0 + 0.45 + i * 0.22, 0.24, { type: 'square', vol: 0.12 }));
      tone(N(-8), t0 + 1.1, 0.7, { type: 'square', to: N(-10), vol: 0.12 });
    },
    shield() {
      if (!enabled || !ensure()) return;
      const t0 = now();
      noise(t0, 0.35, { filter: 'highpass', freq: 3000, vol: 0.35 });
      for (let i = 0; i < 8; i++) tone(3000 + Math.random() * 3000, t0 + Math.random() * 0.2, 0.08, { type: 'sine', vol: 0.06 });
      [0, 4, 7, 12, 16, 19].forEach((s, i) => tone(N(12 + s), t0 + 0.2 + i * 0.05, 0.2, { type: 'triangle', vol: 0.12 }));
    },
    rainbow() {
      if (!enabled || !ensure()) return;
      const t0 = now();
      [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24].forEach((s, i) => tone(N(12 + s), t0 + i * 0.035, 0.22, { type: i % 2 ? 'triangle' : 'square', vol: 0.08 }));
    },
    ice() {
      if (!enabled || !ensure()) return;
      const t0 = now();
      [31, 36, 33, 38, 43].forEach((s, i) => tone(N(s), t0 + i * 0.07, 0.4, { type: 'sine', vol: 0.12, detune: 8 }));
      noise(t0, 0.5, { filter: 'highpass', freq: 6000, vol: 0.08 });
    },
    lightning() {
      if (!enabled || !ensure()) return;
      const t0 = now();
      noise(t0, 0.25, { filter: 'highpass', freq: 1200, vol: 0.6 });
      noise(t0 + 0.05, 1.2, { filter: 'lowpass', freq: 400, freqTo: 60, vol: 0.4 });
      tone(1800, t0, 0.12, { type: 'sawtooth', to: 200, vol: 0.15 });
    },
    fog() {
      if (!enabled || !ensure()) return;
      const t0 = now();
      noise(t0, 1.0, { filter: 'bandpass', freq: 300, freqTo: 1200, q: 0.6, vol: 0.25, attack: 0.3 });
      tone(N(-5), t0, 0.9, { type: 'sine', vol: 0.06, attack: 0.3 });
    },
    plonk(i) {
      if (!enabled || !ensure()) return;
      const t0 = now();
      tone(140 - (i || 0) * 15, t0, 0.25, { type: 'triangle', to: 50, vol: 0.3 });
      noise(t0, 0.06, { filter: 'lowpass', freq: 800, vol: 0.2 });
    },
    cash(big) {
      if (!enabled || !ensure()) return;
      const t0 = now();
      noise(t0, 0.06, { freq: 4000, q: 1, vol: 0.2 });
      tone(N(24), t0 + 0.02, 0.12, { type: 'square', vol: 0.14 });
      tone(N(31), t0 + 0.09, 0.4, { type: 'square', vol: 0.14 });
      const n = big ? 18 : 9;
      for (let i = 0; i < n; i++) tone(2000 + Math.random() * 2500, t0 + 0.15 + i * 0.045, 0.07, { type: 'square', vol: 0.04 });
    },
    tick(p) {
      if (!enabled || !ensure()) return;
      tone(1200 + (p || 0) * 800, now(), 0.025, { type: 'square', vol: 0.035 });
    },
    click() {
      if (!enabled || !ensure()) return;
      tone(600, now(), 0.03, { type: 'square', vol: 0.06 });
    },
    fanfare() {
      if (!enabled || !ensure()) return;
      const t0 = now();
      const mel = [[0, 0.12], [4, 0.12], [7, 0.12], [12, 0.3], [7, 0.12], [12, 0.5]];
      let t = 0;
      mel.forEach(([s, d]) => { tone(N(12 + s), t0 + t, d * 0.95, { type: 'square', vol: 0.12 }); tone(N(s), t0 + t, d * 0.95, { type: 'triangle', vol: 0.12 }); t += d; });
    },
    badge() {
      if (!enabled || !ensure()) return;
      const t0 = now();
      [12, 16, 19, 24, 28, 31].forEach((s, i) => tone(N(s), t0 + i * 0.05, 0.3, { type: 'triangle', vol: 0.1 }));
    },
    // Ansager im Chiptune-Stil: Silben als Blips
    announce(text, pitch) {
      if (!enabled || !ensure()) return;
      const t0 = now();
      const syl = Math.min(8, Math.max(2, Math.round(text.replace(/[^a-zäöü]/gi, '').length / 2.5)));
      const base = pitch || 300;
      for (let i = 0; i < syl; i++) {
        const f = base * (1 + 0.25 * Math.sin(i * 1.7)) * (i === syl - 1 ? 1.3 : 1);
        tone(f, t0 + i * 0.075, 0.06, { type: 'square', vol: 0.07 });
      }
    },
    // Herzschlag – rate in Schlägen/Minute (0 = aus)
    heartbeat(bpm) {
      if (bpm && heartTimer && enabled) { heartRate = bpm; return; }
      heartRate = bpm;
      if (heartTimer) { clearTimeout(heartTimer); heartTimer = null; }
      if (!bpm || !enabled) return;
      const beat = () => {
        if (!heartRate || !enabled || !ensure()) return;
        const t0 = now();
        tone(60, t0, 0.12, { type: 'sine', to: 40, vol: 0.35 });
        tone(55, t0 + 0.16, 0.14, { type: 'sine', to: 35, vol: 0.25 });
        heartTimer = setTimeout(beat, 60000 / heartRate);
      };
      beat();
    },
  };
  window.SFX = S;
})();
