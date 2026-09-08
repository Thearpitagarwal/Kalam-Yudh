// ============================================================
// Pen Fight — juice: particles, impact rings, screen shake,
// speed streaks. All pooled, zero per-frame allocation.
// ============================================================

import * as THREE from 'three';

// ---------------- chalk dust particle system ----------------

const MAX_P = 480;

export class DustSystem {
  points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array; // xyz per particle
  private life: Float32Array; // remaining
  private maxLife: Float32Array;
  private grav: Float32Array;
  private head = 0;
  private mat: THREE.PointsMaterial;

  constructor() {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX_P * 3);
    this.col = new Float32Array(MAX_P * 3);
    this.vel = new Float32Array(MAX_P * 3);
    this.life = new Float32Array(MAX_P);
    this.maxLife = new Float32Array(MAX_P);
    this.grav = new Float32Array(MAX_P);
    for (let i = 0; i < MAX_P; i++) {
      this.pos[i * 3 + 1] = -999;
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.PointsMaterial({
      size: 0.11,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }

  spawn(x: number, y: number, z: number, count: number, spread: number, up: number, r: number, g: number, b: number, gravity = 9, lifeMul = 1): void {
    for (let n = 0; n < count; n++) {
      const i = this.head;
      this.head = (this.head + 1) % MAX_P;
      const a = Math.random() * Math.PI * 2;
      const rad = Math.random() * spread;
      this.pos[i * 3] = x + Math.cos(a) * rad * 0.3;
      this.pos[i * 3 + 1] = y + Math.random() * 0.06;
      this.pos[i * 3 + 2] = z + Math.sin(a) * rad * 0.3;
      this.vel[i * 3] = Math.cos(a) * spread * (0.5 + Math.random());
      this.vel[i * 3 + 1] = up * (0.4 + Math.random() * 0.9);
      this.vel[i * 3 + 2] = Math.sin(a) * spread * (0.5 + Math.random());
      const shade = 0.75 + Math.random() * 0.25;
      this.col[i * 3] = r * shade;
      this.col[i * 3 + 1] = g * shade;
      this.col[i * 3 + 2] = b * shade;
      const life = (0.35 + Math.random() * 0.5) * lifeMul;
      this.life[i] = life;
      this.maxLife[i] = life;
      this.grav[i] = gravity;
    }
  }

  update(dt: number): void {
    if (dt <= 0) return;
    for (let i = 0; i < MAX_P; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -999;
        continue;
      }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.vel[i * 3] *= 1 - 2.2 * dt;
      this.vel[i * 3 + 2] *= 1 - 2.2 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02 && this.vel[i * 3 + 1] < 0) {
        this.vel[i * 3 + 1] *= -0.3;
        this.pos[i * 3 + 1] = 0.02;
      }
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ---------------- expanding impact rings ----------------

const RING_POOL = 5;

export class RingSystem {
  group: THREE.Group;
  private rings: { mesh: THREE.Mesh; t: number; max: number; strength: number }[] = [];

  constructor() {
    this.group = new THREE.Group();
    const geo = new THREE.RingGeometry(0.8, 1, 40);
    for (let i = 0; i < RING_POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: '#fff6dc',
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.group.add(m);
      this.rings.push({ mesh: m, t: 1e9, max: 0.5, strength: 1 });
    }
  }

  spawn(x: number, z: number, strength: number, color?: string): void {
    const r = this.rings.reduce((a, b) => (a.t / a.max > b.t / b.max ? b : a));
    r.t = 0;
    r.max = 0.45;
    r.strength = strength;
    r.mesh.position.set(x, 0.03, z);
    (r.mesh.material as THREE.MeshBasicMaterial).color.set(color ?? '#fff6dc');
    r.mesh.visible = true;
  }

  update(dt: number): void {
    for (const r of this.rings) {
      if (r.t >= r.max) {
        r.mesh.visible = false;
        continue;
      }
      r.t += dt;
      const k = Math.min(1, r.t / r.max);
      const s = 0.25 + k * (1.5 + r.strength * 1.6);
      r.mesh.scale.setScalar(s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.85;
    }
  }
}

// ---------------- trauma-based screen shake ----------------

export class Shake {
  trauma = 0;
  private t = 0;
  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }
  /** returns offset + roll; decays trauma */
  sample(dt: number): { x: number; y: number; roll: number } {
    this.t += dt * 34;
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    const s = this.trauma * this.trauma;
    const n = (f: number, ph: number) => Math.sin(this.t * f + ph) * Math.cos(this.t * f * 1.37 + ph * 2.1);
    return {
      x: n(1.9, 0.4) * s * 0.55,
      y: n(2.3, 2.2) * s * 0.4,
      roll: n(1.5, 4.1) * s * 0.035,
    };
  }
}

// ---------------- speed streaks behind fast pens ----------------

const STREAKS_PER_PEN = 3;

export class Streaks {
  group: THREE.Group;
  private lines: { mesh: THREE.Mesh; pen: number; slot: number }[] = [];

  constructor() {
    this.group = new THREE.Group();
    for (let p = 0; p < 2; p++) {
      for (let s = 0; s < STREAKS_PER_PEN; s++) {
        const geo = new THREE.PlaneGeometry(1, 0.05);
        const mat = new THREE.MeshBasicMaterial({
          color: p === 0 ? '#93c5fd' : '#fda4af',
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        });
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2;
        this.group.add(m);
        this.lines.push({ mesh: m, pen: p, slot: s });
      }
    }
  }

  /** update from pen states */
  sync(pens: { x: number; z: number; y: number; vx: number; vz: number; onDesk: boolean }[]): void {
    for (const l of this.lines) {
      const p = pens[l.pen];
      const sp = Math.hypot(p.vx, p.vz);
      const mat = l.mesh.material as THREE.MeshBasicMaterial;
      if (!p.onDesk || sp < 5) {
        mat.opacity = 0;
        continue;
      }
      const dir = Math.atan2(p.vz, p.vx);
      const k = Math.min(1, (sp - 5) / 9);
      const off = (l.slot - 1) * 0.16;
      const ox = Math.cos(dir + Math.PI / 2) * off;
      const oz = Math.sin(dir + Math.PI / 2) * off;
      const len = 0.5 + k * 1.6;
      l.mesh.position.set(p.x - Math.cos(dir) * (0.7 + len * 0.38) + ox, 0.09 + p.y, p.z - Math.sin(dir) * (0.7 + len * 0.38) + oz);
      l.mesh.rotation.z = -dir;
      l.mesh.scale.set(len, 1, 1);
      mat.opacity = k * (0.55 - l.slot * 0.12);
    }
  }
}
