/* Ballotle – Spielablauf, UI, Speicherstand. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmt = (n) => Math.round(n).toLocaleString('de-CH');
  const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const sign = (n) => (n >= 0 ? '+' : '−') + fmt1(Math.abs(n));
  const pct = (p) => Math.round(p * 100) + ' %';

  // ---------- Datum / Debug ----------
  const params = new URLSearchParams(location.search);
  const DEBUG_DATE = params.get('date');
  const TODAY = DEBUG_DATE || BL.dateKey();
  const KEY = 'ballotle.v1' + (DEBUG_DATE ? '.debug' : '');
  const setup = BL.dailySetup(TODAY);

  // ---------- Speicherstand ----------
  function defaults() {
    return {
      chips: 0, days: {}, badges: {},
      stats: { rounds: 0, busts: 0, cashes: 0, decisions: 0, correct: 0, mathPerfect: 0, x32: 0, luckySaves: 0, cashMultSum: 0, bestPot: 0, bestDay: 0, shieldSaves: 0 },
      owned: { skin: ['glanz'], urn: ['glas'] }, equip: { skin: 'glanz', urn: 'glas' },
      settings: { sound: true, pro: false, seenHelp: false },
      streak: { days: 0, last: null }, noBust: { days: 0, last: null },
    };
  }
  function load() {
    try {
      const d = defaults(), s = JSON.parse(localStorage.getItem(KEY)) || {};
      for (const k in d) if (s[k] !== undefined) d[k] = typeof d[k] === 'object' && !Array.isArray(d[k]) ? Object.assign(d[k], s[k]) : s[k];
      return d;
    } catch (e) { return defaults(); }
  }
  let save = load();
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* voll/privat */ } };
  function dayRec() {
    if (!save.days[TODAY]) save.days[TODAY] = { rounds: [], score: 0, done: false };
    return save.days[TODAY];
  }

  // ---------- Inhalte ----------
  const BADGES = [
    { id: 'first', icon: '🎱', name: 'Erste Kugel', desc: 'Deine erste Ziehung.' },
    { id: 'math', icon: '🎓', name: 'Mathe-perfekt', desc: 'Genau am optimalen Punkt gestoppt.' },
    { id: 'brave', icon: '🦁', name: 'Mutprobe', desc: 'x32 im Topf erreicht.' },
    { id: 'jackpot', icon: '💎', name: 'Jackpot', desc: 'x100 im Topf erreicht.' },
    { id: 'saved', icon: '🌈', name: 'Regenbogen-Retter', desc: 'Ein Schild hat eine schwarze Kugel geschluckt.' },
    { id: 'icecold', icon: '🧊', name: 'Eiskalt', desc: 'Eis hat bei einem Bust Chips gerettet.' },
    { id: 'hattrick', icon: '🎩', name: 'Hattrick', desc: 'Alle 3 Runden eines Tages eingekassiert.' },
    { id: 'pro', icon: '🧠', name: 'Profi', desc: 'Einen ganzen Tag im Profi-Modus gespielt.' },
    { id: 'beatmath', icon: '🏅', name: 'Besser als Mathe', desc: 'Tageswertung über der Mathematikerin.' },
    { id: 'streak3', icon: '🔥', name: 'Stammgast', desc: '3 Tage in Folge gespielt.' },
    { id: 'nobust7', icon: '🛡️', name: 'Nie gebustet', desc: '7 Tage in Folge ohne Bust.' },
  ];
  const SKINS = [
    { id: 'glanz', name: 'Glanz', cost: 0, desc: 'Klassische Lotteriekugeln.' },
    { id: 'pixel', name: 'Pixel', cost: 250, desc: 'Chiptune-Kugeln im 8-Bit-Look.' },
    { id: 'juwel', name: 'Juwel', cost: 750, desc: 'Geschliffene Edelsteine.' },
  ];
  const URNS = [
    { id: 'glas', name: 'Glasurne', cost: 0, desc: 'Klares Glas, goldener Rahmen.' },
    { id: 'messing', name: 'Messing', cost: 400, desc: 'Genieteter Messingring, warmes Glas.' },
    { id: 'mitternacht', name: 'Mitternacht', cost: 1000, desc: 'Neon-Ring, dunkles Glas.' },
  ];
  const BALL_LABEL = { G: 'GOLD ×2', S: 'SILBER +5', B: 'SCHWARZ', R: 'REGENBOGEN', I: 'EIS', L: 'BLITZ', F: 'NEBEL' };
  const GOLD_WORDS = { 2: 'DOPPELT!', 4: 'VIERFACH!', 8: 'ACHTFACH!', 16: 'SECHZEHNFACH!', 32: 'MUTPROBE!', 64: 'WAHNSINN!', 128: 'LEGENDÄR!' };

  function title() {
    const s = save.stats;
    if (save.chips >= 10000) return 'Urnen-Legende';
    if (s.mathPerfect >= 5) return 'Mathe-Genie';
    if (s.decisions >= 15 && s.correct / s.decisions >= 0.85) return 'Eiskalter Rechner';
    if (s.x32 >= 3) return 'Draufgänger';
    if (s.luckySaves >= 5) return 'Glückspilz';
    if (s.cashes >= 6 && s.cashMultSum / s.cashes < 3) return 'Vorsichtige Seele';
    if (s.rounds >= 9) return 'Stammspieler';
    return 'Neuling';
  }

  // ---------- Urne ----------
  const urn = new Urn($('urn'));
  urn.setSkin(save.equip.skin); urn.setTheme(save.equip.urn);
  SFX.enabled = save.settings.sound;

  // ---------- Runde ----------
  let R = null;      // laufende Runde
  let busy = false;  // Animation läuft

  function roundIndex() { return dayRec().rounds.filter((r) => r.end).length; }

  function makeRound(i) {
    const rec = dayRec().rounds[i] || (dayRec().rounds[i] = { actions: 0, pro: save.settings.pro, end: null, balls: [], decisions: [] });
    const u = BL.roundRng(setup, i + 1);
    const r = { i, rec, u, uIdx: 0, counts: BL.cloneCounts(setup.mix), st: BL.newState(setup), balls: [], goldStreak: 0, maxPot: BL.CFG.startPot };
    // deterministisch nachspielen (Reload mitten in der Runde)
    for (let k = 0; k < rec.actions; k++) {
      const res = BL.drawAction(setup, u, r.uIdx, r.counts, r.st);
      r.st = res.st; r.uIdx = res.idx; res.balls.forEach((b) => r.balls.push(b.ev));
      r.maxPot = Math.max(r.maxPot, ...res.balls.map((b) => b.pot));
    }
    return r;
  }

  function fogInfo() {
    if (!R || !R.st.fog) return null;
    return BL.fogSplit(R.counts, TODAY + '|' + R.i + '|' + R.uIdx);
  }

  function startRound(i, fresh) {
    busy = false;
    R = makeRound(i);
    urn.cup = null;
    $('potBox').classList.remove('busted', 'cashed');
    urn.setBalls(R.counts);
    const f = fogInfo(); urn.setFog(f ? f.hidden : null);
    $('tray').innerHTML = '';
    R.balls.forEach((t) => addTray(t, false));
    $('proToggle').checked = R.rec.pro;
    renderAll();
    if (fresh) {
      announce('RUNDE ' + (i + 1), 'round');
      SFX.announce('Runde ' + (i + 1), 260);
    }
  }

  // ---------- Rendering ----------
  function renderRounds() {
    const d = dayRec();
    const el = $('rounds'); el.innerHTML = '';
    for (let i = 0; i < BL.CFG.rounds; i++) {
      const r = d.rounds[i];
      const pip = document.createElement('div');
      pip.className = 'pip';
      if (R && R.i === i && !(r && r.end)) pip.classList.add('cur');
      if (r && r.end) {
        pip.classList.add(r.end);
        pip.innerHTML = '<span>' + (r.end === 'bust' ? '💥' : BL.fmtMult(r.pot)) + '</span>';
      } else pip.innerHTML = '<span>' + (i + 1) + '</span>';
      el.appendChild(pip);
    }
  }

  function renderCounts() {
    const el = $('counts'); el.innerHTML = '';
    const f = fogInfo();
    const show = f ? f.visible : R ? R.counts : setup.mix;
    for (const t of BL.TYPES) {
      const n = show[t] || 0;
      const total0 = (R ? R.counts[t] : setup.mix[t]) || 0;
      if (!total0 && !setup.mix[t]) continue;
      const c = document.createElement('div');
      c.className = 'cnt' + (n === 0 ? ' zero' : '');
      c.dataset.t = t;
      c.title = BL.BALL[t].name + ': ' + BL.BALL[t].desc;
      c.innerHTML = `<i class="mini" style="background:${ballCSS(t)}"></i><b>${n}</b>`;
      el.appendChild(c);
    }
    if (f) {
      const c = document.createElement('div');
      c.className = 'cnt fogc'; c.title = 'Kugeln im Nebel';
      c.innerHTML = `<i class="mini" style="background:${ballCSS('H')}"></i><b>${f.hiddenTotal}</b>`;
      el.appendChild(c);
    }
  }

  let shownPot = BL.CFG.startPot;
  // vis: Zwischenstand während einer Animation (Topf wird separat hochgezählt)
  function renderHud(vis) {
    const st = vis || (R ? R.st : BL.newState(setup));
    if (!vis) { $('pot').textContent = fmt(st.pot); shownPot = st.pot; }
    $('mult').textContent = BL.fmtMult(st.pot);
    const extra = [];
    if (st.shields) extra.push(`<span class="tag shield" title="Schild gegen die nächste schwarze Kugel">🌈 Schild${st.shields > 1 ? ' ×' + st.shields : ''}</span>`);
    if (st.floor) extra.push(`<span class="tag ice" title="Dieser Teil ist sicher, auch bei Bust">🧊 ${fmt(st.floor)} sicher</span>`);
    $('potExtra').innerHTML = extra.join('');
    $('potBox').classList.toggle('frost', st.floor > 0);
    const m = st.pot / BL.CFG.startPot;
    document.body.style.setProperty('--heat', Math.min(1, Math.log2(Math.max(1, m)) / 5).toFixed(3));

    const done = !R || R.rec.end;
    const pro = R ? R.rec.pro : save.settings.pro;
    $('helpBox').classList.toggle('hidden-pro', pro);
    let a = null;
    if (busy && R && !done) {
      // während der Animation: Anzeige einfrieren, damit das Risiko danach sichtbar springt
    } else if (R && !done) {
      const f = fogInfo();
      a = BL.analyze(f ? f.visible : R.counts, R.st, setup);
      const real = f ? BL.analyze(R.counts, R.st, setup) : a;
      R.analysis = real;
      $('riskVal').textContent = (f ? '≈ ' : '') + pct(a.pBust);
      $('riskFill').style.width = Math.min(100, a.pBust * 100 * 1.6) + '%';
      $('riskFill').style.background = a.pBust < 0.15 ? 'var(--ok)' : a.pBust < 0.3 ? 'var(--warn)' : 'var(--bad)';
      const ev = $('evLine');
      ev.innerHTML = `Erwartungswert: <b>${f ? '≈ ' : ''}${sign(a.gain)} Chips</b>`;
      ev.title = 'Erwarteter Gewinn, wenn du jetzt ziehst' + (f ? ' (Schätzung: Nebel verdeckt die halbe Urne)' : '');
      ev.className = 'ev ' + (a.gain > 0 ? 'pos' : 'neg');
      document.body.style.setProperty('--risk', Math.min(1, real.pBust * 2.2).toFixed(3));
      // Herzschlag, wenn viel auf dem Spiel steht
      SFX.heartbeat(!busy && st.pot >= 40 ? Math.round(62 + 90 * Math.min(1, real.pBust * 2.5)) : 0);
    } else {
      document.body.style.setProperty('--risk', 0);
      SFX.heartbeat(0);
    }
    $('cashAmt').textContent = fmt(st.pot * (pro ? 1 + BL.CFG.proBonus : 1));
    $('btnDraw').disabled = busy || done;
    $('btnCash').disabled = busy || done || !R || R.rec.actions === 0;
    $('proToggle').disabled = busy || done || (R && R.rec.actions > 0);
    $('proWrap').classList.toggle('locked', $('proToggle').disabled);
    const left = R ? BL.total(R.counts) : 0;
    $('btnDraw').querySelector('small').textContent = done ? '' : (pro || !a ? left + ' Kugeln' : 'Risiko ' + pct(a.pBust));
  }

  function renderHeader() {
    $('dayNo').textContent = '#' + setup.num;
    const d = BL.parseKey(TODAY);
    $('dateLbl').textContent = d.toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'short' });
    $('modIc').textContent = setup.mod.icon;
    $('modName').textContent = 'Heute: ' + setup.mod.name;
    $('modDesc').textContent = setup.mod.desc;
    $('chips').textContent = fmt(save.chips);
    $('title').textContent = title();
    $('btnSound').textContent = save.settings.sound ? '🔊' : '🔇';
    $('streak').textContent = save.streak.days > 1 && save.streak.last >= BL.addDays(TODAY, -1) ? '🔥 ' + save.streak.days : '';
  }

  function renderAll() { renderHeader(); renderRounds(); renderCounts(); renderHud(); }

  function addTray(ev, animate) {
    const b = document.createElement('i');
    const t = ev === 'Bshield' ? 'B' : ev;
    b.className = 'tb' + (animate ? ' pop' : '') + (ev === 'Bshield' ? ' shielded' : '');
    b.style.background = ballCSS(t);
    b.title = BL.BALL[t].name;
    $('tray').appendChild(b);
    $('tray').scrollLeft = 1e6;
  }

  function animatePot(to, ms) {
    const from = shownPot; shownPot = to;
    const el = $('pot');
    const box = $('potBox');
    box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
    const t0 = performance.now(); let lastTick = 0;
    return new Promise((res) => {
      const step = (t) => {
        const p = Math.min(1, (t - t0) / ms);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(from + (to - from) * e);
        if (t - lastTick > 45 && p < 1) { SFX.tick(p); lastTick = t; }
        if (p < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }

  function animateChips(to, ms) {
    const el = $('chips');
    const from = Number(el.dataset.v || save.chips);
    el.dataset.v = to;
    const t0 = performance.now();
    const box = $('acct'); box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - p, 2)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  let annTimer = null;
  function announce(text, cls) {
    const el = $('announce');
    el.className = 'announce';
    el.textContent = text;
    void el.offsetWidth;
    el.className = 'announce show ' + (cls || '');
    clearTimeout(annTimer);
    annTimer = setTimeout(() => (el.className = 'announce'), 1300);
  }

  function reveal(t, label) {
    const el = $('reveal');
    el.innerHTML = `<i style="background:${ballCSS(t)}"></i><span>${label}</span>`;
    el.className = 'reveal t' + t;
    void el.offsetWidth;
    el.className = 'reveal show t' + t;
    setTimeout(() => (el.className = 'reveal t' + t), 900);
  }

  // ---------- Aktionen ----------
  async function onDraw() {
    if (busy || !R || R.rec.end) return;
    SFX.unlock();
    const a = BL.analyze(R.counts, R.st, setup);
    R.rec.decisions.push({ act: 'draw', gain: a.gain });
    if (R.rec.actions === 0) { R.rec.pro = $('proToggle').checked; }
    const prevSt = R.st;
    const res = BL.drawAction(setup, R.u, R.uIdx, R.counts, R.st);
    R.st = res.st; R.uIdx = res.idx; R.rec.actions++;
    res.balls.forEach((b) => R.balls.push(b.ev));
    if (R.st.bust) { R.rec.end = 'bust'; R.rec.pot = 0; }
    persist(); // erst speichern, dann animieren
    if (!save.badges.first) unlock('first');

    busy = true; renderHud(prevSt);
    SFX.heartbeat(0);
    urn.clearCup();
    let st = prevSt;
    for (let k = 0; k < res.balls.length; k++) {
      const b = res.balls[k];
      const chained = k > 0;
      const roll = chained ? 280 : 420;
      SFX.drumroll(roll);
      urn.spin(roll, chained ? 1.3 : 1);
      await wait(roll * 0.55);
      // Beinahe-Moment: die schwarze Kugel klappert am Ausgang
      const blacks = urn.freeOf('B').length;
      if (b.t !== 'B' && blacks > 0 && !chained && Math.random() < 0.06 + a.pBust * 0.8) {
        await wait(roll * 0.3);
        const p = urn.fakeOut('B'); SFX.rattle(); await p;
        await wait(60);
        b.nearMiss = true;
      } else await wait(roll * 0.45);
      await urn.eject(b.t);
      SFX.pop();
      st = await resolveBall(b, st);
      if (k < res.balls.length - 1) await wait(180);
    }
    const f = fogInfo(); urn.setFog(f ? f.hidden : null);
    urn.syncTo(R.counts);
    busy = false;
    if (R.st.bust) { await bustSequence(); return; }
    if (BL.total(R.counts) === 0) { await wait(300); return onCash(true); }
    renderAll();
  }

  async function resolveBall(b, prev) {
    const potEl = $('potBox');
    const pc = FX.centerOf(potEl);
    const uc = FX.centerOf($('urn'));
    const ub = $('urn').getBoundingClientRect();
    const cup = { x: ub.left + ub.width / 2, y: ub.top + ub.height * (URN_GEOM.CUP_Y / URN_GEOM.H) };
    addTray(b.ev, true);
    const next = { pot: b.pot };
    switch (b.ev) {
      case 'G': {
        R.goldStreak++;
        const m = b.pot / BL.CFG.startPot;
        const word = GOLD_WORDS[m] || (m > 128 ? 'LEGENDÄR!' : 'GOLD!');
        reveal('G', BL.fmtMult(b.pot));
        $('mult').textContent = BL.fmtMult(b.pot);
        SFX.gold(R.goldStreak);
        FX.burst(cup.x, cup.y, '#f5c518', 40, 600);
        FX.coins(pc.x, pc.y, Math.min(40, 8 + R.goldStreak * 6));
        FX.flash('rgba(255,210,60,.35)');
        urn.doFlash('255,220,90', 0.8);
        announce(word, 'gold');
        if (m >= 8) FX.shake(0.5);
        await animatePot(b.pot, 520);
        if (b.added) await greed(b.added);
        break;
      }
      case 'S':
        reveal('S', '+' + setup.silverBonus);
        SFX.silver();
        FX.burst(cup.x, cup.y, '#e8edf2', 22, 380);
        FX.float('+' + setup.silverBonus, pc.x, pc.y - 30, 'silver');
        $('mult').textContent = BL.fmtMult(b.pot);
        await animatePot(b.pot, 300);
        break;
      case 'R':
        reveal('R', 'SCHILD!');
        SFX.rainbow();
        FX.rainbow(cup.x, cup.y, 48);
        announce('SCHILD!', 'rainbow');
        break;
      case 'I':
        reveal('I', 'EIS!');
        SFX.ice();
        FX.snow(pc.x, pc.y, 50);
        announce('EINGEFROREN!', 'ice');
        FX.float('🧊 ' + fmt(Math.floor(prev.pot / 2)) + ' sicher', pc.x, pc.y - 30, 'ice');
        break;
      case 'L':
        reveal('L', 'BLITZ!');
        SFX.lightning();
        FX.flash('rgba(255,255,255,.8)');
        FX.shake(1.2);
        urn.doFlash('255,255,255', 1);
        announce('BLITZ! 2 KUGELN!', 'bolt');
        await wait(350);
        break;
      case 'F':
        reveal('F', 'NEBEL!');
        SFX.fog();
        announce('NEBEL!', 'fog');
        break;
      case 'Bshield':
        reveal('B', 'GERETTET!');
        SFX.shield();
        FX.shards(cup.x, cup.y, 26);
        FX.rainbow(pc.x, pc.y, 30);
        FX.shake(0.8);
        announce('GERETTET!', 'rainbow');
        if (!save.badges.saved) unlock('saved');
        save.stats.shieldSaves++;
        break;
      case 'B':
        reveal('B', 'SCHWARZ');
        break;
    }
    if (b.nearMiss && b.ev !== 'B') setTimeout(() => FX.float('Puh – knapp!', uc.x, uc.y - 40, 'near'), 300);
    if (b.pot > R.maxPot) R.maxPot = b.pot;
    if (R.maxPot >= 320 && !R.rec.hit32) { R.rec.hit32 = true; save.stats.x32++; if (!save.badges.brave) unlock('brave'); }
    if (R.maxPot >= 1000 && !save.badges.jackpot) unlock('jackpot');
    renderHud({ pot: b.pot, shields: b.shields, floor: b.floor }); renderCounts();
    $('mult').classList.remove('bump'); void $('mult').offsetWidth; $('mult').classList.add('bump');
    return next;
  }

  let greedShown = false;
  async function greed(n) {
    if (!greedShown) { greedShown = true; setTimeout(() => announce('DIE URNE WIRD GIERIG…', 'greed'), 150); }
    const ub = $('urn').getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      urn.dropIn('B', 0);
      setTimeout(() => SFX.plonk(i), 300);
      FX.float('+⚫', ub.left + ub.width / 2 + (i - (n - 1) / 2) * 34, ub.top + 8, 'greed');
      await wait(200);
    }
    renderCounts();
    document.querySelectorAll('.cnt[data-t="B"]').forEach((e) => { e.classList.remove('alarm'); void e.offsetWidth; e.classList.add('alarm'); });
    await wait(200);
  }

  async function bustSequence() {
    busy = true;
    const pc = FX.centerOf($('potBox'));
    SFX.black();
    FX.flash('rgba(230,20,40,.6)');
    FX.shake(2.6);
    FX.shards(pc.x, pc.y, 60);
    urn.doFlash('255,30,30', 1);
    $('potBox').classList.add('busted');
    announce('BUST!', 'bust');
    if (navigator.vibrate) navigator.vibrate([80, 40, 160]);
    await wait(900);
    if (R.st.pot > 0) {
      FX.float('🧊 ' + fmt(R.st.pot) + ' gerettet', pc.x, pc.y - 20, 'ice');
      if (!save.badges.icecold) unlock('icecold');
    }
    $('pot').textContent = fmt(R.st.pot);
    await endRound('bust');
  }

  async function onCash(auto) {
    if ((busy && !auto) || !R || R.rec.end || R.rec.actions === 0) return;
    SFX.unlock();
    const a = BL.analyze(R.counts, R.st, setup);
    R.rec.decisions.push({ act: 'cash', gain: a.empty ? 0 : a.gain });
    R.rec.end = 'cash'; R.rec.pot = R.st.pot;
    persist();
    busy = true; renderHud();
    const m = R.st.pot / BL.CFG.startPot;
    const pc = FX.centerOf($('potBox'));
    const target = FX.centerOf($('acct'));
    SFX.cash(m >= 8);
    FX.coins(pc.x, pc.y, Math.min(70, 12 + Math.round(Math.log2(m + 1) * 10)), target);
    if (m >= 8) FX.confetti(Math.min(160, 40 + m * 3));
    announce(m >= 16 ? 'GROSSER FANG!' : 'EINGESACKT!', 'cash');
    SFX.announce('Eingesackt', 340);
    if (navigator.vibrate) navigator.vibrate(40);
    $('potBox').classList.add('cashed');
    await endRound('cash');
  }

  async function endRound(kind) {
    const rec = R.rec;
    const base = kind === 'bust' ? R.st.pot : R.st.pot;
    rec.end = kind; rec.pot = base;
    rec.score = Math.round(base * (rec.pro ? 1 + BL.CFG.proBonus : 1));
    rec.balls = R.balls.slice();
    // Mathe-Linie & Auswertung
    const math = BL.simulate(setup, R.u, BL.mathStrategy);
    rec.math = { n: math.steps.length, pot: math.final, bust: math.bust };
    rec.perfect = kind === 'cash' && rec.actions === math.steps.length && !math.bust;
    const correct = rec.decisions.filter((d) => (d.act === 'draw' ? d.gain > 1e-9 : d.gain <= 1e-9)).length;
    rec.correct = correct;
    // Statistik
    const s = save.stats;
    s.rounds++; s.decisions += rec.decisions.length; s.correct += correct;
    if (kind === 'bust') s.busts++; else { s.cashes++; s.cashMultSum += rec.pot / BL.CFG.startPot; }
    s.bestPot = Math.max(s.bestPot, R.maxPot);
    if (rec.perfect) { s.mathPerfect++; }
    let luck = null;
    if (kind === 'cash') {
      luck = BL.simulate(setup, R.u, BL.alwaysDraw, { counts: R.counts, st: R.st, idx: R.uIdx });
      if (luck.steps.length && luck.steps[0].bust) s.luckySaves++;
    }
    // Streak beim ersten Rundenende des Tages
    if (save.streak.last !== TODAY) {
      save.streak.days = save.streak.last === BL.addDays(TODAY, -1) ? save.streak.days + 1 : 1;
      save.streak.last = TODAY;
      if (save.streak.days >= 3 && !save.badges.streak3) unlock('streak3');
    }
    save.chips += rec.score;
    const d = dayRec();
    d.score = d.rounds.reduce((acc, r) => acc + (r.score || 0), 0);
    if (roundIndex() >= BL.CFG.rounds) finishDay();
    persist();
    if (rec.perfect && !save.badges.math) unlock('math');

    await wait(kind === 'cash' ? 500 : 200);
    animateChips(save.chips, 1100);
    renderRounds();
    $('title').textContent = title();
    await wait(kind === 'cash' ? 900 : 700);
    showRoundEval(R, math, luck);
  }

  function finishDay() {
    const d = dayRec();
    if (d.done) return;
    d.done = true;
    const busts = d.rounds.filter((r) => r.end === 'bust').length;
    if (!busts) {
      save.noBust.days = save.noBust.last === BL.addDays(TODAY, -1) ? save.noBust.days + 1 : 1;
      save.noBust.last = TODAY;
      if (save.noBust.days >= 7 && !save.badges.nobust7) unlock('nobust7');
      if (!save.badges.hattrick) unlock('hattrick');
    } else save.noBust.days = 0;
    if (d.rounds.every((r) => r.pro) && !save.badges.pro) unlock('pro');
    save.stats.bestDay = Math.max(save.stats.bestDay, d.score);
    const mathDay = d.rounds.reduce((a, r) => a + (r.math ? (r.math.bust ? 0 : r.math.pot) : 0), 0);
    d.mathScore = mathDay;
    if (d.score > mathDay && !save.badges.beatmath) unlock('beatmath');
  }

  // ---------- Abzeichen / Toasts ----------
  function unlock(id) {
    if (save.badges[id]) return;
    save.badges[id] = TODAY; persist();
    const b = BADGES.find((x) => x.id === id);
    if (!b) return;
    toast(`<span class="ti">${b.icon}</span><div><b>Abzeichen: ${b.name}</b><small>${b.desc}</small></div>`);
    setTimeout(() => SFX.badge(), 200);
  }
  function toast(html) {
    const el = document.createElement('div');
    el.className = 'toast'; el.innerHTML = html;
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3800);
  }

  // ---------- Modal ----------
  function openModal(html, cls) {
    $('modalCard').className = 'card ' + (cls || '');
    $('modalCard').innerHTML = html;
    $('modal').classList.remove('hidden');
    $('modalCard').scrollTop = 0;
  }
  function closeModal() { $('modal').classList.add('hidden'); }

  const ballsHTML = (list, cls) => list.map((ev) => {
    const t = ev === 'Bshield' ? 'B' : ev;
    return `<i class="mini ${cls || ''} ${ev === 'Bshield' ? 'shielded' : ''}" style="background:${ballCSS(t)}" title="${BL.BALL[t].name}"></i>`;
  }).join('');

  function chartSVG(player, math, luck) {
    // player/math/luck: Arrays von Topfwerten (Index = Aktion), bust = -1
    const all = [...player, ...math, ...(luck || [])].filter((v) => v > 0);
    const ymaxL = Math.max(2, ...all.map((v) => Math.log2(v / BL.CFG.startPot))) + 0.4;
    const n = Math.max(player.length, math.length, luck ? luck.length : 0) - 1;
    const W = 320, H = 150, L = 34, B = 18, T = 10;
    const X = (i) => L + (i / Math.max(1, n)) * (W - L - 10);
    const Y = (v) => v <= 0 ? H - B : T + (1 - (Math.log2(Math.max(v, 1) / BL.CFG.startPot) + 0.6) / (ymaxL + 0.6)) * (H - B - T - 14);
    const path = (arr, off) => arr.map((v, i) => (i ? 'L' : 'M') + X(i + (off || 0)).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ');
    let grid = '';
    for (let k = 0; k <= Math.floor(ymaxL); k++) {
      const v = BL.CFG.startPot * Math.pow(2, k);
      grid += `<line x1="${L}" x2="${W - 6}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${L - 4}" y="${Y(v) + 3}" class="gt">x${Math.pow(2, k)}</text>`;
    }
    grid += `<line x1="${L}" x2="${W - 6}" y1="${H - B}" y2="${H - B}" class="gl bustl"/><text x="${L - 4}" y="${H - B + 3}" class="gt">💥</text>`;
    const dots = (arr, cls, off) => arr.map((v, i) => `<circle cx="${X(i + (off || 0))}" cy="${Y(v)}" r="${v <= 0 ? 4.5 : 3}" class="${cls}${v <= 0 ? ' bd' : ''}"/>`).join('');
    const luckOff = luck ? player.length - 1 : 0;
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Verlauf: Du, Mathe-Linie, Glücks-Linie">
      ${grid}
      <path d="${path(math)}" class="ln math"/>${dots(math, 'dt math')}
      ${luck ? `<path d="${path(luck, luckOff)}" class="ln luck"/>${dots(luck.slice(1), 'dt luck', luckOff + 1)}` : ''}
      <path d="${path(player)}" class="ln you"/>${dots(player, 'dt you')}
    </svg>`;
  }

  function showRoundEval(r, math, luck) {
    const rec = r.rec;
    const start = BL.CFG.startPot;
    const pLine = [start];
    // Spielerverlauf nachbauen (Topf nach jeder Aktion)
    {
      let c = BL.cloneCounts(setup.mix), st = BL.newState(setup), idx = 0;
      for (let k = 0; k < rec.actions; k++) { const x = BL.drawAction(setup, r.u, idx, c, st); st = x.st; idx = x.idx; pLine.push(st.bust ? -1 : st.pot); }
    }
    const mLine = [start, ...math.steps.map((s) => (s.bust ? -1 : s.pot))];
    let lLine = null, luckBalls = [];
    if (luck) {
      const steps = luck.steps.slice(0, 8);
      lLine = [rec.pot, ...steps.map((s) => (s.bust ? -1 : s.pot))];
      steps.forEach((s) => s.balls.forEach((b) => luckBalls.push({ ev: b.ev, pot: s.bust ? -1 : b.pot })));
    }
    const mathN = math.steps.length;
    const n = rec.actions;
    let verdict = '', vcls = '';
    const mathPotTxt = math.bust ? 'gebustet' : 'bei ' + BL.fmtMult(math.final) + ' kassiert';
    if (rec.end === 'cash') {
      if (rec.perfect) { verdict = '<b>Mathe-perfekt!</b> Genau hier hätte auch die Mathematikerin gestoppt: Der Erwartungswert der nächsten Ziehung war negativ.'; vcls = 'good'; }
      else if (n < mathN) {
        const g = rec.decisions[rec.decisions.length - 1].gain;
        verdict = `<b>Mathematisch zu früh.</b> Weiterziehen hätte im Schnitt <b>${sign(g)} Chips</b> gebracht. Die Mathematikerin hätte weitergezogen und ${mathPotTxt}.`;
        vcls = 'meh';
      } else {
        verdict = `<b>Glück gehabt!</b> Du hast über den Mathe-Stopp hinaus gezogen (ab Ziehung ${mathN + 1} war der Erwartungswert negativ) und es ging gut. Die Mathematikerin hätte ${mathPotTxt}.`;
        vcls = 'lucky';
      }
    } else {
      if (n <= mathN) { verdict = '<b>Pech, kein Fehler.</b> Jede deiner Ziehungen hatte einen positiven Erwartungswert. Auch die Mathematikerin hätte gezogen und wäre hier gebustet.'; vcls = 'unlucky'; }
      else {
        const bad = rec.decisions[mathN];
        verdict = `<b>Fehler, nicht Pech.</b> Ab Ziehung ${mathN + 1} war der Erwartungswert negativ (${sign(bad ? bad.gain : 0)} Chips). Die Mathematikerin hätte ${mathPotTxt}.`;
        vcls = 'bad';
      }
    }
    const isLast = roundIndex() >= BL.CFG.rounds;
    const head = rec.end === 'cash'
      ? `<div class="ev-head cash"><span class="kicker">Runde ${r.i + 1} · Eingekassiert</span><div class="big">+${fmt(rec.score)}</div><small>${BL.fmtMult(rec.pot)}${rec.pro ? ' · Profi-Bonus +25 %' : ''}</small></div>`
      : `<div class="ev-head bust"><span class="kicker">Runde ${r.i + 1} · Bust</span><div class="big">💥 ${rec.score ? '+' + fmt(rec.score) : '0'}</div><small>${rec.score ? 'Das Eis hat ' + fmt(rec.pot) + ' Chips gerettet' : 'Die schwarze Kugel hat alles genommen'}</small></div>`;
    const html = `
      ${head}
      <div class="seq">${ballsHTML(rec.balls)}</div>
      ${chartSVG(pLine, mLine, lLine)}
      <div class="legend"><span class="lg you">Du</span><span class="lg math">Mathe-Linie</span>${lLine ? '<span class="lg luck">Glücks-Linie</span>' : ''}</div>
      <p class="verdict ${vcls}">${verdict}</p>
      ${luck ? `<div class="whatif"><div class="wi-title">Was wäre gewesen, wenn du weitergezogen hättest?</div><div class="wi-row" id="wiRow"></div><div class="wi-msg" id="wiMsg"></div></div>` : ''}
      <div class="decisions">🎯 ${rec.correct}/${rec.decisions.length} Entscheidungen mathematisch richtig</div>
      <button class="btn primary" id="btnNext">${isLast ? 'Tagesauswertung' : 'Nächste Runde (' + (r.i + 2) + '/3)'} →</button>`;
    openModal(html, 'eval');
    $('btnNext').onclick = () => {
      SFX.click(); closeModal();
      $('potBox').classList.remove('busted', 'cashed');
      if (isLast) { R = null; renderAll(); showDaySummary(true); }
      else startRound(r.i + 1, true);
    };
    if (luck) playWhatIf(luckBalls, rec.pot);
  }

  async function playWhatIf(list, cashed) {
    const row = $('wiRow'), msg = $('wiMsg');
    let maxPot = cashed, bust = false;
    for (const x of list) {
      await wait(420);
      if (!row.isConnected) return;
      const t = x.ev === 'Bshield' ? 'B' : x.ev;
      const el = document.createElement('div');
      el.className = 'wi pop';
      el.innerHTML = `<i class="mini ${x.ev === 'Bshield' ? 'shielded' : ''}" style="background:${ballCSS(t)}"></i><small>${x.pot < 0 ? '💥' : BL.fmtMult(x.pot)}</small>`;
      row.appendChild(el);
      if (x.pot < 0) { SFX.plonk(0); bust = true; break; }
      SFX.tick(0.5);
      maxPot = Math.max(maxPot, x.pot);
    }
    await wait(300);
    if (!msg.isConnected) return;
    if (bust && list.length && list[0].pot < 0) msg.innerHTML = '😮‍💨 <b>Puh!</b> Die nächste Kugel wäre schwarz gewesen.';
    else if (bust && maxPot > cashed) msg.innerHTML = `Du hättest bis <b>${BL.fmtMult(maxPot)}</b> kommen können – danach wäre die Urne zugeschnappt.`;
    else if (bust) msg.innerHTML = 'Weiterziehen hätte nichts mehr gebracht.';
    else msg.innerHTML = `Die Urne war gnädig: bis <b>${BL.fmtMult(maxPot)}</b> ohne Bust.`;
  }

  function shareText() {
    const d = dayRec();
    const res = d.rounds.map((r) => (r.end === 'bust' ? '💥' : BL.fmtMult(r.pot))).join(' · ');
    const rows = d.rounds.map((r) => (r.balls || []).map((ev) => (ev === 'Bshield' ? '🛡️' : BL.BALL[ev].emoji)).join('')).join('  ');
    const pro = d.rounds.every((r) => r.pro) ? ' 🧠' : '';
    return `Ballotle #${setup.num}  💰 ${res}${pro}\n${rows}\nballotle.dicele.io`;
  }

  let cdTimer = null;
  function showDaySummary(fresh) {
    const d = dayRec();
    const tomorrow = BL.dailySetup(BL.addDays(TODAY, 1));
    const mathDay = d.mathScore != null ? d.mathScore : d.rounds.reduce((a, r) => a + (r.math && !r.math.bust ? r.math.pot : 0), 0);
    const rows = d.rounds.map((r, i) => `
      <div class="drow ${r.end}"><span class="dn">${i + 1}</span><span class="dm">${r.end === 'bust' ? '💥' : BL.fmtMult(r.pot)}</span><span class="db">${ballsHTML(r.balls || [])}</span><b class="ds">${fmt(r.score || 0)}</b></div>`).join('');
    const cmp = d.score > mathDay ? '🏅 Du hast die Mathematikerin geschlagen!' : d.score === mathDay ? '🤝 Gleichstand mit der Mathematikerin.' : '👩‍🏫 Die Mathematikerin lag heute vorne.';
    const html = `
      <div class="ev-head day"><span class="kicker">Ballotle #${setup.num} · Tageswertung</span><div class="big" id="dayScore">0</div><small>Chips heute · Konto: ${fmt(save.chips)}</small></div>
      <div class="drows">${rows}</div>
      <p class="verdict">${cmp} <small>(Mathe-Linie: ${fmt(mathDay)})</small></p>
      <pre class="share" id="shareTxt">${shareText()}</pre>
      <button class="btn primary" id="btnShare">📋 Ergebnis teilen</button>
      <div class="tomorrow">
        <div>Nächste Urne in <b id="countdown">--:--:--</b></div>
        <div class="teaser">Morgen: ${tomorrow.mod.icon} <b>${tomorrow.mod.name}</b></div>
        ${save.streak.days > 1 ? `<div class="streakline">🔥 ${save.streak.days} Tage in Folge</div>` : ''}
      </div>
      <div class="row2"><button class="btn ghost" id="btnColl">🏆 Sammlung & Shop</button><button class="btn ghost" id="btnClose">Schliessen</button></div>`;
    openModal(html, 'day');
    // Zähler hochzählen
    const el = $('dayScore'); const t0 = performance.now(); const to = d.score;
    const step = (t) => { const p = Math.min(1, (t - t0) / 1200); el.textContent = fmt(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    if (fresh) { SFX.fanfare(); if (d.score > 0) FX.confetti(120); }
    $('btnShare').onclick = async () => {
      const txt = shareText();
      try {
        if (navigator.share && matchMedia('(pointer:coarse)').matches) await navigator.share({ text: txt });
        else { await navigator.clipboard.writeText(txt); toast('<span class="ti">📋</span><div><b>Kopiert!</b><small>Ab damit in den Gruppenchat.</small></div>'); }
      } catch (e) { /* abgebrochen */ }
    };
    $('btnColl').onclick = () => { SFX.click(); showCollection(); };
    $('btnClose').onclick = () => { SFX.click(); closeModal(); };
    clearInterval(cdTimer);
    const tick = () => {
      const el2 = $('countdown'); if (!el2) { clearInterval(cdTimer); return; }
      const n = new Date(); const m = new Date(n); m.setHours(24, 0, 0, 0);
      let s = Math.max(0, Math.floor((m - n) / 1000));
      if (s === 0 && !DEBUG_DATE) location.reload();
      const h = String(Math.floor(s / 3600)).padStart(2, '0'); s %= 3600;
      el2.textContent = h + ':' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    };
    tick(); cdTimer = setInterval(tick, 1000);
  }

  function showCollection(tab) {
    tab = tab || 'badges';
    const s = save.stats;
    let body = '';
    if (tab === 'badges') {
      body = `<div class="badges">${BADGES.map((b) => `<div class="badge ${save.badges[b.id] ? 'on' : ''}"><span>${save.badges[b.id] ? b.icon : '🔒'}</span><b>${b.name}</b><small>${b.desc}</small></div>`).join('')}</div>
      <div class="stats">
        <div><b>${s.rounds}</b><small>Runden</small></div>
        <div><b>${s.rounds ? Math.round((100 * s.busts) / s.rounds) : 0} %</b><small>Bust-Quote</small></div>
        <div><b>${s.decisions ? Math.round((100 * s.correct) / s.decisions) : 0} %</b><small>Mathe-richtig</small></div>
        <div><b>${BL.fmtMult(s.bestPot || 10)}</b><small>Bester Topf</small></div>
        <div><b>${fmt(s.bestDay)}</b><small>Bester Tag</small></div>
        <div><b>${s.mathPerfect}</b><small>Mathe-perfekt</small></div>
      </div>`;
    } else {
      const list = tab === 'skin' ? SKINS : URNS;
      body = `<div class="shop">${list.map((it) => {
        const owned = save.owned[tab].includes(it.id), eq = save.equip[tab] === it.id;
        const btn = eq ? '<span class="eq">✓ Aktiv</span>' : owned ? `<button class="btn small" data-eq="${it.id}">Benutzen</button>` : `<button class="btn small buy" data-buy="${it.id}" ${save.chips < it.cost ? 'disabled' : ''}>🪙 ${fmt(it.cost)}</button>`;
        return `<div class="item ${eq ? 'eqd' : ''}"><div class="prev prev-${tab}-${it.id}">${tab === 'skin' ? ['G', 'S', 'B', 'R'].map((t) => `<i class="mini sk-${it.id}" style="background:${ballCSS(t)}"></i>`).join('') : '<i class="urnprev"></i>'}</div><div class="it-t"><b>${it.name}</b><small>${it.desc}</small></div>${btn}</div>`;
      }).join('')}</div><p class="note">Nur mit Spiel-Chips. Kein Echtgeld, keine Käufe.</p>`;
    }
    openModal(`
      <div class="ev-head"><span class="kicker">${title()}</span><div class="big">🪙 ${fmt(save.chips)}</div><small>Chip-Konto</small></div>
      <div class="tabs"><button data-tab="badges" class="${tab === 'badges' ? 'on' : ''}">Abzeichen</button><button data-tab="skin" class="${tab === 'skin' ? 'on' : ''}">Kugel-Skins</button><button data-tab="urn" class="${tab === 'urn' ? 'on' : ''}">Urnen</button></div>
      ${body}
      <button class="btn ghost" id="btnClose">Schliessen</button>`, 'coll');
    $('modalCard').querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { SFX.click(); showCollection(b.dataset.tab); }));
    $('modalCard').querySelectorAll('[data-buy]').forEach((b) => (b.onclick = () => {
      const it = (tab === 'skin' ? SKINS : URNS).find((x) => x.id === b.dataset.buy);
      if (save.chips < it.cost) return;
      save.chips -= it.cost; save.owned[tab].push(it.id); save.equip[tab] = it.id; persist();
      SFX.cash(true); applyEquip(); renderHeader(); $('chips').dataset.v = save.chips;
      showCollection(tab);
    }));
    $('modalCard').querySelectorAll('[data-eq]').forEach((b) => (b.onclick = () => { save.equip[tab] = b.dataset.eq; persist(); SFX.click(); applyEquip(); showCollection(tab); }));
    $('btnClose').onclick = () => { SFX.click(); closeModal(); };
  }

  function applyEquip() { urn.setSkin(save.equip.skin); urn.setTheme(save.equip.urn); document.body.dataset.urn = save.equip.urn; }

  function showHelp() {
    const leg = BL.TYPES.map((t) => `<div class="lgd"><i class="mini" style="background:${ballCSS(t)}"></i><b>${BL.BALL[t].name}</b><span>${BL.BALL[t].desc}</span></div>`).join('');
    openModal(`
      <div class="ev-head"><span class="kicker">So geht's</span><div class="big title-font">Wann hörst du auf?</div></div>
      <p>Jeden Tag gibt es <b>eine Urne für alle</b> und <b>3 Runden</b>. Dein Topf startet mit <b>10 Chips</b>. Zieh Kugel um Kugel – oder <b>kassier ein</b>, bevor die schwarze kommt.</p>
      <div class="legend-list">${leg}</div>
      <p><b>Ohne Zurücklegen:</b> Jede Kugel verändert das Risiko. <b>Gier-Regel:</b> Jede goldene Kugel lässt ${setup.greed === 1 ? 'eine schwarze' : setup.greed + ' schwarze'} Kugel${setup.greed === 1 ? '' : 'n'} in die Urne fallen.</p>
      <p><b>Profi-Modus:</b> Ohne Risikoanzeige und Erwartungswert, dafür <b>+25 %</b> auf eingekassierte Chips.</p>
      <p>Nach jeder Runde siehst du die <b>Mathe-Linie</b> (Stopp, sobald der Erwartungswert der nächsten Ziehung negativ ist) und die <b>Glücks-Linie</b> (was beim Weiterziehen passiert wäre). Pech und Fehler sind zwei verschiedene Dinge!</p>
      <p class="note">Tastatur: <kbd>Leertaste</kbd> ziehen · <kbd>K</kbd> einkassieren. Kein Echtgeld, keine Anmeldung.</p>
      <button class="btn primary" id="btnClose">Los geht's!</button>`, 'help');
    $('btnClose').onclick = () => { SFX.unlock(); SFX.click(); closeModal(); if (!save.settings.seenHelp) { save.settings.seenHelp = true; persist(); } };
  }

  // ---------- Events ----------
  $('btnDraw').onclick = onDraw;
  $('btnCash').onclick = () => onCash(false);
  $('proToggle').onchange = (e) => {
    if (!R || R.rec.actions > 0) return;
    save.settings.pro = R.rec.pro = e.target.checked; persist();
    SFX.unlock(); SFX.click(); renderHud();
  };
  $('btnSound').onclick = () => { save.settings.sound = !save.settings.sound; SFX.enabled = save.settings.sound; persist(); SFX.unlock(); SFX.click(); renderHeader(); renderHud(); };
  $('btnHelp').onclick = () => { SFX.unlock(); SFX.click(); showHelp(); };
  $('btnShop').onclick = () => { SFX.unlock(); SFX.click(); showCollection(); };
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && !$('btnNext')) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (!$('modal').classList.contains('hidden')) {
      if ((e.key === 'Enter' || e.key === ' ') && $('btnNext')) { e.preventDefault(); $('btnNext').click(); }
      else if (e.key === 'Escape' && !$('btnNext')) closeModal();
      return;
    }
    if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); onDraw(); }
    else if (e.key === 'k' || e.key === 'K') { e.preventDefault(); onCash(false); }
  });
  document.addEventListener('pointerdown', () => SFX.unlock(), { once: true });

  // ---------- Start ----------
  applyEquip();
  if (DEBUG_DATE) document.body.classList.add('debug');
  const ri = roundIndex();
  if (ri < BL.CFG.rounds) {
    startRound(ri, false);
    if (!save.settings.seenHelp) showHelp();
  } else {
    R = null;
    urn.setBalls(setup.mix);
    renderAll();
    $('tray').innerHTML = '';
    showDaySummary(false);
  }
  $('chips').dataset.v = save.chips;

  // Für Tests in der Konsole
  window.__ballotle = { setup, get R() { return R; }, save: () => save };
})();
