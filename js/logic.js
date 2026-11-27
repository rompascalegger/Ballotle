/* Ballotle – reine Spiellogik (kein DOM). Läuft im Browser und in Node (für Tests/Balancing). */
(function (root) {
  'use strict';

  // ---------- Balancing ----------
  const CFG = {
    startPot: 10,
    rounds: 3,
    proBonus: 0.25,
    // Grundmischung (20 Kugeln, davon wird 1 Gold durch die Sonderkugel des Tages ersetzt).
    // Siehe README "Balancing": Mit der Konzept-Mischung 14/3/2/1 wäre Weiterziehen laut
    // Erwartungswert fast immer richtig (St.-Petersburg-Effekt) und die Mathe-Linie würde
    // in ~90 % der Runden busten. Mit dieser Mischung + Gier-Regel stoppt sie meist bei x4–x8.
    baseMix: { G: 7, S: 10, B: 2, R: 1, I: 0, L: 0, F: 0 },
    greed: 2, // Gier-Regel: jede goldene Kugel lässt so viele schwarze nachfallen
    specialsPerDay: 1, // zufällige Sonderkugel(n) aus I/L/F, ersetzt Gold
    goldMult: 2,
    silverBonus: 5,
    epoch: '2026-11-27', // Ballotle #1
  };

  const TYPES = ['G', 'S', 'B', 'R', 'I', 'L', 'F'];
  const BALL = {
    G: { name: 'Gold', emoji: '🟡', desc: 'Verdoppelt den Topf' },
    S: { name: 'Silber', emoji: '⚪', desc: '+5 Chips' },
    B: { name: 'Schwarz', emoji: '⚫', desc: 'Bust – der Topf ist weg' },
    R: { name: 'Regenbogen', emoji: '🌈', desc: 'Schild gegen die nächste schwarze Kugel' },
    I: { name: 'Eis', emoji: '🧊', desc: 'Friert die Hälfte des Topfs sicher ein' },
    L: { name: 'Blitz', emoji: '⚡', desc: 'Zieht sofort zwei weitere Kugeln' },
    F: { name: 'Nebel', emoji: '🌫️', desc: 'Vernebelt die halbe Urne' },
  };

  const MODIFIERS = [
    { id: 'classic', name: 'Klassische Urne', icon: '🎩', desc: 'Keine Tricks. Nur du, die Urne und dein Bauchgefühl.' },
    { id: 'fog', name: 'Nebel-Urne', icon: '🌫️', desc: 'Die halbe Urne liegt im Nebel. Du siehst nicht alle Kugeln.', fogStart: true },
    { id: 'double', name: 'Schwarz zählt doppelt', icon: '☠️', desc: 'Doppelt so viele schwarze Kugeln. Dafür fällt pro Gold nur eine nach, und Silber gibt +10.', mix: { B: '*2' }, greed: 1, silverBonus: 10 },
    { id: 'storm', name: 'Gewitter-Urne', icon: '⚡', desc: 'Zwei Blitzkugeln mehr: Jede zieht sofort zwei Kugeln.', mix: { L: '+2' } },
    { id: 'ice', name: 'Eiszeit', icon: '🧊', desc: 'Zwei Eiskugeln mehr. Sichere die Hälfte deines Topfs.', mix: { I: '+2' } },
    { id: 'silver', name: 'Silberregen', icon: '🥈', desc: 'Silber bringt +10 statt +5, und es gibt mehr davon.', mix: { S: '+1' }, silverBonus: 10 },
    { id: 'rainbow', name: 'Regenbogen-Tag', icon: '🌈', desc: 'Zwei Regenbogen-Schilde mehr in der Urne.', mix: { R: '+2', B: '+1' } },
    { id: 'goldrush', name: 'Goldrausch', icon: '💰', desc: 'Drei Goldkugeln mehr – aber jede lässt drei schwarze nachfallen.', mix: { G: '+3', S: '-1' }, greed: 3 },
  ];

  // ---------- RNG ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rngFor(key) { return mulberry32(hashStr('ballotle|' + key)); }

  // ---------- Datum ----------
  function dateKey(d) {
    d = d || new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(k, n) { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); }
  function dayNumber(k) {
    const a = parseKey(CFG.epoch), b = parseKey(k);
    return Math.round((b - a) / 86400000) + 1;
  }

  // ---------- Tages-Urne ----------
  function rawModIndex(key) {
    if (dayNumber(key) === 1) return 0;
    return Math.floor(rngFor('mod|' + key)() * MODIFIERS.length);
  }
  // Vom Starttag aus vorwärts: nie zweimal derselbe Modifikator hintereinander
  const modCache = {};
  function modIndex(key) {
    if (modCache[key] != null) return modCache[key];
    const n = dayNumber(key);
    if (n < 1) return rawModIndex(key);
    let prev = -1, k = CFG.epoch;
    for (let i = 1; i <= n; i++) {
      let mi = rawModIndex(k);
      if (mi === prev) mi = (mi + 1) % MODIFIERS.length;
      modCache[k] = mi; prev = mi; k = addDays(k, 1);
    }
    return modCache[key];
  }
  function dailySetup(key) {
    const rng = rngFor('day|' + key);
    const num = dayNumber(key);
    // Tag 1 ist immer klassisch, danach seeded – nie zweimal derselbe Modifikator hintereinander
    rng(); // Zufallsfolge stabil halten
    const mod = MODIFIERS[modIndex(key)];
    const mix = Object.assign({}, CFG.baseMix);
    // leichte Variation der Grundmischung
    const v = rng();
    if (v < 0.25) { mix.G += 1; mix.S -= 1; }
    else if (v < 0.5) { mix.S += 1; mix.G -= 1; }
    // Sonderkugel(n)
    const specials = ['I', 'L', 'F'];
    for (let i = 0; i < CFG.specialsPerDay; i++) {
      const t = specials[Math.floor(rng() * specials.length)];
      mix[t] += 1; mix.G -= 1;
    }
    if (mod.mix) {
      for (const t in mod.mix) {
        const op = mod.mix[t];
        const n = Number(op.slice(1));
        if (op[0] === '+') mix[t] += n; else if (op[0] === '-') mix[t] = Math.max(0, mix[t] - n); else if (op[0] === '*') mix[t] *= n;
      }
    }
    return {
      key, num, mod, mix,
      goldMult: mod.goldMult || CFG.goldMult,
      greed: mod.greed != null ? mod.greed : CFG.greed,
      silverBonus: mod.silverBonus || CFG.silverBonus,
      fogStart: !!mod.fogStart,
    };
  }

  function total(c) { let n = 0; for (const t of TYPES) n += c[t] || 0; return n; }

  // Feste Zufallsfolge für (Datum, Runde): Ziehung k nutzt immer u[k].
  // Da sich die Urne nur durch vorherige Ziehungen ändert, erleben alle exakt dieselben Kugeln.
  function roundRng(setup, round) {
    const rng = rngFor('round|' + setup.key + '|' + round);
    const u = [];
    for (let i = 0; i < 200; i++) u.push(rng());
    return u;
  }
  function pickBall(counts, u) {
    const n = total(counts);
    let x = u * n;
    for (const t of TYPES) { const k = counts[t] || 0; if (x < k) return t; x -= k; }
    for (let i = TYPES.length - 1; i >= 0; i--) if (counts[TYPES[i]]) return TYPES[i];
    return null;
  }

  // ---------- Zustand & Regeln ----------
  function newState(setup) {
    return { pot: CFG.startPot, floor: 0, shields: 0, fog: setup.fogStart, bust: false };
  }
  function cloneCounts(c) { const o = {}; for (const t of TYPES) o[t] = c[t] || 0; return o; }

  // Wendet eine Kugel an. Gibt neuen Zustand + Ereignis zurück. (Blitz-Folgeziehungen steuert der Aufrufer.)
  function applyBall(st, t, setup) {
    const s = { pot: st.pot, floor: st.floor, shields: st.shields, fog: st.fog, bust: false };
    let ev = t;
    switch (t) {
      case 'G': s.pot = s.pot * setup.goldMult; break;
      case 'S': s.pot = s.pot + setup.silverBonus; break;
      case 'B':
        if (s.shields > 0) { s.shields -= 1; ev = 'Bshield'; }
        else { s.bust = true; s.pot = s.floor; }
        break;
      case 'R': s.shields += 1; break;
      case 'I': s.floor = Math.max(s.floor, Math.floor(s.pot / 2)); break;
      case 'L': break;
      case 'F': s.fog = true; break;
    }
    return { s, ev };
  }

  // Nimmt Kugel t aus der Urne (Gier-Regel: Gold lässt schwarze nachfallen). Gibt Anzahl nachgefallener zurück.
  function takeBall(counts, t, setup) {
    counts[t]--;
    if (t === 'G' && setup.greed) { counts.B += setup.greed; return setup.greed; }
    return 0;
  }
  function untakeBall(counts, t, added) { counts[t]++; counts.B -= added; }

  // Exakter Erwartungswert: Wert nach `forced` erzwungenen Ziehungen (dann einkassieren)
  // Rückgabe { ev: erwarteter Endtopf, pBust }
  function expect(counts, st, forced, setup) {
    const n = total(counts);
    if (forced <= 0 || n === 0) return { ev: st.pot, pBust: 0 };
    let ev = 0, pBust = 0;
    for (const t of TYPES) {
      const k = counts[t];
      if (!k) continue;
      const p = k / n;
      const r = applyBall(st, t, setup);
      if (r.s.bust) { ev += p * r.s.pot; pBust += p; continue; }
      const added = takeBall(counts, t, setup);
      const sub = expect(counts, r.s, forced - 1 + (t === 'L' ? 2 : 0), setup);
      untakeBall(counts, t, added);
      ev += p * sub.ev; pBust += p * sub.pBust;
    }
    return { ev, pBust };
  }

  // Analyse der nächsten Ziehung
  function analyze(counts, st, setup) {
    const c = cloneCounts(counts);
    if (total(c) === 0) return { ev: 0, gain: 0, pBust: 0, empty: true };
    const r = expect(c, st, 1, setup);
    return { ev: r.ev, gain: r.ev - st.pot, pBust: r.pBust, empty: false };
  }

  // Eine Aktion "Ziehen" (inkl. Blitz-Folgeziehungen). Mutiert counts, gibt {st, balls, idx}.
  function drawAction(setup, u, idx, counts, st) {
    let forced = 1; const balls = [];
    while (forced > 0 && total(counts) > 0) {
      const t = pickBall(counts, u[idx++]); forced--;
      const r = applyBall(st, t, setup); st = r.s;
      const added = takeBall(counts, t, setup);
      balls.push({ t, ev: r.ev, added, pot: st.pot, shields: st.shields, floor: st.floor });
      if (st.bust) break;
      if (t === 'L') forced += 2;
    }
    return { st, balls, idx };
  }

  // Spielt eine Runde mit Strategie strat(step, counts, st, analysis) -> true=ziehen
  // Startzustand optional (für die Glücks-Linie ab dem Einkassier-Punkt)
  function simulate(setup, u, strat, from) {
    let counts = cloneCounts(from ? from.counts : setup.mix);
    let st = from ? Object.assign({}, from.st) : newState(setup);
    let idx = from ? from.idx : 0;
    const steps = [];
    while (total(counts) > 0) {
      const a = analyze(counts, st, setup);
      if (!strat(steps.length, counts, st, a)) break;
      const r = drawAction(setup, u, idx, counts, st);
      st = r.st; idx = r.idx;
      steps.push({ balls: r.balls, pot: st.pot, bust: st.bust, gain: a.gain, pBust: a.pBust, shields: st.shields, floor: st.floor });
      if (st.bust) break;
    }
    return { steps, final: st.pot, bust: st.bust, idx, counts, st };
  }

  // Nebel: deterministisch die Hälfte der Restkugeln verstecken
  function fogSplit(counts, key) {
    const arr = [];
    for (const t of TYPES) for (let i = 0; i < (counts[t] || 0); i++) arr.push(t);
    const rng = rngFor('fog|' + key);
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = arr[i]; arr[i] = arr[j]; arr[j] = x; }
    const hidden = cloneCounts({}), visible = cloneCounts({});
    const h = Math.floor(arr.length / 2);
    arr.forEach((t, i) => { if (i < h) hidden[t]++; else visible[t]++; });
    return { hidden, visible, hiddenTotal: h };
  }

  const mathStrategy = (idx, c, st, a) => !a.empty && a.gain > 1e-9;
  const alwaysDraw = () => true;

  function fmtMult(pot) {
    const m = pot / CFG.startPot;
    if (m === 0) return 'x0';
    return 'x' + (Number.isInteger(m) ? String(m) : String(Math.round(m * 10) / 10));
  }

  const api = {
    CFG, TYPES, BALL, MODIFIERS, mulberry32, hashStr, rngFor, dateKey, addDays, dayNumber, parseKey,
    dailySetup, roundRng, pickBall, newState, applyBall, takeBall, expect, analyze, drawAction, simulate, mathStrategy, alwaysDraw,
    cloneCounts, total, fmtMult, fogSplit,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BL = api;
})(typeof window !== 'undefined' ? window : globalThis);
