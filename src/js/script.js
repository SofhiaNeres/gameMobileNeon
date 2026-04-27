// ─── MOBILE DETECTION ───────────────────────────────────────────
const isMobile = true; // always treat as mobile for perf

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });
let W, H;

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width  = W;
  canvas.height = H;
}
resize();
window.addEventListener('resize', () => { resize(); if (G) setupLevel(true); });

// ─── AUDIO (lightweight) ────────────────────────────────────────
let AC;
function sound(type) {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(), g = AC.createGain();
    o.connect(g); g.connect(AC.destination);
    const t = AC.currentTime;
    const cfg = {
      jump:  () => { o.type='sine';     o.frequency.setValueAtTime(280,t); o.frequency.exponentialRampToValueAtTime(560,t+0.1);  g.gain.setValueAtTime(0.1,t);  g.gain.exponentialRampToValueAtTime(0.001,t+0.18); o.start(t); o.stop(t+0.18); },
      djump: () => { o.type='sine';     o.frequency.setValueAtTime(420,t); o.frequency.exponentialRampToValueAtTime(840,t+0.12); g.gain.setValueAtTime(0.12,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.2);  o.start(t); o.stop(t+0.2);  },
      gem:   () => { o.type='sine';     o.frequency.setValueAtTime(880,t); o.frequency.exponentialRampToValueAtTime(1320,t+0.08);g.gain.setValueAtTime(0.14,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.15); o.start(t); o.stop(t+0.15); },
      hit:   () => { o.type='sawtooth'; o.frequency.setValueAtTime(160,t); o.frequency.exponentialRampToValueAtTime(40,t+0.3);  g.gain.setValueAtTime(0.22,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.3);  o.start(t); o.stop(t+0.3);  },
      pow:   () => { o.type='sine';     o.frequency.setValueAtTime(440,t); o.frequency.exponentialRampToValueAtTime(1100,t+0.2); g.gain.setValueAtTime(0.16,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.22); o.start(t); o.stop(t+0.22); },
      land:  () => { o.type='square';   o.frequency.setValueAtTime(80,t);  o.frequency.exponentialRampToValueAtTime(40,t+0.07);  g.gain.setValueAtTime(0.05,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.09); o.start(t); o.stop(t+0.09); },
    };
    cfg[type] && cfg[type]();
  } catch(e) {}
}

// ─── GAME STATE ─────────────────────────────────────────────────
let G = null, RAF = null;

function setupLevel(keepHi) {
  const GH    = Math.min(H * 0.13, 95);
  const GROUND = H - GH;
  const PW    = Math.min(W * 0.07, 28);
  const PH    = PW * 1.55;
  const PX    = W * 0.17;
  const hi    = (keepHi && G) ? G.hi : parseInt(localStorage.getItem('neonDashHi') || '0');

  G = {
    running: false, paused: false, over: false,
    frame: 0,
    score: 0, scoreF: 0,
    hi,
    speed: 5, baseSpeed: 5, maxSpeed: 15,
    GROUND, GH, PW, PH, PX,
    slowActive: 0, shieldBar: 0,
    shake: 0, shakeX: 0, shakeY: 0,
    combo: 0, comboTimer: 0,
    nextObs: 80, nextGem: 55, nextPow: 380,
    player: {
      x: PX, y: GROUND - PH,
      vy: 0, jumps: 0, maxJumps: 2,
      w: PW, h: PH,
      sq: 1, sqV: 0,
      invincible: 0,
      trail: [],
    },
    obstacles: [],
    gems: [],
    powerups: [],
    particles: [],
    // Fewer stars for mobile
    stars: Array.from({length: 40}, () => ({
      x: Math.random() * W,
      y: Math.random() * GROUND * 0.9,
      r: Math.random() * 1.2 + 0.3,
      sp: Math.random() * 0.35 + 0.1,
      a: Math.random() * 0.45 + 0.15,
    })),
  };
}

// ─── PHYSICS ────────────────────────────────────────────────────
const GRAV = 0.58, JUMP = -14, DJUMP = -15.5, SUPER = -18;

function doJump(force) {
  const p = G.player;
  if (p.jumps < p.maxJumps) {
    const f = force || (p.jumps === 0 ? JUMP : DJUMP);
    p.vy = f;
    p.jumps++;
    p.sq = 0.65; p.sqV = 0.09;
    burst(p.x + p.w / 2, p.y + p.h, 6, '#7B7FFF');
    sound(p.jumps > 1 ? 'djump' : 'jump');
  }
}

function burst(x, y, n, col) {
  for (let i = 0; i < n; i++) {
    const a  = Math.random() * Math.PI * 2;
    const sp = Math.random() * 2.5 + 0.8;
    G.particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 0.5,
      life: 1,
      decay: 0.055,
      r: 2.5,
      col,
    });
  }
}

function hit(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ─── SPAWNERS ───────────────────────────────────────────────────
const OBS_TYPES = [
  { wF: 0.065, hF: 0.10, col: '#FF5F7E' },
  { wF: 0.055, hF: 0.15, col: '#FF8C42' },
  { wF: 0.100, hF: 0.07, col: '#4ECDC4' },
  { wF: 0.050, hF: 0.12, col: '#E040FB' },
];

function spawnObs() {
  const t = OBS_TYPES[Math.floor(Math.random() * OBS_TYPES.length)];
  const w = Math.min(t.wF * W, 32);
  const h = Math.min(t.hF * H, 90);
  G.obstacles.push({ x: W + 16, y: G.GROUND - h, w, h, col: t.col });
  if (G.score > 12 && Math.random() < 0.25) {
    const t2 = OBS_TYPES[Math.floor(Math.random() * OBS_TYPES.length)];
    const w2 = Math.min(t2.wF * W, 32);
    const h2 = Math.min(t2.hF * H, 90);
    G.obstacles.push({ x: W + 16 + w + Math.min(48, W * 0.12), y: G.GROUND - h2, w: w2, h: h2, col: t2.col });
  }
}

function spawnGem() {
  const rows = [1.4, 2.6, 3.8];
  const row  = rows[Math.floor(Math.random() * rows.length)];
  G.gems.push({ x: W + 10, y: G.GROUND - G.PH * row, r: 8, pulse: Math.random() * Math.PI * 2, alive: true });
}

function spawnPow() {
  const type = Math.random() < 0.5 ? 'shield' : 'slow';
  G.powerups.push({
    x: W + 10, y: G.GROUND - G.PH * 2.8,
    type, r: 13, pulse: 0, alive: true,
    col:   type === 'shield' ? '#4FC3F7' : '#B39DDB',
    label: type === 'shield' ? '🛡' : '⏳',
  });
}

// ─── UPDATE ─────────────────────────────────────────────────────
function update() {
  if (!G || !G.running || G.paused || G.over) return;
  G.frame++;
  const sf  = G.slowActive > 0 ? 0.38 : 1;
  if (G.slowActive > 0) G.slowActive--;

  G.speed = Math.min(G.maxSpeed, G.baseSpeed + G.scoreF * 0.052);
  const spd = G.speed * sf;

  // Player physics
  const p = G.player;
  p.vy += GRAV;
  p.y  += p.vy;
  if (p.y >= G.GROUND - p.h) {
    const wasAir = p.jumps > 0 && p.vy > 4;
    p.y = G.GROUND - p.h;
    if (wasAir) { p.sq = 0.72; p.sqV = 0.12; sound('land'); }
    p.vy = 0; p.jumps = 0;
  }

  // Squash & stretch
  if (Math.abs(p.sq - 1) > 0.005) {
    p.sq  += (1 - p.sq) * 0.2 + p.sqV;
    p.sqV -= 0.007;
    if (Math.abs(p.sq - 1) < 0.01) { p.sq = 1; p.sqV = 0; }
  }

  // Lightweight trail (mobile: 5 points)
  p.trail.unshift({ x: p.x + p.w / 2, y: p.y + p.h / 2, t: 1 });
  if (p.trail.length > 5) p.trail.pop();
  p.trail.forEach(pt => pt.t -= 0.2);

  if (p.invincible > 0) p.invincible--;
  if (G.shieldBar   > 0) G.shieldBar--;

  // Stars (batch move)
  for (let i = 0; i < G.stars.length; i++) {
    const s = G.stars[i];
    s.x -= s.sp * spd * 0.4;
    if (s.x < 0) s.x = W;
  }

  // Score
  G.scoreF += spd * 0.038;
  G.score   = Math.floor(G.scoreF);

  // Obstacles
  G.nextObs--;
  if (G.nextObs <= 0) {
    spawnObs();
    G.nextObs = Math.max(48, 115 - G.score * 0.65) + Math.random() * 40;
  }
  G.obstacles = G.obstacles.filter(o => {
    o.x -= spd;
    if (o.x + o.w < 0) return false;
    if (p.invincible === 0 && hit(p.x + 3, p.y + 3, p.w - 6, p.h - 6, o.x, o.y, o.w, o.h)) {
      if (G.shieldBar > 0) {
        G.shieldBar = 0; p.invincible = 45;
        burst(p.x + p.w / 2, p.y + p.h / 2, 10, '#4FC3F7');
        sound('pow');
      } else {
        triggerGameOver();
      }
    }
    return true;
  });

  // Gems
  G.nextGem--;
  if (G.nextGem <= 0) { spawnGem(); G.nextGem = 38 + Math.random() * 52; }
  G.gems = G.gems.filter(g => {
    g.x    -= spd;
    g.pulse += 0.14;
    if (!g.alive || g.x + g.r < 0) return false;
    if (hit(p.x, p.y, p.w, p.h, g.x - g.r, g.y - g.r, g.r * 2, g.r * 2)) {
      g.alive = false;
      G.combo++; G.comboTimer = 110;
      G.scoreF += 5 + G.combo;
      burst(g.x, g.y, 8, '#FFD700');
      sound('gem');
      return false;
    }
    return g.alive;
  });

  if (G.comboTimer > 0) G.comboTimer--; else G.combo = 0;

  // Powerups
  G.nextPow--;
  if (G.nextPow <= 0) { spawnPow(); G.nextPow = 300 + Math.random() * 180; }
  G.powerups = G.powerups.filter(pw => {
    pw.x    -= spd;
    pw.pulse += 0.1;
    if (!pw.alive || pw.x + pw.r < 0) return false;
    if (hit(p.x, p.y, p.w, p.h, pw.x - pw.r, pw.y - pw.r, pw.r * 2, pw.r * 2)) {
      pw.alive = false;
      if (pw.type === 'shield') G.shieldBar = 210; else G.slowActive = 210;
      burst(pw.x, pw.y, 10, pw.col);
      sound('pow');
      return false;
    }
    return pw.alive;
  });

  // Particles (cap at 40)
  G.particles = G.particles.filter(pt => {
    pt.x   += pt.vx * sf;
    pt.y   += pt.vy * sf;
    pt.vy  += 0.2;
    pt.life -= pt.decay;
    return pt.life > 0;
  });
  if (G.particles.length > 40) G.particles.splice(0, G.particles.length - 40);

  // Screen shake
  if (G.shake > 0) {
    G.shakeX = (Math.random() - 0.5) * G.shake * 7;
    G.shakeY = (Math.random() - 0.5) * G.shake * 7;
    G.shake  -= 0.09;
  } else { G.shakeX = G.shakeY = 0; }

  // HUD
  const disp = G.score + (G.combo > 1 ? (G.combo - 1) * 3 : 0);
  document.getElementById('score-val').textContent = disp;
  document.getElementById('hi-val').textContent    = Math.max(G.hi, disp);

  const shield = document.getElementById('shield-pill');
  const slow   = document.getElementById('slow-pill');
  shield.style.display = G.shieldBar   > 0 ? 'flex' : 'none';
  slow.style.display   = G.slowActive  > 0 ? 'flex' : 'none';

  const cw = document.getElementById('combo-wrap');
  if (G.combo > 1) {
    document.getElementById('combo-val').textContent = 'x' + G.combo + ' COMBO!';
    cw.style.opacity = '1';
  } else {
    cw.style.opacity = '0';
  }
}

function triggerGameOver() {
  G.over = true; G.running = false;
  G.shake = 1.1;
  const p = G.player;
  burst(p.x + p.w / 2, p.y + p.h / 2, 16, '#7B7FFF');
  burst(p.x + p.w / 2, p.y + p.h / 2, 10, '#FF5F7E');
  sound('hit');
  const final = G.score + (G.combo > 1 ? (G.combo - 1) * 3 : 0);
  const isNew = final > G.hi;
  if (isNew) { G.hi = final; localStorage.setItem('neonDashHi', final); }
  setTimeout(() => {
    document.getElementById('go-score-val').textContent = final;
    document.getElementById('go-hi-val').innerHTML =
      isNew ? '<span class="go-new">★ NOVO RECORDE!</span>' : 'RECORDE: ' + G.hi;
    document.getElementById('gameover-screen').classList.remove('hidden');
    document.getElementById('pause-btn').style.display = 'none';
  }, 600);
}

// ─── DRAW ───────────────────────────────────────────────────────
function draw() {
  if (!G) return;

  ctx.save();
  if (G.shake > 0) ctx.translate(G.shakeX, G.shakeY);

  // BG — solid fill (no clearRect needed with alpha:false)
  ctx.fillStyle = '#07070f';
  ctx.fillRect(0, 0, W, H);

  // Stars (simple dots, no shadow)
  for (let i = 0; i < G.stars.length; i++) {
    const s = G.stars[i];
    ctx.globalAlpha = s.a;
    ctx.fillStyle   = '#ffffff';
    ctx.fillRect(s.x, s.y, s.r * 2, s.r * 2); // fillRect = faster than arc
  }
  ctx.globalAlpha = 1;

  // Ground
  ctx.fillStyle = '#111124';
  ctx.fillRect(0, G.GROUND, W, G.GH);

  // Ground line (no shadow)
  ctx.strokeStyle = 'rgba(123,127,255,0.7)';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, G.GROUND);
  ctx.lineTo(W, G.GROUND);
  ctx.stroke();

  // Ground grid (every other frame for perf)
  if (G.frame % 2 === 0) {
    const gOff = (G.frame * G.speed * 0.8) % 55;
    ctx.strokeStyle = 'rgba(123,127,255,0.06)';
    ctx.lineWidth   = 1;
    for (let gx = -gOff; gx < W; gx += 55) {
      ctx.beginPath();
      ctx.moveTo(gx, G.GROUND);
      ctx.lineTo(gx - 28, H);
      ctx.stroke();
    }
  }

  // Obstacles (no shadow)
  for (let i = 0; i < G.obstacles.length; i++) {
    const o = G.obstacles[i];
    ctx.fillStyle = o.col;
    roundRect(o.x, o.y, o.w, o.h, 5);
    ctx.fill();
    // simple shine
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    roundRect(o.x + 2, o.y + 2, o.w - 4, 7, 3);
    ctx.fill();
  }

  // Gems
  for (let i = 0; i < G.gems.length; i++) {
    const g = G.gems[i];
    if (!g.alive) continue;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.pulse * 0.4);
    ctx.fillStyle = '#FFD700';
    const r = g.r + Math.sin(g.pulse) * 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, 0);
    ctx.lineTo(0,  r); ctx.lineTo(-r * 0.7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Powerups
  for (let i = 0; i < G.powerups.length; i++) {
    const pw = G.powerups[i];
    if (!pw.alive) continue;
    const pulse = Math.sin(pw.pulse) * 2;
    ctx.strokeStyle = pw.col;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(pw.x, pw.y, pw.r + pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = pw.col + '33';
    ctx.fill();
    ctx.font         = '15px serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pw.label, pw.x, pw.y);
  }

  // Player trail (simple, no shadow)
  const p = G.player;
  for (let i = 0; i < p.trail.length; i++) {
    const pt = p.trail[i];
    const a  = pt.t * 0.35;
    if (a <= 0.02) continue;
    const sz = p.w * pt.t * 0.5;
    ctx.globalAlpha = a;
    ctx.fillStyle   = '#7B7FFF';
    roundRect(pt.x - sz / 2, pt.y - sz / 2, sz, sz * 1.5, 3);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Player
  const scaleX = p.sq > 1 ? 1 + (p.sq - 1) * 0.4 : p.sq;
  const scaleY = p.sq < 1 ? 2 - p.sq : 1 / scaleX;
  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h);
  ctx.scale(scaleX, scaleY);

  if (p.invincible > 0 && Math.floor(p.invincible / 3) % 2 === 0) ctx.globalAlpha = 0.35;

  // Shield ring
  if (G.shieldBar > 0) {
    ctx.strokeStyle = '#4FC3F7';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(0, -p.h * 0.5, p.w * 0.9, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Body
  ctx.fillStyle = '#7B7FFF';
  roundRect(-p.w / 2, -p.h, p.w, p.h, 7);
  ctx.fill();

  // Highlight stripe
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  roundRect(-p.w / 2 + 2, -p.h + 2, p.w - 4, 8, 3);
  ctx.fill();

  // Eye dot
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(p.w * 0.1, -p.h * 0.72, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  ctx.globalAlpha = 1;

  // Particles
  for (let i = 0; i < G.particles.length; i++) {
    const pt = G.particles[i];
    ctx.globalAlpha = Math.max(0, pt.life);
    ctx.fillStyle   = pt.col;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, Math.max(0.5, pt.r * pt.life), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Slow vignette
  if (G.slowActive > 0) {
    ctx.fillStyle = `rgba(179,157,219,${Math.min(G.slowActive / 40, 1) * 0.06})`;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

// ─── LOOP ───────────────────────────────────────────────────────
function loop() {
  update();
  draw();
  RAF = requestAnimationFrame(loop);
}

function startGame() {
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('gameover-screen').classList.add('hidden');
  document.getElementById('pause-btn').style.display = 'flex';
  setupLevel(false);
  G.running = true;
}

// ─── TOUCH INPUT ────────────────────────────────────────────────
let touchStartY = 0, touchTime = 0, lastTap = 0;

document.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.touches[0];
  touchStartY = t.clientY;
  touchTime   = Date.now();
  if (!G || !G.running || G.over || G.paused) return;
  const now    = Date.now();
  const double = now - lastTap < 230;
  lastTap = now;
  doJump(double && G.player.jumps === 0 ? DJUMP : null);
}, { passive: false });

document.addEventListener('touchend', e => {
  e.preventDefault();
  if (!G || !G.running || G.over || G.paused) return;
  const dy = touchStartY - e.changedTouches[0].clientY;
  const dt = Date.now() - touchTime;
  if (dy > 45 && dt < 280) doJump(SUPER);
}, { passive: false });

// Desktop fallback
document.addEventListener('mousedown', e => {
  if (e.target.closest('button')) return;
  if (!G || !G.running || G.over || G.paused) return;
  const now    = Date.now();
  const double = now - lastTap < 230;
  lastTap = now;
  doJump(double && G.player.jumps === 0 ? DJUMP : null);
});

// ─── BUTTONS ────────────────────────────────────────────────────
document.getElementById('start-btn').onclick   = startGame;
document.getElementById('restart-btn').onclick = startGame;

document.getElementById('pause-btn').onclick = () => {
  if (!G || !G.running) return;
  G.paused = true;
  document.getElementById('pause-screen').classList.remove('hidden');
};

document.getElementById('resume-btn').onclick = () => {
  G.paused = false;
  document.getElementById('pause-screen').classList.add('hidden');
};

// ─── INIT ───────────────────────────────────────────────────────
const savedHi = localStorage.getItem('neonDashHi') || '0';
if (savedHi !== '0') {
  document.getElementById('start-hi').textContent = 'RECORDE: ' + savedHi;
  document.getElementById('hi-val').textContent   = savedHi;
}

setupLevel(false);
loop(); // idle background
