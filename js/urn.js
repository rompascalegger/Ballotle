/* Ballotle – Glasurne als 2D-Canvas mit einfacher Kugelphysik. */
(function () {
  'use strict';

  const W = 360, H = 410;
  const CX = 180, CY = 172, R = 148;
  const BR = 17; // Kugelradius
  const EXIT_Y = CY + R;
  const CUP_Y = 378;

  const COLORS = {
    G: ['#fff6b0', '#f5c518', '#a87400', '#5a3c00'],
    S: ['#ffffff', '#d5dbe1', '#8d97a3', '#4a525c'],
    B: ['#6a6a6a', '#1c1c1c', '#050505', '#000000'],
    R: ['#ffffff', '#ff5ea8', '#7a4dff', '#2a1a66'],
    I: ['#f2fdff', '#9ae8ff', '#2aa6dd', '#0b4f7a'],
    L: ['#fff8b0', '#9d5cff', '#5a1fc7', '#2a0a66'],
    F: ['#ffffff', '#c9c9dd', '#8a8aa6', '#4e4e66'],
    H: ['#e8e8f0', '#9a9aae', '#6a6a80', '#3a3a4a'], // versteckt (Nebel)
  };

  const THEMES = {
    glas: { rim: '#d9b44a', rimDark: '#7a5a12', tint: 'rgba(255,255,255,0.05)', back: 'rgba(20,0,0,0.35)', glow: null },
    messing: { rim: '#e0a23a', rimDark: '#6b3c06', tint: 'rgba(255,190,90,0.12)', back: 'rgba(60,25,0,0.45)', glow: null, rivets: true },
    mitternacht: { rim: '#45f0ff', rimDark: '#0a4a66', tint: 'rgba(80,40,200,0.15)', back: 'rgba(5,0,30,0.6)', glow: '#45f0ff' },
  };

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function bounce(t) {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }

  class Urn {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.balls = [];
      this.cup = null; // Kugel in der Messingschale
      this.skin = 'glanz';
      this.theme = 'glas';
      this.spinUntil = 0; this.spinPower = 0;
      this.fogLevel = 0; this.fogTarget = 0;
      this.sprites = {};
      this.last = performance.now();
      this.time = 0;
      this.flash = 0; this.flashColor = '255,255,255';
      this.dpr = 1;
      this.resize();
      window.addEventListener('resize', () => this.resize());
      requestAnimationFrame((t) => this.loop(t));
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const rect = this.cv.getBoundingClientRect();
      const scale = (rect.width || W) / W;
      this.dpr = dpr * scale;
      this.cv.width = Math.round(W * this.dpr);
      this.cv.height = Math.round(H * this.dpr);
      this.sprites = {};
    }

    setSkin(s) { this.skin = s; this.sprites = {}; }
    setTheme(t) { this.theme = t; }

    // ---------- Kugeln ----------
    spawn(type, x, y, vx, vy) {
      const b = { type, x, y, vx: vx || 0, vy: vy || 0, r: BR, state: 'free', hidden: false, rot: Math.random() * 6.28, vr: 0 };
      this.balls.push(b);
      return b;
    }

    setBalls(counts) {
      this.balls = [];
      const list = [];
      for (const t in counts) for (let i = 0; i < counts[t]; i++) list.push(t);
      list.sort(() => Math.random() - 0.5);
      const cols = 7;
      list.forEach((t, i) => {
        const row = Math.floor(i / cols), col = i % cols;
        const x = CX - (cols - 1) * BR + col * BR * 2 + (row % 2) * BR * 0.5 + (Math.random() - 0.5) * 4;
        const y = CY + R - BR - 6 - row * BR * 1.75;
        this.spawn(t, x, y, (Math.random() - 0.5) * 50, 0);
      });
    }

    // Bringt die Urne auf eine Zusammensetzung (ohne Neuaufbau)
    syncTo(counts) {
      const have = {};
      this.balls.forEach((b) => { if (b.state !== 'gone') have[b.type] = (have[b.type] || 0) + 1; });
      for (const t in counts) {
        let d = (counts[t] || 0) - (have[t] || 0);
        while (d > 0) { this.dropIn(t, 0); d--; }
        while (d < 0) { const i = this.balls.findIndex((b) => b.type === t && b.state === 'free'); if (i < 0) break; this.balls.splice(i, 1); d++; }
      }
    }

    freeOf(type) { return this.balls.filter((b) => b.type === type && b.state === 'free'); }

    pickBall(type) {
      const c = this.freeOf(type);
      if (!c.length) return null;
      c.sort((a, b) => b.y - a.y);
      return c[Math.floor(Math.random() * Math.min(3, c.length))];
    }

    // Kugel fällt oben in die Urne (Gier-Regel)
    dropIn(type, delay) {
      return new Promise((res) => {
        setTimeout(() => {
          const b = this.spawn(type, CX + (Math.random() - 0.5) * 30, CY - R - 30, (Math.random() - 0.5) * 60, 380);
          b.entering = true;
          setTimeout(res, 380);
        }, delay || 0);
      });
    }

    spin(ms, power) { this.spinUntil = performance.now() + ms; this.spinPower = power || 1; }

    tween(b, keys) {
      // keys: [{x,y,dur,ease}]
      b.state = 'kin';
      return new Promise((res) => { b.path = keys.slice(); b.seg = null; b.onDone = res; });
    }

    // Kugel des Typs rollt aus der Urne in die Schale
    async eject(type) {
      let b = this.pickBall(type);
      if (!b) b = this.spawn(type, CX, CY, 0, 0);
      b.hidden = false;
      if (this.cup) { this.cup.state = 'gone'; this.cup = null; }
      await this.tween(b, [
        { x: CX, y: EXIT_Y - BR - 2, dur: 180, ease: easeInOut },
        { x: CX, y: EXIT_Y + 4, dur: 70, ease: easeInOut },
        { x: CX, y: CUP_Y, dur: 300, ease: bounce },
      ]);
      b.state = 'cup';
      this.balls.splice(this.balls.indexOf(b), 1);
      this.cup = b; b.cupT = performance.now();
      return b;
    }

    // Beinahe-Moment: Kugel klappert am Ausgang und fällt zurück
    async fakeOut(type) {
      const b = this.pickBall(type);
      if (!b) return;
      await this.tween(b, [{ x: CX, y: EXIT_Y - BR - 2, dur: 220, ease: easeInOut }]);
      b.state = 'rattle'; b.rattleT = performance.now();
      await new Promise((r) => setTimeout(r, 400));
      b.state = 'free'; b.vy = -620; b.vx = (Math.random() - 0.5) * 300;
    }

    clearCup() { if (this.cup) { this.cup.fade = performance.now(); } }

    setFog(hiddenCounts) {
      this.balls.forEach((b) => (b.hidden = false));
      if (!hiddenCounts) { this.fogTarget = 0; return; }
      this.fogTarget = 1;
      for (const t in hiddenCounts) {
        let k = hiddenCounts[t];
        for (const b of this.balls) { if (k <= 0) break; if (b.type === t && b.state === 'free') { b.hidden = true; k--; } }
      }
    }

    doFlash(rgb, amt) { this.flashColor = rgb; this.flash = amt || 1; }

    // ---------- Physik ----------
    step(dt) {
      const g = 1100;
      const spinning = performance.now() < this.spinUntil;
      const balls = this.balls;
      for (const b of balls) {
        if (b.state !== 'free') continue;
        b.vy += g * dt;
        if (spinning) {
          // Luftdüsen von unten + Wirbel
          const dx = b.x - CX, dy = b.y - CY;
          const d = Math.hypot(dx, dy) || 1;
          const p = this.spinPower;
          b.vx += (-dy / d) * 1400 * p * dt;
          b.vy += (dx / d) * 1400 * p * dt;
          if (dy > R * 0.2) { b.vy -= (2600 + Math.random() * 1800) * p * dt; b.vx += (Math.random() - 0.5) * 2400 * p * dt; }
        }
        b.vx *= 0.999; b.vy *= 0.999;
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.rot += (b.vx * dt) / b.r;
        // Wand
        if (b.entering) { if (b.y > CY - R + b.r + 4) b.entering = false; else continue; }
        const dx = b.x - CX, dy = b.y - CY;
        const d = Math.hypot(dx, dy);
        const lim = R - b.r - 5;
        if (d > lim) {
          const nx = dx / d, ny = dy / d;
          b.x = CX + nx * lim; b.y = CY + ny * lim;
          const vn = b.vx * nx + b.vy * ny;
          if (vn > 0) {
            b.vx -= (1 + 0.45) * vn * nx; b.vy -= (1 + 0.45) * vn * ny;
            b.vx *= 0.985; b.vy *= 0.985;
          }
        }
      }
      // Kugel-Kugel
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        if (a.state === 'cup' || a.entering) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j];
          if (b.state === 'cup' || b.entering) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const md = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= md * md || d2 === 0) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
          const ov = md - d;
          const af = a.state === 'free', bf = b.state === 'free';
          if (!af && !bf) continue;
          const wa = af ? (bf ? 0.5 : 1) : 0, wb = bf ? (af ? 0.5 : 1) : 0;
          a.x -= nx * ov * wa; a.y -= ny * ov * wa;
          b.x += nx * ov * wb; b.y += ny * ov * wb;
          const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv < 0) {
            const imp = -(1 + 0.55) * rv;
            if (af && bf) { a.vx -= imp * nx * 0.5; a.vy -= imp * ny * 0.5; b.vx += imp * nx * 0.5; b.vy += imp * ny * 0.5; }
            else if (af) { a.vx -= imp * nx; a.vy -= imp * ny; }
            else { b.vx += imp * nx; b.vy += imp * ny; }
          }
        }
      }
    }

    updateKinematic(now) {
      for (const b of this.balls) {
        if (b.state === 'rattle') {
          const t = (now - b.rattleT) / 1000;
          b.x = CX + Math.sin(t * 70) * 3.2; b.y = EXIT_Y - BR - 2 + Math.abs(Math.sin(t * 45)) * -3;
          continue;
        }
        if (b.state !== 'kin') continue;
        if (!b.seg) {
          const k = b.path.shift();
          if (!k) { const cb = b.onDone; b.onDone = null; b.state = 'held'; if (cb) cb(); continue; }
          b.seg = { k, fx: b.x, fy: b.y, t0: now };
        }
        const { k, fx, fy, t0 } = b.seg;
        const p = Math.min(1, (now - t0) / k.dur);
        const e = k.ease(p);
        b.x = fx + (k.x - fx) * e; b.y = fy + (k.y - fy) * e;
        b.vx = 0; b.vy = 0;
        if (p >= 1) b.seg = null;
      }
    }

    loop(t) {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t; this.time += dt;
      const sub = 3;
      this.updateKinematic(t);
      for (let i = 0; i < sub; i++) this.step(dt / sub);
      this.fogLevel += (this.fogTarget - this.fogLevel) * Math.min(1, dt * 3);
      this.flash = Math.max(0, this.flash - dt * 2.5);
      this.draw(t);
      requestAnimationFrame((tt) => this.loop(tt));
    }

    // ---------- Zeichnen ----------
    sprite(type) {
      const key = type + '|' + this.skin;
      if (this.sprites[key]) return this.sprites[key];
      const s = Math.ceil(BR * 2 * this.dpr) + 4;
      const c = document.createElement('canvas');
      c.width = c.height = s;
      const g = c.getContext('2d');
      const r = (s - 4) / 2, cx = s / 2, cy = s / 2;
      const col = COLORS[type];
      if (this.skin === 'pixel') {
        // grob gerastert, flache Farben
        const px = Math.max(2, Math.round(r / 5));
        for (let y = -r; y < r; y += px) for (let x = -r; x < r; x += px) {
          const dx = x + px / 2, dy = y + px / 2;
          const d = Math.hypot(dx, dy);
          if (d > r) continue;
          const l = (dx * -0.6 + dy * -0.8) / r; // Licht von oben links
          g.fillStyle = d > r - px ? col[3] : l > 0.55 ? col[0] : l > -0.1 ? col[1] : col[2];
          if (type === 'R' && d <= r - px) g.fillStyle = ['#ff4d4d', '#ffb84d', '#fff04d', '#4dff88', '#4dc3ff', '#9d6bff'][Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 6) % 6];
          g.fillRect(cx + x, cy + y, px, px);
        }
      } else {
        let fill;
        if (type === 'R' && g.createConicGradient) {
          fill = g.createConicGradient(0, cx, cy);
          ['#ff4d4d', '#ffb84d', '#fff04d', '#4dff88', '#4dc3ff', '#9d6bff', '#ff4d4d'].forEach((c2, i) => fill.addColorStop(i / 6, c2));
        } else {
          fill = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
          fill.addColorStop(0, col[0]); fill.addColorStop(0.35, col[1]); fill.addColorStop(0.85, col[2]); fill.addColorStop(1, col[3]);
        }
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill();
        if (type === 'R') {
          const sh = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 0, cx, cy, r);
          sh.addColorStop(0, 'rgba(255,255,255,0.7)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.35)');
          g.fillStyle = sh; g.fill();
        }
        if (this.skin === 'juwel') {
          // Facetten
          g.save(); g.clip();
          g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = Math.max(1, r * 0.06);
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke();
          }
          g.beginPath();
          for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI * 2; g.lineTo(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45); }
          g.stroke();
          g.restore();
          g.fillStyle = 'rgba(255,255,255,0.95)';
          star(g, cx - r * 0.4, cy - r * 0.42, r * 0.22);
        } else {
          // Glanzpunkt
          g.beginPath(); g.ellipse(cx - r * 0.35, cy - r * 0.45, r * 0.32, r * 0.2, -0.6, 0, Math.PI * 2);
          g.fillStyle = 'rgba(255,255,255,0.75)'; g.fill();
        }
      }
      // Symbole für Sonderkugeln
      g.save(); g.translate(cx, cy);
      const lw = Math.max(1.5, r * 0.13);
      if (type === 'L') {
        g.fillStyle = '#fff36b'; g.strokeStyle = '#3a0c80'; g.lineWidth = lw * 0.5;
        g.beginPath(); g.moveTo(r * 0.15, -r * 0.65); g.lineTo(-r * 0.35, r * 0.08); g.lineTo(-r * 0.02, r * 0.08); g.lineTo(-r * 0.2, r * 0.65); g.lineTo(r * 0.38, -r * 0.12); g.lineTo(r * 0.04, -r * 0.12); g.closePath(); g.fill(); g.stroke();
      } else if (type === 'I') {
        g.strokeStyle = '#ffffff'; g.lineWidth = lw; g.lineCap = 'round';
        for (let i = 0; i < 3; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(0, -r * 0.55); g.lineTo(0, r * 0.55); g.stroke(); }
      } else if (type === 'F') {
        g.strokeStyle = 'rgba(80,80,110,0.9)'; g.lineWidth = lw; g.lineCap = 'round';
        for (let k = -1; k <= 1; k++) { g.beginPath(); for (let x = -r * 0.55; x <= r * 0.55; x += 2) g.lineTo(x, k * r * 0.32 + Math.sin(x / r * 7) * r * 0.08); g.stroke(); }
      } else if (type === 'H') {
        g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = 'bold ' + Math.round(r * 1.1) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 0, r * 0.06);
      }
      g.restore();
      this.sprites[key] = c;
      return c;
    }

    draw(now) {
      const g = this.ctx, d = this.dpr;
      const th = THEMES[this.theme] || THEMES.glas;
      g.setTransform(d, 0, 0, d, 0, 0);
      g.clearRect(0, 0, W, H);
      g.imageSmoothingEnabled = this.skin !== 'pixel';

      // Standfuss
      const baseG = g.createLinearGradient(0, CUP_Y - 30, 0, H);
      baseG.addColorStop(0, th.rim); baseG.addColorStop(1, th.rimDark);
      g.fillStyle = baseG;
      g.beginPath(); g.moveTo(CX - 60, H - 4); g.lineTo(CX + 60, H - 4); g.lineTo(CX + 34, CUP_Y + 8); g.lineTo(CX - 34, CUP_Y + 8); g.closePath(); g.fill();
      // Rohr
      const tube = g.createLinearGradient(CX - 24, 0, CX + 24, 0);
      tube.addColorStop(0, th.rimDark); tube.addColorStop(0.4, th.rim); tube.addColorStop(1, th.rimDark);
      g.fillStyle = tube; g.fillRect(CX - 23, EXIT_Y - 8, 46, CUP_Y - EXIT_Y - 6);
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(CX - 19, EXIT_Y - 8, 38, CUP_Y - EXIT_Y - 6);

      // Glas hinten
      g.save();
      g.beginPath(); g.arc(CX, CY, R, 0, Math.PI * 2);
      const back = g.createRadialGradient(CX, CY - 40, 20, CX, CY, R);
      back.addColorStop(0, 'rgba(255,255,255,0.08)'); back.addColorStop(1, th.back);
      g.fillStyle = back; g.fill();
      g.clip();
      // Kugeln
      const list = this.balls.slice().sort((a, b) => a.y - b.y);
      for (const b of list) if (b.state !== 'kin' || b.y < EXIT_Y - 4) this.drawBall(b);
      // Nebel
      if (this.fogLevel > 0.01) {
        const fg = g.createLinearGradient(0, CY - R, 0, CY + R);
        fg.addColorStop(0, `rgba(220,220,235,${0.15 * this.fogLevel})`);
        fg.addColorStop(1, `rgba(200,200,220,${0.35 * this.fogLevel})`);
        g.fillStyle = fg; g.fillRect(CX - R, CY - R, R * 2, R * 2);
        for (let i = 0; i < 5; i++) {
          const x = CX - R + ((this.time * 12 + i * 70) % (R * 2 + 80)) - 40;
          const y = CY - 60 + i * 30;
          const cl = g.createRadialGradient(x, y, 0, x, y, 70);
          cl.addColorStop(0, `rgba(240,240,250,${0.22 * this.fogLevel})`); cl.addColorStop(1, 'rgba(240,240,250,0)');
          g.fillStyle = cl; g.fillRect(x - 70, y - 70, 140, 140);
        }
      }
      g.restore();
      // Kugeln im Rohr / Schale
      for (const b of this.balls) if (b.state === 'kin' && b.y >= EXIT_Y - 4) this.drawBall(b);

      // Schale
      const cupG = g.createLinearGradient(0, CUP_Y, 0, CUP_Y + 26);
      cupG.addColorStop(0, th.rim); cupG.addColorStop(1, th.rimDark);
      if (this.cup) {
        const c = this.cup;
        const age = (now - c.cupT) / 1000;
        if (c.fade) { const p = (now - c.fade) / 250; if (p >= 1) this.cup = null; else { g.globalAlpha = 1 - p; this.drawBall(c); g.globalAlpha = 1; } }
        else {
          // Glanz-Puls um die frische Kugel
          if (age < 1.2) {
            const col = c.type === 'B' ? '255,40,40' : c.type === 'G' ? '255,210,60' : '255,255,255';
            const rg = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, 60);
            rg.addColorStop(0, `rgba(${col},${0.6 * (1 - age / 1.2)})`); rg.addColorStop(1, `rgba(${col},0)`);
            g.fillStyle = rg; g.fillRect(c.x - 60, c.y - 60, 120, 120);
          }
          this.drawBall(c);
        }
      }
      g.fillStyle = cupG;
      g.beginPath(); g.ellipse(CX, CUP_Y + 12, 40, 12, 0, 0, Math.PI); g.fill();
      g.beginPath(); g.ellipse(CX, CUP_Y + 12, 40, 4, 0, 0, Math.PI * 2); g.fillStyle = th.rim; g.fill();

      // Glas vorne: Reflexe & Rahmen
      g.save();
      g.beginPath(); g.arc(CX, CY, R, 0, Math.PI * 2);
      g.fillStyle = th.tint; g.fill();
      g.beginPath(); g.ellipse(CX - R * 0.45, CY - R * 0.5, R * 0.28, R * 0.13, -0.7, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,0.13)'; g.fill();
      g.beginPath(); g.arc(CX, CY, R - 10, Math.PI * 0.05, Math.PI * 0.4);
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 5; g.stroke();
      if (th.glow) { g.shadowColor = th.glow; g.shadowBlur = 18; }
      g.beginPath(); g.arc(CX, CY, R, 0, Math.PI * 2);
      g.strokeStyle = th.rim; g.lineWidth = th.rivets ? 9 : 6; g.stroke();
      g.shadowBlur = 0;
      g.beginPath(); g.arc(CX, CY, R + (th.rivets ? 4.5 : 3), 0, Math.PI * 2);
      g.strokeStyle = th.rimDark; g.lineWidth = 1.5; g.stroke();
      if (th.rivets) {
        for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.beginPath(); g.arc(CX + Math.cos(a) * R, CY + Math.sin(a) * R, 2.2, 0, 7); g.fillStyle = '#fff0c0'; g.fill(); }
      }
      // Einfüll-Öffnung oben
      g.fillStyle = th.rim; g.fillRect(CX - 26, CY - R - 10, 52, 12);
      g.fillStyle = th.rimDark; g.fillRect(CX - 20, CY - R - 6, 40, 6);
      g.restore();

      if (this.flash > 0) {
        g.fillStyle = `rgba(${this.flashColor},${this.flash * 0.45})`;
        g.beginPath(); g.arc(CX, CY, R, 0, Math.PI * 2); g.fill();
      }
    }

    drawBall(b) {
      const g = this.ctx;
      const spr = this.sprite(b.hidden ? 'H' : b.type);
      const s = (b.r * 2 + 4 / this.dpr);
      if (b.type === 'R' && !b.hidden && this.skin !== 'pixel') {
        g.save(); g.translate(b.x, b.y); g.rotate(this.time * 2 + b.rot); g.drawImage(spr, -s / 2, -s / 2, s, s); g.restore();
      } else g.drawImage(spr, b.x - s / 2, b.y - s / 2, s, s);
    }
  }

  function star(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const rr = i % 2 ? r * 0.3 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }

  // Kleine DOM-Kugel (für Schale, Legende, Auswertung)
  function ballCSS(type) {
    const c = COLORS[type] || COLORS.H;
    if (type === 'R') return 'radial-gradient(circle at 35% 30%, rgba(255,255,255,.8), rgba(255,255,255,0) 45%), conic-gradient(#ff4d4d,#ffb84d,#fff04d,#4dff88,#4dc3ff,#9d6bff,#ff4d4d)';
    return `radial-gradient(circle at 33% 30%, ${c[0]} 0%, ${c[1]} 35%, ${c[2]} 85%, ${c[3]} 100%)`;
  }

  window.Urn = Urn;
  window.ballCSS = ballCSS;
  window.URN_GEOM = { W, H, CX, CY, R, CUP_Y };
})();
