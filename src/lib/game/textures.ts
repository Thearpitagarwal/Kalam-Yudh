// ============================================================
// Pen Fight — procedural canvas textures (zero asset weight)
// ============================================================

import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number, light: boolean) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(Math.random() * 255);
    ctx.fillStyle = light
      ? `rgba(${200 + Math.random() * 55 | 0},${180 + Math.random() * 40 | 0},${140 + Math.random() * 40 | 0},${alpha})`
      : `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

function toTex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Warm wooden desk top with planks, ink stains and carved initials */
export function woodDeskTexture(): THREE.CanvasTexture {
  const W = 1024, H = 544;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#b57e42');
  g.addColorStop(0.5, '#a8713a');
  g.addColorStop(1, '#96602c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // plank separations
  const planks = 6;
  for (let p = 0; p <= planks; p++) {
    const y = (H / planks) * p;
    ctx.fillStyle = 'rgba(70,40,14,0.55)';
    ctx.fillRect(0, y - 2, W, 4);
    ctx.fillStyle = 'rgba(255,220,170,0.18)';
    ctx.fillRect(0, y + 2, W, 2);
  }
  // grain streaks
  for (let i = 0; i < 380; i++) {
    const y = Math.random() * H;
    const len = 40 + Math.random() * 240;
    const x = Math.random() * W;
    ctx.strokeStyle = `rgba(${60 + Math.random() * 40 | 0},${35 + Math.random() * 25 | 0},10,${0.05 + Math.random() * 0.12})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + len * 0.3, y + (Math.random() - 0.5) * 6, x + len * 0.7, y + (Math.random() - 0.5) * 6, x + len, y);
    ctx.stroke();
  }
  // knots
  for (let i = 0; i < 7; i++) {
    const x = Math.random() * W, y = Math.random() * H, r = 6 + Math.random() * 14;
    const rad = ctx.createRadialGradient(x, y, 1, x, y, r);
    rad.addColorStop(0, 'rgba(60,32,10,0.8)');
    rad.addColorStop(0.5, 'rgba(90,55,22,0.4)');
    rad.addColorStop(1, 'rgba(90,55,22,0)');
    ctx.fillStyle = rad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // ink stains
  for (let i = 0; i < 4; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    ctx.fillStyle = `rgba(20,24,60,${0.12 + Math.random() * 0.18})`;
    ctx.beginPath();
    ctx.arc(x, y, 3 + Math.random() * 8, 0, Math.PI * 2);
    ctx.fill();
    for (let d = 0; d < 5; d++) {
      ctx.beginPath();
      ctx.arc(x + (Math.random() - 0.5) * 22, y + (Math.random() - 0.5) * 22, 1 + Math.random() * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // carved initials & doodles (classroom desk soul)
  ctx.strokeStyle = 'rgba(74,44,16,0.75)';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.font = '700 30px "Comic Sans MS", cursive';
  ctx.save();
  ctx.translate(W * 0.16, H * 0.78);
  ctx.rotate(-0.06);
  ctx.strokeText('A + S', 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(W * 0.78, H * 0.24);
  ctx.rotate(0.09);
  ctx.strokeText('10-B RULES', 0, 0);
  ctx.restore();
  // little heart
  ctx.save();
  ctx.translate(W * 0.6, H * 0.72);
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.bezierCurveTo(-14, -8, -4, -18, 0, -8);
  ctx.bezierCurveTo(4, -18, 14, -8, 0, 8);
  ctx.stroke();
  ctx.restore();
  // tally marks
  ctx.save();
  ctx.translate(W * 0.38, H * 0.18);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 12, 0);
    ctx.lineTo(i * 12 + 2, 26);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-4, 24);
  ctx.lineTo(50, 2);
  ctx.stroke();
  ctx.restore();
  grain(ctx, W, H, 2600, 0.05, false);
  return toTex(c);
}

/** Chalkboard with hand-drawn title & doodles */
export function chalkboardTexture(): THREE.CanvasTexture {
  const W = 1400, H = 760;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#1d4735';
  ctx.fillRect(0, 0, W, H);
  // smudged chalk haze
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * W, y = Math.random() * H, r = 30 + Math.random() * 90;
    const rad = ctx.createRadialGradient(x, y, 1, x, y, r);
    rad.addColorStop(0, 'rgba(240,240,230,0.045)');
    rad.addColorStop(1, 'rgba(240,240,230,0)');
    ctx.fillStyle = rad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(245,242,228,0.92)';
  ctx.fillStyle = 'rgba(245,242,228,0.92)';
  ctx.lineCap = 'round';

  // chalk wobble text helper
  const chalkText = (txt: string, x: number, y: number, size: number, rot = 0) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.font = `800 ${size}px "Comic Sans MS", cursive`;
    ctx.strokeStyle = 'rgba(245,242,228,0.28)';
    ctx.lineWidth = size * 0.14;
    ctx.strokeText(txt, 0, 0);
    ctx.fillStyle = 'rgba(245,242,228,0.9)';
    ctx.fillText(txt, 0, 0);
    ctx.restore();
  };

  chalkText('PEN FIGHT', 120, 180, 128, -0.015);
  ctx.save();
  ctx.strokeStyle = 'rgba(245,242,228,0.85)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(130, 215);
  ctx.bezierCurveTo(420, 245, 780, 200, 1010, 228);
  ctx.stroke();
  ctx.restore();

  chalkText('Class 10-B  ·  Lunch Break Championship', 130, 300, 44);
  chalkText('Knock the rival pen OFF the desk!', 130, 372, 40);
  chalkText('Hit = go again · First to 3 points wins', 130, 430, 36);

  // drawn pens shooting at each other
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,214,120,0.9)';
  ctx.save();
  ctx.translate(150, 560);
  ctx.rotate(-0.32);
  ctx.strokeRect(0, -12, 190, 24);
  ctx.beginPath();
  ctx.moveTo(190, -12);
  ctx.lineTo(230, 0);
  ctx.lineTo(190, 12);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,130,130,0.9)';
  ctx.save();
  ctx.translate(1210, 540);
  ctx.rotate(Math.PI + 0.25);
  ctx.strokeRect(0, -12, 190, 24);
  ctx.beginPath();
  ctx.moveTo(190, -12);
  ctx.lineTo(230, 0);
  ctx.lineTo(190, 12);
  ctx.stroke();
  ctx.restore();
  // motion dashes between
  ctx.strokeStyle = 'rgba(245,242,228,0.6)';
  ctx.lineWidth = 5;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(620 + i * 40, 470 - i * 6);
    ctx.lineTo(645 + i * 40, 468 - i * 6);
    ctx.stroke();
  }
  // stars & cricket doodle
  const star = (x: number, y: number, r: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? r : r * 0.45;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  };
  ctx.strokeStyle = 'rgba(245,242,228,0.85)';
  star(1150, 140, 34);
  star(1280, 210, 20);
  star(80, 640, 26);
  chalkText('no teachers allowed', 900, 690, 34, -0.02);
  grain(ctx, W, H, 1600, 0.04, false);
  return toTex(c);
}

/** Wall texture – warm cream with a green lower band (classic Indian classroom) */
export function wallTexture(): THREE.CanvasTexture {
  const W = 512, H = 512;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#efdfb9';
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, 2400, 0.05, false);
  // scuffs
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(120,95,60,${0.04 + Math.random() * 0.06})`;
    ctx.beginPath();
    ctx.ellipse(Math.random() * W, Math.random() * H, 8 + Math.random() * 30, 4 + Math.random() * 12, Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTex(c);
}

/** Floor with big geometric tiles */
export function floorTexture(): THREE.CanvasTexture {
  const W = 512, H = 512;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#c99e68';
  ctx.fillRect(0, 0, W, H);
  const sq = 128;
  for (let y = 0; y < H; y += sq) {
    for (let x = 0; x < W; x += sq) {
      const odd = ((x + y) / sq) % 2 === 0;
      ctx.fillStyle = odd ? '#d3a874' : '#c2925c';
      ctx.fillRect(x + 2, y + 2, sq - 4, sq - 4);
      ctx.fillStyle = 'rgba(255,235,200,0.12)';
      ctx.fillRect(x + 2, y + 2, sq - 4, 8);
    }
  }
  grain(ctx, W, H, 2600, 0.05, false);
  return toTex(c);
}

export type PosterKind = 'tables' | 'india' | 'planets';

export function posterTexture(kind: PosterKind): THREE.CanvasTexture {
  const W = 512, H = 680;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#f7efd9';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#2b3a67';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, W - 16, H - 16);

  if (kind === 'tables') {
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(24, 24, W - 48, 84);
    ctx.fillStyle = '#fff';
    ctx.font = '800 44px "Comic Sans MS", cursive';
    ctx.textAlign = 'center';
    ctx.fillText('TABLE OF 7', W / 2, 82);
    ctx.font = '700 34px "Comic Sans MS", cursive';
    ctx.fillStyle = '#1f2a44';
    for (let i = 1; i <= 10; i++) {
      const y = 140 + (i - 1) * 50;
      const col = i % 2 === 0 ? '#fdf6df' : '#f1e6c4';
      ctx.fillStyle = col;
      ctx.fillRect(28, y - 34, W - 56, 44);
      ctx.fillStyle = '#1f2a44';
      ctx.fillText(`7  x  ${i}  =  ${7 * i}`, W / 2, y);
    }
  } else if (kind === 'india') {
    ctx.fillStyle = '#fff7e6';
    ctx.fillRect(28, 28, W - 56, H - 56);
    // tricolor header
    ctx.fillStyle = '#f4923f';
    ctx.fillRect(28, 28, W - 56, 40);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(28, 68, W - 56, 40);
    ctx.fillStyle = '#1c8b3c';
    ctx.fillRect(28, 108, W - 56, 40);
    ctx.fillStyle = '#14438a';
    ctx.beginPath();
    ctx.arc(W / 2, 88, 16, 0, Math.PI * 2);
    ctx.strokeStyle = '#14438a';
    ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(W / 2, 88);
      ctx.lineTo(W / 2 + Math.cos(a) * 16, 88 + Math.sin(a) * 16);
      ctx.stroke();
    }
    ctx.fillStyle = '#1f2a44';
    ctx.font = '800 46px "Comic Sans MS", cursive';
    ctx.textAlign = 'center';
    ctx.fillText('INDIA', W / 2, 226);
    // simplified India silhouette
    ctx.fillStyle = '#f0a04b';
    ctx.strokeStyle = '#b96f22';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(190, 270);
    ctx.lineTo(250, 250);
    ctx.lineTo(330, 258);
    ctx.lineTo(372, 300);
    ctx.lineTo(352, 340);
    ctx.lineTo(360, 400);
    ctx.lineTo(322, 440);
    ctx.lineTo(300, 520);
    ctx.lineTo(272, 580);
    ctx.lineTo(246, 520);
    ctx.lineTo(220, 452);
    ctx.lineTo(172, 420);
    ctx.lineTo(196, 360);
    ctx.lineTo(158, 330);
    ctx.lineTo(150, 292);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1f2a44';
    ctx.font = '700 30px "Comic Sans MS", cursive';
    ctx.fillText('Unity in Diversity', W / 2, 640);
  } else {
    ctx.fillStyle = '#101a33';
    ctx.fillRect(28, 28, W - 56, H - 56);
    const sunG = ctx.createRadialGradient(W / 2, 150, 4, W / 2, 150, 54);
    sunG.addColorStop(0, '#ffe9a3');
    sunG.addColorStop(1, '#f59e0b');
    ctx.fillStyle = sunG;
    ctx.beginPath();
    ctx.arc(W / 2, 150, 46, 0, Math.PI * 2);
    ctx.fill();
    const planets = [
      ['#9ca3af', 10, 240], ['#e8b04b', 16, 310], ['#3b82f6', 17, 385],
      ['#ef4444', 13, 452], ['#e0a458', 26, 520], ['#e3c98f', 22, 592],
    ] as const;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    planets.forEach(([col, r, y]) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(W / 2 - 70, y as number, r as number, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#fff';
    ctx.font = '800 34px "Comic Sans MS", cursive';
    ctx.textAlign = 'left';
    ctx.fillText('THE SOLAR SYSTEM', 60, 64);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
      ctx.fillRect(34 + Math.random() * (W - 68), 34 + Math.random() * (H - 68), 2, 2);
    }
  }
  grain(ctx, W, H, 900, 0.04, false);
  return toTex(c);
}

/** Soft radial blob used for fake pen shadows / dust motes */
export function blobTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(30,18,8,0.55)');
  g.addColorStop(0.6, 'rgba(30,18,8,0.22)');
  g.addColorStop(1, 'rgba(30,18,8,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return toTex(c, false);
}

/** Paper scorecard texture (updated on score changes) */
export function makeScoreCard(): { tex: THREE.CanvasTexture; update: (a: number, b: number, n1: string, n2: string) => void } {
  const W = 512, H = 300;
  const [c, ctx] = canvas(W, H);
  const tex = toTex(c);
  const draw = (a: number, b: number, n1: string, n2: string) => {
    ctx.fillStyle = '#f8f1dc';
    ctx.fillRect(0, 0, W, H);
    // ruled lines
    ctx.strokeStyle = 'rgba(90,140,200,0.45)';
    ctx.lineWidth = 2;
    for (let y = 50; y < H; y += 42) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(220,90,90,0.5)';
    ctx.beginPath();
    ctx.moveTo(64, 0);
    ctx.lineTo(64, H);
    ctx.stroke();
    ctx.fillStyle = '#1d4ed8';
    ctx.font = '800 44px "Comic Sans MS", cursive';
    ctx.textAlign = 'left';
    ctx.fillText(n1, 84, 88);
    ctx.fillStyle = '#e11d48';
    ctx.fillText(n2, 84, 238);
    const marks = (x: number, y: number, n: number, col: string) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const gx = x + Math.floor(i / 5) * 66;
        const within = i % 5;
        if (within < 4) {
          ctx.beginPath();
          ctx.moveTo(gx + within * 14, y - 26);
          ctx.lineTo(gx + within * 14 + 3, y + 10);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(gx - 8, y + 8);
          ctx.lineTo(gx + 56, y - 24);
          ctx.stroke();
        }
      }
    };
    marks(84, 160, a, '#1d4ed8');
    marks(84, 292, b, '#e11d48');
    tex.needsUpdate = true;
  };
  draw(0, 0, 'YOU', 'RIVAL');
  return { tex, update: draw };
}
