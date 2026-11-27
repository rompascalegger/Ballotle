/* Ballotle – Effekte: Partikel (Münzen, Konfetti, Scherben), Schwebetext, Bildschirmwackeln. */
(function () {
  'use strict';
  const cv = document.getElementById('fx');
  const g = cv.getContext('2d');
  let parts = [];
  let dpr = 1;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  }
  resize(); addEventListener('resize', resize);

  function rand(a, b) { return a + Math.random() * (b - a); }

  const CONF = ['#f5c518', '#ffffff', '#e63946', '#ffd166', '#c0c6cc', '#ff7aa2'];

  function add(p) { if (parts.length < 600) parts.push(p); }

  const FX = {
    // Münzregen aus einem Punkt (optional zu einem Ziel)
    coins(x, y, n, target) {
      for (let i = 0; i < n; i++) {
        const a = rand(-Math.PI, 0), sp = rand(250, 750);
        add({ k: 'coin', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 200, g: 1400, life: rand(1.1, 1.8), t: 0, r: rand(5, 9), spin: rand(4, 14), target, delay: target ? rand(0.25, 0.6) : 0 });
      }
    },
    burst(x, y, color, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(80, speed || 500);
        add({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 300, life: rand(0.4, 0.9), t: 0, r: rand(1.5, 3.5), color });
      }
    },
    confetti(n) {
      for (let i = 0; i < n; i++) {
        add({ k: 'conf', x: rand(0, innerWidth), y: rand(-80, -10), vx: rand(-60, 60), vy: rand(100, 300), g: 120, life: rand(2.5, 4), t: 0, w: rand(6, 11), h: rand(3, 6), rot: rand(0, 6), vr: rand(-8, 8), color: CONF[i % CONF.length] });
      }
    },
    shards(x, y, n) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(150, 700);
        add({ k: 'shard', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 150, g: 1500, life: rand(0.9, 1.6), t: 0, s: rand(6, 16), rot: rand(0, 6), vr: rand(-12, 12), color: Math.random() < 0.3 ? '#e63946' : '#111' });
      }
    },
    snow(x, y, n) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(40, 260);
        add({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 60, life: rand(0.8, 1.6), t: 0, r: rand(1.5, 3), color: '#dff8ff' });
      }
    },
    rainbow(x, y, n) {
      const cols = ['#ff4d4d', '#ffb84d', '#fff04d', '#4dff88', '#4dc3ff', '#9d6bff'];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, sp = rand(250, 450);
        add({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 100, life: rand(0.6, 1.1), t: 0, r: rand(2, 4), color: cols[i % 6] });
      }
    },
    // Schwebender Text (DOM)
    float(text, x, y, cls) {
      const el = document.createElement('div');
      el.className = 'float-text ' + (cls || '');
      el.textContent = text;
      el.style.left = x + 'px'; el.style.top = y + 'px';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1600);
    },
    shake(strength) {
      if (reduce) return;
      const app = document.getElementById('app');
      app.style.setProperty('--shake', (strength || 1) * 8 + 'px');
      app.classList.remove('shake'); void app.offsetWidth; app.classList.add('shake');
    },
    flash(color) {
      const el = document.getElementById('flash');
      el.style.background = color;
      el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    },
    centerOf(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
  };

  let last = performance.now();
  function loop(t) {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    const keep = [];
    for (const p of parts) {
      p.t += dt;
      if (p.t > p.life) {
        if (p.k === 'coin' && p.target && p.onArrive) p.onArrive();
        continue;
      }
      if (p.k === 'coin' && p.target && p.t > p.delay) {
        const tg = p.target;
        const dx = tg.x - p.x, dy = tg.y - p.y, d = Math.hypot(dx, dy);
        if (d < 18) { if (FX.onCoinArrive) FX.onCoinArrive(); continue; }
        const k = Math.min(1, (p.t - p.delay) * 2.2);
        p.vx += (dx / d * 2600 - p.vx) * k * dt * 6; p.vy += (dy / d * 2600 - p.vy) * k * dt * 6;
        p.life = Math.max(p.life, p.t + 0.5);
      } else p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const a = Math.max(0, 1 - p.t / p.life);
      if (p.k === 'coin') {
        const sx = Math.abs(Math.cos(p.t * p.spin));
        g.save(); g.translate(p.x, p.y); g.scale(Math.max(0.15, sx), 1);
        g.beginPath(); g.arc(0, 0, p.r, 0, 7);
        g.fillStyle = '#f5c518'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#8a5a00'; g.stroke();
        g.beginPath(); g.arc(-p.r * 0.3, -p.r * 0.3, p.r * 0.35, 0, 7); g.fillStyle = 'rgba(255,255,220,.9)'; g.fill();
        g.restore();
      } else if (p.k === 'spark') {
        g.globalAlpha = a; g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); g.globalAlpha = 1;
      } else if (p.k === 'conf') {
        p.rot += p.vr * dt; p.vx += Math.sin(p.t * 3 + p.w) * 20 * dt;
        g.save(); g.globalAlpha = Math.min(1, a * 2); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.color; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
      } else if (p.k === 'shard') {
        p.rot += p.vr * dt;
        g.save(); g.globalAlpha = a; g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.color;
        g.beginPath(); g.moveTo(0, -p.s / 2); g.lineTo(p.s / 3, p.s / 2); g.lineTo(-p.s / 3, p.s / 3); g.closePath(); g.fill(); g.restore();
      }
      keep.push(p);
    }
    parts = keep;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  window.FX = FX;
})();
