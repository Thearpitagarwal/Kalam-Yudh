// ============================================================
// Pen Fight — shared constants & physics tuning
// ============================================================

export const DESK = {
  W: 12, // x extent
  D: 6.4, // z extent
  TOP_Y: 0,
  THICK: 0.42,
  LEG_H: 3.4,
};
export const FLOOR_Y = -(DESK.THICK + DESK.LEG_H); // -3.82

export const PEN = {
  RADIUS: 0.13,
  HALF_LEN: 0.95,
  MASS: 1,
};

// physics tuning (units/sec)
export const PHYS = {
  FRICTION: 4.6, // linear deceleration on desk
  ANG_DAMP: 2.4, // exponential angular damping /s
  RESTITUTION: 0.58,
  CONTACT_EPS: 0.5, // restitution killed below this approach speed
  FRICTION_IMPULSE: 0.32, // tangential friction coefficient at contacts
  MAX_SPEED: 15.5,
  MIN_FLICK: 2.6,
  MAX_FLICK: 14.2,
  FLICK_SPIN: 4.2,
  STOP_V: 0.09,
  STOP_W: 0.3,
  GRAVITY: 22,
  FLOOR_BOUNCE: 0.34,
  STEP: 1 / 120,
  MAX_DRAG: 3.4, // world units of pull for full power
  WIN_SCORE: 3,
  SPAWN_X: 3.3,
};

export const COLORS = {
  penA: '#2563eb', // blue gel pen
  penADark: '#1e3a8a',
  penB: '#f43f5e', // red pen
  penBDark: '#881337',
  metal: '#d7dce4',
  wood: '#a8713a',
  woodDark: '#7a4e22',
  board: '#22503c',
  chalk: '#f5f1e3',
  wall: '#e8d9b8',
  floor: '#cfa878',
};

export const DIFFICULTY = [
  {
    id: 0,
    label: '2nd Period',
    sub: 'Easy',
    aiName: 'Chotu',
    aimSigma: 0.16,
    powSigma: 0.22,
    thinkMs: 950,
  },
  {
    id: 1,
    label: 'Lunch Break',
    sub: 'Normal',
    aiName: 'Ravi',
    aimSigma: 0.09,
    powSigma: 0.13,
    thinkMs: 750,
  },
  {
    id: 2,
    label: 'Exam Season',
    sub: 'Hard',
    aiName: 'Headmaster',
    aimSigma: 0.045,
    powSigma: 0.07,
    thinkMs: 560,
  },
] as const;

export type Mode = 'cpu' | 'local' | 'online';

export const MSG = {
  HIT: 'HIT! Go again',
  MISS: 'Miss! Turn passes',
  YOUR_TURN: 'Your turn — pull back & release',
  KNOCKOUT: 'KNOCKOUT!',
  SELF_KO: 'Own goal!',
};

export const STORAGE = {
  scores: 'pf_scores_v1',
  streak: 'pf_streak_v1',
  muted: 'pf_muted_v1',
  name: 'pf_name_v1',
};
