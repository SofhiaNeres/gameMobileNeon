
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W, H, dpr;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', () => { resize(); if(G && G.running) setupLevel(); });
resize();

// ─── AUDIO ───────────────────────────────────────────────────────
let AC;
function sound(type) {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(), g = AC.createGain();
    o.connect(g); g.connect(AC.destination);
    const t = AC.currentTime;
    const cfg = {
      jump:    () => { o.type='sine';    o.frequency.setValueAtTime(280,t); o.frequency.exponentialRampToValueAtTime(560,t+0.1); g.gain.setValueAtTime(0.12,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.18); o.start(t); o.stop(t+0.18); },
      djump:   () => { o.type='sine';    o.frequency.setValueAtTime(420,t); o.frequency.exponentialRampToValueAtTime(840,t+0.12); g.gain.setValueAtTime(0.14,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.2); o.start(t); o.stop(t+0.2); },
      gem:     () => { o.type='sine';    o.frequency.setValueAtTime(880,t); o.frequency.exponentialRampToValueAtTime(1320,t+0.08); g.gain.setValueAtTime(0.18,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.15); o.start(t); o.stop(t+0.15); },
      hit:     () => { o.type='sawtooth';o.frequency.setValueAtTime(160,t); o.frequency.exponentialRampToValueAtTime(40,t+0.35); g.gain.setValueAtTime(0.28,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.35); o.start(t); o.stop(t+0.35); },
      pow:     () => { o.type='sine';    o.frequency.setValueAtTime(440,t); o.frequency.exponentialRampToValueAtTime(1100,t+0.22); g.gain.setValueAtTime(0.2,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.25); o.start(t); o.stop(t+0.25); },
      land:    () => { o.type='square';  o.frequency.setValueAtTime(80,t); o.frequency.exponentialRampToValueAtTime(40,t+0.08); g.gain.setValueAtTime(0.06,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.1); o.start(t); o.stop(t+0.1); },
    };
    cfg[type] && cfg[type]();
  } catch(e) {}
}

// ─── GAME STATE ──────────────────────────────────────────────────
let G = null, RAF = null;

function setupLevel() {
  const GH = Math.min(H * 0.13, 95);
  const GROUND = H - GH;
  const PW = Math.min(W * 0.058, 30);
  const PH = PW * 1.5;
  const PX = W * 0.17;
  G = {
    running: false, paused: false, over: false,
    frame: 0,
    score: 0, scoreF: 0,
    hi: parseInt(localStorage.getItem('neonDashHi2') || '0'),
    speed: 5, baseSpeed: 5, maxSpeed: 16,
    GROUND, GH, PW, PH, PX,
    slowActive: 0, shieldBar: 0,
    shake: 0, shakeX: 0, shakeY: 0,
    combo: 0, comboTimer: 0,
    nextObs: 80, nextGem: 50, nextPow: 380,
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
    stars: Array.from({length:70}, () => ({
      x: Math.random()*W, y: Math.random()*GROUND*0.9,
      r: Math.random()*1.4+0.3,
      sp: Math.random()*0.4+0.1,
      a: Math.random()*0.5+0.15,
    })),
    bgStreaks: Array.from({length:6}, (_,i) => ({
      x: (W/6)*i, sp: 1+i*0.4, a: 0.025+i*0.008,
    })),
  };
}

// ─── PHYSICS ─────────────────────────────────────────────────────
const GRAV = 0.6, JUMP = -14, DJUMP = -15.5, SUPER = -18;

function doJump(force) {
  const p = G.player;
  if (p.jumps < p.maxJumps) {
    const f = force || (p.jumps === 0 ? JUMP : DJUMP);
    p.vy = f;
    p.jumps++;
    p.sq = 0.65; p.sqV = 0.09;
    burst(p.x+p.w/2, p.y+p.h, 10, '#7B7FFF', 'jump');
    sound(p.jumps > 1 ? 'djump' : 'jump');
  }
}

function burst(x, y, n, col, type) {
  for (let i = 0; i < n; i++) {
    const a = type === 'jump'
      ? Math.PI + (Math.random()-0.5)*1.5
      : Math.random()*Math.PI*2;
    const sp = type === 'explosion' ? Math.random()*7+2 : Math.random()*3.5+1;
    G.particles.push({
      x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp,
      life: 1, decay: 0.022+Math.random()*0.025,
      r: Math.random()*4+1.5, col,
    });
  }
}

function hit(ax,ay,aw,ah, bx,by,bw,bh) {
  return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by;
}

// ─── SPAWNERS ────────────────────────────────────────────────────
function spawnObs() {
  const types = [
    { w: Math.min(24,W*0.065), h: Math.min(H*0.1,65),  col: '#FF5F7E' },
    { w: Math.min(20,W*0.055), h: Math.min(H*0.15,95),  col: '#FF8C42' },
    { w: Math.min(38,W*0.1),   h: Math.min(H*0.07,45),  col: '#4ECDC4' },
    { w: Math.min(18,W*0.05),  h: Math.min(H*0.12,80),  col: '#E040FB' },
  ];
  const t = types[Math.floor(Math.random()*types.length)];
  G.obstacles.push({ x: W+20, y: G.GROUND-t.h, w: t.w, h: t.h, col: t.col });
  // chance of double
  if (G.score > 15 && Math.random() < 0.28) {
    const t2 = types[Math.floor(Math.random()*types.length)];
    G.obstacles.push({ x: W+20+t.w+Math.min(50,W*0.13), y: G.GROUND-t2.h, w: t2.w, h: t2.h, col: t2.col });
  }
}

function spawnGem() {
  const rows = [1.4, 2.6, 3.8];
  const row = rows[Math.floor(Math.random()*rows.length)];
  G.gems.push({ x: W+10, y: G.GROUND - G.PH*row, r: 8, pulse: Math.random()*Math.PI*2, alive: true });
}

function spawnPow() {
  const type = Math.random() < 0.5 ? 'shield' : 'slow';
  G.powerups.push({
    x: W+10, y: G.GROUND - G.PH*2.8,
    type, r: 14, pulse: 0, alive: true,
    col: type === 'shield' ? '#4FC3F7' : '#B39DDB',
    label: type === 'shield' ? '🛡' : '⏳',
  });
}

// ─── UPDATE ──────────────────────────────────────────────────────
function update() {
  if (!G || !G.running || G.paused || G.over) return;
  G.frame++;
  const sf = G.slowActive > 0 ? 0.38 : 1;
  if (G.slowActive > 0) G.slowActive--;

  G.speed = Math.min(G.maxSpeed, G.baseSpeed + G.scoreF * 0.055);
  const spd = G.speed * sf;

  // Player
  const p = G.player;
  p.vy += GRAV;
  p.y += p.vy;
  if (p.y >= G.GROUND - p.h) {
    const wasAir = p.jumps > 0 && p.vy > 4;
    p.y = G.GROUND - p.h;
    if (wasAir) { p.sq = 0.72; p.sqV = 0.12; sound('land'); }
    p.vy = 0; p.jumps = 0;
  }

  // Squash & stretch
  if (Math.abs(p.sq - 1) > 0.005) {
    p.sq += (1-p.sq)*0.2 + p.sqV;
    p.sqV -= 0.007;
    if (Math.abs(p.sq-1) < 0.01) { p.sq=1; p.sqV=0; }
  }

  // Trail
  p.trail.unshift({ x: p.x+p.w/2, y: p.y+p.h/2, t: 1 });
  if (p.trail.length > 14) p.trail.pop();
  p.trail.forEach(pt => pt.t -= 0.075);

  if (p.invincible > 0) p.invincible--;
  if (G.shieldBar > 0) G.shieldBar--;

  // Stars
  G.stars.forEach(s => { s.x -= s.sp * spd * 0.45; if (s.x < 0) s.x = W; });
  G.bgStreaks.forEach(s => { s.x -= s.sp * spd; if (s.x < -2) s.x = W; });

  // Score
  G.scoreF += spd * 0.038;
  G.score = Math.floor(G.scoreF);

  // Obstacles
  G.nextObs--;
  if (G.nextObs <= 0) {
    spawnObs();
    G.nextObs = Math.max(50, 120 - G.score*0.7) + Math.random()*45;
  }
  G.obstacles = G.obstacles.filter(o => {
    o.x -= spd;
    if (o.x+o.w < 0) return false;
    if (p.invincible === 0 && hit(p.x+4, p.y+4, p.w-8, p.h-8, o.x, o.y, o.w, o.h)) {
      if (G.shieldBar > 0) {
        G.shieldBar = 0; p.invincible = 45;
        burst(p.x+p.w/2, p.y+p.h/2, 22, '#4FC3F7', 'explosion');
        sound('pow');
      } else {
        triggerGameOver();
      }
    }
    return true;
  });

  // Gems
  G.nextGem--;
  if (G.nextGem <= 0) { spawnGem(); G.nextGem = 35+Math.random()*55; }
  G.gems = G.gems.filter(g => {
    g.x -= spd; g.pulse += 0.12;
    if (!g.alive || g.x+g.r < 0) return false;
    if (hit(p.x, p.y, p.w, p.h, g.x-g.r, g.y-g.r, g.r*2, g.r*2)) {
      g.alive = false;
      G.combo++; G.comboTimer = 110;
      G.scoreF += 5 + G.combo;
      burst(g.x, g.y, 14, '#FFD700', 'explosion');
      sound('gem');
      return false;
    }
    return g.alive;
  });

  // Combo decay
  if (G.comboTimer > 0) G.comboTimer--; else G.combo = 0;

  // Powerups
  G.nextPow--;
  if (G.nextPow <= 0) { spawnPow(); G.nextPow = 320+Math.random()*200; }
  G.powerups = G.powerups.filter(pw => {
    pw.x -= spd; pw.pulse += 0.09;
    if (!pw.alive || pw.x+pw.r < 0) return false;
    if (hit(p.x, p.y, p.w, p.h, pw.x-pw.r, pw.y-pw.r, pw.r*2, pw.r*2)) {
      pw.alive = false;
      if (pw.type === 'shield') G.shieldBar = 210;
      else G.slowActive = 210;
      burst(pw.x, pw.y, 20, pw.col, 'explosion');
      sound('pow');
      return false;
    }
    return pw.alive;
  });

  // Particles
  G.particles = G.particles.filter(pt => {
    pt.x += pt.vx*sf; pt.y += pt.vy*sf; pt.vy += 0.18;
    pt.life -= pt.decay;
    return pt.life > 0;
  });

  // Shake
  if (G.shake > 0) {
    G.shakeX = (Math.random()-0.5)*G.shake*9;
    G.shakeY = (Math.random()-0.5)*G.shake*9;
    G.shake -= 0.07;
  } else { G.shakeX = G.shakeY = 0; }

  // UI
  const disp = G.score + (G.combo > 1 ? (G.combo-1)*3 : 0);
  document.getElementById('score-val').textContent = disp;
  document.getElementById('hi-val').textContent = Math.max(G.hi, disp);

  const shield = document.getElementById('shield-pill');
  const slow = document.getElementById('slow-pill');
  shield.style.display = G.shieldBar > 0 ? 'flex' : 'none';
  slow.style.display = G.slowActive > 0 ? 'flex' : 'none';

  const cw = document.getElementById('combo-wrap');
  if (G.combo > 1) {
    document.getElementById('combo-val').textContent = 'x'+G.combo+' COMBO!';
    cw.style.opacity = '1';
  } else {
    cw.style.opacity = '0';
  }
}

function triggerGameOver() {
  G.over = true; G.running = false;
  G.shake = 1.2;
  const p = G.player;
  burst(p.x+p.w/2, p.y+p.h/2, 35, '#7B7FFF', 'explosion');
  burst(p.x+p.w/2, p.y+p.h/2, 20, '#FF5F7E', 'explosion');
  sound('hit');
  const final = G.score + (G.combo > 1 ? (G.combo-1)*3 : 0);
  const isNew = final > G.hi;
  if (isNew) { G.hi = final; localStorage.setItem('neonDashHi2', final); }
  // Extra draw frames before showing overlay
  setTimeout(() => {
    const gs = document.getElementById('gameover-screen');
    document.getElementById('go-score-val').textContent = final;
    document.getElementById('go-hi-val').innerHTML =
      isNew
        ? '<span class="go-new">★ NOVO RECORDE!</span>'
        : 'RECORDE: ' + G.hi;
    gs.classList.remove('hidden');
    document.getElementById('pause-btn').style.display = 'none';
  }, 650);
}

// ─── DRAW ─────────────────────────────────────────────────────────
function draw() {
  if (!G) return;
  ctx.save();
  ctx.translate(G.shakeX||0, G.shakeY||0);

  // BG
  ctx.fillStyle = '#07070f';
  ctx.fillRect(0, 0, W, H);

  // Stars
  G.stars.forEach(s => {
    ctx.globalAlpha = s.a;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Speed streaks
  G.bgStreaks.forEach(s => {
    ctx.strokeStyle = `rgba(123,127,255,${s.a})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s.x, 0);
    ctx.lineTo(s.x, G.GROUND);
    ctx.stroke();
  });

  // Ground fill
  ctx.fillStyle = '#111124';
  ctx.fillRect(0, G.GROUND, W, G.GH);

  // Ground glow line
  ctx.shadowColor = '#7B7FFF';
  ctx.shadowBlur = 12;
  ctx.strokeStyle = 'rgba(123,127,255,0.65)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, G.GROUND);
  ctx.lineTo(W, G.GROUND);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Ground grid
  const gOff = (G.frame * G.speed * 0.8) % 55;
  for (let gx = -gOff; gx < W; gx += 55) {
    ctx.strokeStyle = 'rgba(123,127,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx, G.GROUND);
    ctx.lineTo(gx - 28, H);
    ctx.stroke();
  }

  // Obstacles
  G.obstacles.forEach(o => {
    ctx.shadowColor = o.col;
    ctx.shadowBlur = 14;
    ctx.fillStyle = o.col;
    roundRect(o.x, o.y, o.w, o.h, 5);
    ctx.fill();
    // shine
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(o.x+2, o.y+2, o.w-4, 9, 3);
    ctx.fill();
  });
  ctx.shadowBlur = 0;

  // Gems (diamond shape)
  G.gems.forEach(g => {
    if (!g.alive) return;
    const pulse = Math.sin(g.pulse)*2;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.pulse * 0.4);
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 14+pulse;
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    const r = g.r + pulse*0.5;
    ctx.moveTo(0, -r); ctx.lineTo(r*0.7, 0);
    ctx.lineTo(0, r); ctx.lineTo(-r*0.7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
  ctx.shadowBlur = 0;

  // Powerups
  G.powerups.forEach(pw => {
    if (!pw.alive) return;
    const pulse = Math.sin(pw.pulse)*2.5;
    ctx.shadowColor = pw.col;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = pw.col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pw.x, pw.y, pw.r+pulse, 0, Math.PI*2);
    ctx.stroke();
    ctx.fillStyle = pw.col+'33';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = '16px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pw.label, pw.x, pw.y);
  });
  ctx.shadowBlur = 0;

  // Player trail
  const p = G.player;
  p.trail.forEach(pt => {
    const a = pt.t * 0.45;
    if (a <= 0) return;
    const sz = p.w * pt.t * 0.55;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#7B7FFF';
    roundRect(pt.x-sz/2, pt.y-sz/2, sz, sz*1.5, 4);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Player
  const scaleX = p.sq > 1 ? 1+(p.sq-1)*0.4 : p.sq;
  const scaleY = p.sq < 1 ? 2-p.sq : 1/scaleX;
  ctx.save();
  ctx.translate(p.x+p.w/2, p.y+p.h);
  ctx.scale(scaleX, scaleY);

  if (p.invincible > 0 && Math.floor(p.invincible/3)%2===0) ctx.globalAlpha = 0.35;

  // Shield ring
  if (G.shieldBar > 0) {
    ctx.shadowColor = '#4FC3F7';
    ctx.shadowBlur = 22;
    ctx.strokeStyle = '#4FC3F7';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, -p.h*0.5, p.w*0.92, 0, Math.PI*2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Body
  ctx.shadowColor = '#7B7FFF';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#7B7FFF';
  roundRect(-p.w/2, -p.h, p.w, p.h, 7);
  ctx.fill();

  // Face dot
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(p.w*0.1, -p.h*0.72, 3.5, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // Particles
  G.particles.forEach(pt => {
    ctx.globalAlpha = Math.max(0, pt.life);
    ctx.fillStyle = pt.col;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, Math.max(0.1, pt.r*pt.life), 0, Math.PI*2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Slow vignette
  if (G.slowActive > 0) {
    ctx.fillStyle = `rgba(179,157,219,${Math.min(G.slowActive/40,1)*0.07})`;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

// ─── LOOP ────────────────────────────────────────────────────────
function loop() {
  update();
  draw();
  RAF = requestAnimationFrame(loop);
}

function startGame() {
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('gameover-screen').classList.add('hidden');
  document.getElementById('pause-btn').style.display = 'flex';
  setupLevel();
  G.running = true;
  if (!RAF) loop();
}

// ─── TOUCH INPUT ─────────────────────────────────────────────────
let touchStartY = 0, touchTime = 0, lastTap = 0;

document.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.touches[0];
  touchStartY = t.clientY;
  touchTime = Date.now();
  if (!G || !G.running || G.over || G.paused) return;
  const now = Date.now();
  const double = (now - lastTap) < 230;
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

// Mouse fallback (desktop testing)
document.addEventListener('mousedown', e => {
  if (e.target.closest('button') || e.target.closest('#pause-btn')) return;
  if (!G || !G.running || G.over || G.paused) return;
  const now = Date.now();
  const double = (now - lastTap) < 230;
  lastTap = now;
  doJump(double && G.player.jumps === 0 ? DJUMP : null);
});

// ─── BUTTONS ─────────────────────────────────────────────────────
document.getElementById('start-btn').onclick = startGame;
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

// ─── INIT ────────────────────────────────────────────────────────
const savedHi = localStorage.getItem('neonDashHi2') || '0';
if (savedHi !== '0') {
  document.getElementById('start-hi').textContent = 'RECORDE: ' + savedHi;
  document.getElementById('hi-val').textContent = savedHi;
}

setupLevel();
loop(); // draw idle BG
