// ============================================================
// Pen Fight — 2D rigid-body physics on the desk plane (XZ),
// plus off-edge falling with floor bounce.
// ============================================================

import { DESK, FLOOR_Y, PEN, PHYS } from './constants';

export type BodyState = 'desk' | 'falling' | 'rest';

export interface Body {
  id: number;
  x: number;
  z: number;
  y: number; // height above desk top (0 on desk)
  vx: number;
  vz: number;
  vy: number;
  angle: number; // yaw in XZ plane; long axis dir = (cos a, sin a)
  angVel: number;
  state: BodyState;
  hitContact: boolean; // made contact with the other pen during this sim
  invM: number;
  invI: number;
}

export interface ImpactEvent {
  x: number;
  z: number;
  power: number; // impulse magnitude
  aId: number;
  bId: number;
}

export function makeBody(id: number): Body {
  const m = PEN.MASS;
  const L = PEN.HALF_LEN * 2;
  const I = (m * L * L) / 12;
  return {
    id,
    x: 0,
    z: 0,
    y: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    angle: 0,
    angVel: 0,
    state: 'desk',
    hitContact: false,
    invM: 1 / m,
    invI: 1 / I,
  };
}

export function placeBody(b: Body, x: number, z: number, angle: number): void {
  b.x = x;
  b.z = z;
  b.y = 0;
  b.vx = 0;
  b.vy = 0;
  b.vz = 0;
  b.angle = angle;
  b.angVel = 0;
  b.state = 'desk';
  b.hitContact = false;
}

export function applyFlick(b: Body, angle: number, power: number): void {
  const spd = PHYS.MIN_FLICK + power * (PHYS.MAX_FLICK - PHYS.MIN_FLICK);
  b.vx = Math.cos(angle) * spd;
  b.vz = Math.sin(angle) * spd;
  // natural twist when flicking across the pen's axis
  const delta = Math.sin(b.angle - angle);
  b.angVel += delta * (1.2 + power * PHYS.FLICK_SPIN);
}

// -------- segment/segment closest points (Ericson 5.1.9) --------
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function segSegClosest(
  p1x: number, p1z: number, q1x: number, q1z: number,
  p2x: number, p2z: number, q2x: number, q2z: number,
  out: { c1x: number; c1z: number; c2x: number; c2z: number }
): number {
  const d1x = q1x - p1x, d1z = q1z - p1z;
  const d2x = q2x - p2x, d2z = q2z - p2z;
  const rx = p1x - p2x, rz = p1z - p2z;
  const a = d1x * d1x + d1z * d1z;
  const e = d2x * d2x + d2z * d2z;
  const f = d2x * rx + d2z * rz;
  const EPS = 1e-9;
  let s = 0, t = 0;
  if (a <= EPS && e <= EPS) {
    s = 0; t = 0;
  } else if (a <= EPS) {
    s = 0; t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1z * rz;
    if (e <= EPS) {
      t = 0; s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > EPS ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0; s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1; s = clamp01((b - c) / a);
      }
    }
  }
  const c1x = p1x + d1x * s, c1z = p1z + d1z * s;
  const c2x = p2x + d2x * t, c2z = p2z + d2z * t;
  out.c1x = c1x; out.c1z = c1z; out.c2x = c2x; out.c2z = c2z;
  const dx = c1x - c2x, dz = c1z - c2z;
  return Math.sqrt(dx * dx + dz * dz);
}

function bodyEnds(b: Body, out: { x1: number; z1: number; x2: number; z2: number }): void {
  const dx = Math.cos(b.angle) * PEN.HALF_LEN;
  const dz = Math.sin(b.angle) * PEN.HALF_LEN;
  out.x1 = b.x - dx;
  out.z1 = b.z - dz;
  out.x2 = b.x + dx;
  out.z2 = b.z + dz;
}

const _e1 = { x1: 0, z1: 0, x2: 0, z2: 0 };
const _e2 = { x1: 0, z1: 0, x2: 0, z2: 0 };
const _cp = { c1x: 0, c1z: 0, c2x: 0, c2z: 0 };

// -------- world step --------

export interface StepResult {
  impact: ImpactEvent | null; // strongest impact this step
  fellOff: Body | null;
  landed: Body | null; // hit the floor this step
  settled: Body | null; // came to rest on floor
}

const res: StepResult = { impact: null, fellOff: null, landed: null, settled: null };

export function stepWorld(bodies: Body[], dt: number): StepResult {
  res.impact = null;
  res.fellOff = null;
  res.landed = null;
  res.settled = null;

  const hx = DESK.W / 2;
  const hz = DESK.D / 2;
  const dampFactor = Math.exp(-PHYS.ANG_DAMP * dt);

  for (const b of bodies) {
    if (b.state === 'desk') {
      // linear friction (Coulomb-ish)
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0) {
        const nsp = Math.max(0, sp - PHYS.FRICTION * dt);
        const k = nsp / sp;
        b.vx *= k;
        b.vz *= k;
      }
      b.angVel *= dampFactor;
      if (Math.abs(b.angVel) < PHYS.STOP_W) b.angVel = 0;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.angle += b.angVel * dt;

      // off the edge?
      if (Math.abs(b.x) > hx + 0.02 || Math.abs(b.z) > hz + 0.02) {
        b.state = 'falling';
        b.vy = 0;
        // tumble off dramatically
        b.angVel += (Math.random() - 0.5) * 3;
        res.fellOff = b;
      }
    } else if (b.state === 'falling') {
      b.vy -= PHYS.GRAVITY * dt;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.y += b.vy * dt;
      b.angle += b.angVel * dt;
      const floorPenY = FLOOR_Y - DESK.TOP_Y + PEN.RADIUS;
      if (b.y <= floorPenY) {
        b.y = floorPenY;
        if (Math.abs(b.vy) > 1.4) {
          b.vy = -b.vy * PHYS.FLOOR_BOUNCE;
          b.vx *= 0.55;
          b.vz *= 0.55;
          b.angVel *= -0.45;
          res.landed = b;
        } else {
          b.vy = 0;
          b.state = 'rest';
          b.vx *= 0.2;
          b.vz *= 0.2;
          b.angVel = 0;
          res.landed = b;
          res.settled = b;
        }
      }
    } else {
      // rest on floor: bleed any residual slide
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.vx *= Math.exp(-8 * dt);
      b.vz *= Math.exp(-8 * dt);
    }
  }

  // pen-pen collision (only when both on the desk)
  const A = bodies[0];
  const B = bodies[1];
  if (A.state === 'desk' && B.state === 'desk') {
    bodyEnds(A, _e1);
    bodyEnds(B, _e2);
    const R = PEN.RADIUS * 2;
    // cheap broadphase
    const bdx = A.x - B.x, bdz = A.z - B.z;
    const broad = PEN.HALF_LEN * 2 + R;
    if (bdx * bdx + bdz * bdz < broad * broad) {
      const d = segSegClosest(
        _e1.x1, _e1.z1, _e1.x2, _e1.z2,
        _e2.x1, _e2.z1, _e2.x2, _e2.z2,
        _cp
      );
      if (d < R) {
        let nx = _cp.c1x - _cp.c2x;
        let nz = _cp.c1z - _cp.c2z;
        let len = d;
        if (len < 1e-6) {
          nx = A.x - B.x;
          nz = A.z - B.z;
          len = Math.hypot(nx, nz) || 1;
        }
        nx /= len;
        nz /= len;
        const pen = R - d;
        // positional correction
        A.x += nx * pen * 0.5;
        A.z += nz * pen * 0.5;
        B.x -= nx * pen * 0.5;
        B.z -= nz * pen * 0.5;

        const cpx = (_cp.c1x + _cp.c2x) * 0.5;
        const cpz = (_cp.c1z + _cp.c2z) * 0.5;
        const rax = cpx - A.x, raz = cpz - A.z;
        const rbx = cpx - B.x, rbz = cpz - B.z;

        // relative velocity at contact (v + w x r)
        const vax = A.vx + A.angVel * raz;
        const vaz = A.vz - A.angVel * rax;
        const vbx = B.vx + B.angVel * rbz;
        const vbz = B.vz - B.angVel * rbx;
        const rvx = vbx - vax;
        const rvz = vbz - vaz;
        const vn = rvx * nx + rvz * nz;

        if (vn < 0) {
          const crA = raz * nx - rax * nz;
          const crB = rbz * nx - rbx * nz;
          const denom =
            A.invM + B.invM + crA * crA * A.invI + crB * crB * B.invI;
          let e = PHYS.RESTITUTION;
          if (-vn < PHYS.CONTACT_EPS) e = 0;
          let j = (-(1 + e) * vn) / denom;
          // normal impulse
          A.vx -= nx * j * A.invM;
          A.vz -= nz * j * A.invM;
          A.angVel -= crA * j * A.invI;
          B.vx += nx * j * B.invM;
          B.vz += nz * j * B.invM;
          B.angVel += crB * j * B.invI;
          // friction impulse
          const tx = -nz, tz = nx;
          const vt = rvx * tx + rvz * tz;
          const crAt = raz * tx - rax * tz;
          const crBt = rbz * tx - rbx * tz;
          const denomT =
            A.invM + B.invM + crAt * crAt * A.invI + crBt * crBt * B.invI;
          let jt = -vt / Math.max(denomT, 1e-9);
          const maxF = Math.abs(j) * PHYS.FRICTION_IMPULSE;
          if (jt > maxF) jt = maxF;
          else if (jt < -maxF) jt = -maxF;
          A.vx -= tx * jt * A.invM;
          A.vz -= tz * jt * A.invM;
          A.angVel -= crAt * jt * A.invI;
          B.vx += tx * jt * B.invM;
          B.vz += tz * jt * B.invM;
          B.angVel += crBt * jt * B.invI;

          const power = Math.abs(j);
          if (power > 0.35) {
            A.hitContact = true;
            B.hitContact = true;
            res.impact = { x: cpx, z: cpz, power, aId: A.id, bId: B.id };
          }
        }
      }
    }
  }

  // clamp speeds
  for (const b of bodies) {
    if (b.state === 'desk') {
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > PHYS.MAX_SPEED) {
        const k = PHYS.MAX_SPEED / sp;
        b.vx *= k;
        b.vz *= k;
      }
    }
  }

  return res;
}

export function allStopped(bodies: Body[]): boolean {
  for (const b of bodies) {
    if (b.state === 'falling') return false;
    if (b.state === 'desk') {
      if (Math.hypot(b.vx, b.vz) > PHYS.STOP_V) return false;
      if (Math.abs(b.angVel) > PHYS.STOP_W) return false;
    } else if (b.state === 'rest') {
      if (Math.hypot(b.vx, b.vz) > 0.02) return false;
    }
  }
  return true;
}

export function stillCount(bodies: Body[]): number {
  let n = 0;
  for (const b of bodies) if (b.state !== 'desk') n++;
  return n;
}
