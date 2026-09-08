// ============================================================
// Pen Fight — game engine. Owns the three.js scene, physics,
// input (pointer + keyboard), turn state machine, AI, juice
// (shake/particles/slomo), and online host-authoritative sync.
// ============================================================

import * as THREE from 'three';
import { COLORS, DESK, DIFFICULTY, Mode, PEN, PHYS } from './constants';
import { buildClassroom, Classroom } from './classroom';
import { buildPen, PenRig } from './pen';
import {
  allStopped,
  applyFlick,
  Body,
  makeBody,
  placeBody,
  stepWorld,
} from './physics';
import { DustSystem, RingSystem, Shake, Streaks } from './effects';
import { Sfx } from './audio';
import { NetClient } from './net';
import { getStreak, qualifies, setStreak } from '@/lib/scores';

export type GamePhase = 'menu' | 'aiming' | 'flying' | 'settling' | 'roundwait' | 'over';
export type ToastKind = 'hit' | 'miss' | 'ko' | 'info' | 'streak';

export interface TurnInfo {
  turn: number;
  canInput: boolean;
  label: string;
  sub: string;
}

export interface GameOverResult {
  winnerIdx: number;
  winnerName: string;
  mode: Mode;
  flicks: [number, number];
  hits: [number, number];
  winStreak: number; // current streak vs cpu (0 otherwise)
  streakToSubmit: number | null; // streak that ended & qualifies for board
  kos: [number, number];
}

export interface NetStatus {
  status: 'idle' | 'connecting' | 'waiting' | 'paired' | 'error' | 'left';
  code?: string;
  error?: string;
}

export interface EngineEvents {
  onPhase: (p: GamePhase) => void;
  onScores: (a: number, b: number) => void;
  onTurn: (t: TurnInfo) => void;
  onToast: (text: string, kind: ToastKind) => void;
  onCharge: (power: number | null, label?: string) => void;
  onPause: (paused: boolean) => void;
  onGameOver: (r: GameOverResult) => void;
  onNetStatus: (s: NetStatus) => void;
}

const PEN_COLORS = [COLORS.penA, COLORS.penB];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dampAlpha = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class GameEngine {
  private container: HTMLElement;
  private events: EngineEvents;

  // three
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private classroom!: Classroom;
  private dirLight!: THREE.DirectionalLight;

  // game objects
  private bodies: [Body, Body] = [makeBody(0), makeBody(1)];
  private pens: PenRig[] = [];
  private dust = new DustSystem();
  private rings = new RingSystem();
  private shakeFx = new Shake();
  private streakFx = new Streaks();
  private aimGroup = new THREE.Group();
  private aimShaft!: THREE.Mesh;
  private aimHead!: THREE.Mesh;
  private aimRing!: THREE.Mesh;
  private aimDots: THREE.Mesh[] = [];
  private turnRing!: THREE.Mesh;

  // state
  phase: GamePhase = 'menu';
  private paused = false;
  private mode: Mode = 'cpu';
  private difficulty = 1;
  private myIndex = 0;
  private scores: [number, number] = [0, 0];
  private turn = 0;
  private names: [string, string] = ['YOU', 'RIVAL'];
  private kos: [number, number] = [0, 0];
  private flicks: [number, number] = [0, 0];
  private hits: [number, number] = [0, 0];
  private chainHits = 0;
  private matchRunning = false;

  // timing
  private timeScale = 1;
  private targetTimeScale = 1;
  private slowmoHold = 0;
  private physAcc = 0;
  private stillSteps = 0;
  private roundTimer = -1; // countdown to next round
  private elapsed = 0;

  // input
  private dragging = false;
  private pointerId = -1;
  private aimAngle = 0;
  private aimPower = 0;
  private showingAim = false;
  private usingKeys = false;
  private keys = { left: false, right: false, up: false, down: false };
  private charging = false;
  private chargePhase = 0;
  private chargePower = 0;
  private lastChargeBeep = 0;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pointerWorld = new THREE.Vector3();
  private pointerDownAt = 0;

  // AI
  private aiTimer = -1;
  private aiPlan = { angle: 0, power: 0.5, think: 800 };
  private aiChargeT = 0;

  // camera rig
  private camPos = new THREE.Vector3(0, 8.8, 10.4);
  private camTarget = new THREE.Vector3(0, -0.2, -0.6);
  private camPosGoal = new THREE.Vector3(0, 8.8, 10.4);
  private camTargetGoal = new THREE.Vector3(0, -0.2, -0.6);
  private fovKick = 0;
  private baseFov = 46;

  // net
  private net: NetClient | null = null;
  private snapTimer = 0;
  private guestTargets: { x: number; z: number; y: number; angle: number }[] | null = null;
  private lastNetTurn = 0;
  private lastNetScores: [number, number] = [0, 0];

  private sfx = new Sfx();
  private disposed = false;
  private lastClack = 0;
  private resizeObs: ResizeObserver | null = null;

  constructor(container: HTMLElement, events: EngineEvents) {
    this.container = container;
    this.events = events;
    this.initThree();
    this.buildWorld();
    this.buildAimHelpers();
    this.attachInput();
    // menu ambiance: pens resting on desk
    placeBody(this.bodies[0], -PHYS.SPAWN_X, 0.4, Math.PI / 2 + 0.35);
    placeBody(this.bodies[1], PHYS.SPAWN_X, -0.4, -Math.PI / 2 - 0.2);
    this.syncPenMeshes(0);
    this.classroom.scoreCard.update(0, 0, 'PEN', 'FIGHT');
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  // ================= scene setup =================

  private initThree(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.display = 'block';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#f2ddba');
    this.scene.fog = new THREE.Fog('#f2ddba', 22, 46);

    this.camera = new THREE.PerspectiveCamera(this.baseFov, w / h, 0.1, 120);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    const hemi = new THREE.HemisphereLight('#fff3da', '#b98553', 0.85);
    this.scene.add(hemi);

    this.dirLight = new THREE.DirectionalLight('#ffe0ae', 1.75);
    this.dirLight.position.set(9, 11, 4);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(1024, 1024);
    this.dirLight.shadow.camera.left = -8;
    this.dirLight.shadow.camera.right = 8;
    this.dirLight.shadow.camera.top = 7;
    this.dirLight.shadow.camera.bottom = -7;
    this.dirLight.shadow.camera.near = 2;
    this.dirLight.shadow.camera.far = 30;
    this.dirLight.shadow.bias = -0.002;
    this.scene.add(this.dirLight);

    const fill = new THREE.DirectionalLight('#cfe4ff', 0.35);
    fill.position.set(-8, 7, 10);
    this.scene.add(fill);

    const boardGlow = new THREE.PointLight('#ffedd0', 0.35, 24);
    boardGlow.position.set(0, 5, -6);
    this.scene.add(boardGlow);

    this.resizeObs = new ResizeObserver(() => {
      const cw = this.container.clientWidth;
      const ch = this.container.clientHeight;
      if (cw === 0 || ch === 0) return;
      this.camera.aspect = cw / ch;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(cw, ch);
    });
    this.resizeObs.observe(this.container);
  }

  private buildWorld(): void {
    this.classroom = buildClassroom();
    this.scene.add(this.classroom.group);

    const penA = buildPen(COLORS.penA, COLORS.penADark);
    const penB = buildPen(COLORS.penB, COLORS.penBDark);
    this.pens = [penA, penB];
    this.scene.add(penA.group, penB.group);

    this.scene.add(this.dust.points);
    this.scene.add(this.rings.group);
    this.scene.add(this.streakFx.group);
  }

  private buildAimHelpers(): void {
    const aimMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false });
    // shaft
    this.aimShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 8), aimMat);
    this.aimShaft.rotation.z = Math.PI / 2;
    this.aimShaft.rotation.order = 'YXZ';
    // head (cone); local +Y tipped to +X so yaw aims it
    this.aimHead = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 10), aimMat.clone());
    this.aimHead.rotation.order = 'YXZ';
    this.aimHead.rotation.z = -Math.PI / 2;
    // base ring under pen
    this.aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.52, 32),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
    );
    this.aimRing.rotation.x = -Math.PI / 2;
    this.aimGroup.add(this.aimShaft, this.aimHead, this.aimRing);
    // dotted preview
    const dotGeo = new THREE.CircleGeometry(0.055, 10);
    for (let i = 0; i < 7; i++) {
      const d = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: '#fff8e6', transparent: true, opacity: 0.8 - i * 0.09, depthWrite: false }));
      d.rotation.x = -Math.PI / 2;
      this.aimGroup.add(d);
      this.aimDots.push(d);
    }
    this.aimGroup.visible = false;
    this.aimGroup.renderOrder = 5;
    this.scene.add(this.aimGroup);

    this.turnRing = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.85, 32),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
    );
    this.turnRing.rotation.x = -Math.PI / 2;
    this.turnRing.visible = false;
    this.scene.add(this.turnRing);
  }

  // ================= input =================

  private onPointerDown = (e: PointerEvent) => {
    this.sfx.unlock();
    if (!this.canHumanInput()) return;
    if (this.dragging || this.charging) return;
    this.dragging = true;
    this.pointerId = e.pointerId;
    this.usingKeys = false;
    this.pointerDownAt = performance.now();
    this.updatePointer(e);
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    this.updatePointer(e);
    e.preventDefault();
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.pointerId = -1;
    if (this.aimPower > 0.1) {
      this.commitFlick(this.aimAngle, this.aimPower);
    } else {
      this.hideAim();
      this.events.onCharge(null);
    }
  };

  private updatePointer(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.plane, hit)) {
      this.pointerWorld.copy(hit);
      const pen = this.bodies[this.turn];
      const dx = pen.x - hit.x;
      const dz = pen.z - hit.z;
      const len = Math.hypot(dx, dz);
      this.aimAngle = Math.atan2(dz, dx);
      this.aimPower = clamp(len / PHYS.MAX_DRAG, 0, 1);
      this.showingAim = len > 0.3;
      this.events.onCharge(this.aimPower, 'Release to flick');
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar'].includes(e.key)) {
        this.trackKey(e.key, true);
        e.preventDefault();
      }
      return;
    }
    this.sfx.unlock();
    const k = e.key;
    if (k === 'Escape' || k === 'p' || k === 'P') {
      if (this.phase !== 'menu' && this.phase !== 'over' && this.matchRunning) {
        this.setPaused(!this.paused);
      }
      return;
    }
    if (!this.canHumanInput()) return;
    if (this.trackKey(k, true)) {
      this.usingKeys = true;
      if (!this.showingAim && !this.charging) {
        this.showingAim = true;
        // default aim: toward the rival pen
        const me = this.bodies[this.turn];
        const opp = this.bodies[1 - this.turn];
        this.aimAngle = Math.atan2(opp.z - me.z, opp.x - me.x);
        this.aimPower = Math.max(this.aimPower, 0.35);
      }
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key;
    if ((k === ' ' || k === 'Spacebar') && this.charging) {
      this.charging = false;
      if (this.canHumanInput()) {
        this.commitFlick(this.aimAngle, Math.max(0.12, this.chargePower));
      }
      e.preventDefault();
      return;
    }
    this.trackKey(k, false);
  };

  private trackKey(k: string, down: boolean): boolean {
    switch (k) {
      case 'ArrowLeft': case 'a': case 'A': this.keys.left = down; return true;
      case 'ArrowRight': case 'd': case 'D': this.keys.right = down; return true;
      case 'ArrowUp': case 'w': case 'W': this.keys.up = down; return true;
      case 'ArrowDown': case 's': case 'S': this.keys.down = down; return true;
      case ' ': case 'Spacebar':
        if (down && this.canHumanInput() && !this.charging && !this.dragging) {
          this.charging = true;
          this.chargePhase = 0;
          this.chargePower = 0;
          this.usingKeys = true;
          if (!this.showingAim) {
            this.showingAim = true;
            const me = this.bodies[this.turn];
            const opp = this.bodies[1 - this.turn];
            this.aimAngle = Math.atan2(opp.z - me.z, opp.x - me.x);
          }
        }
        return true;
      default: return false;
    }
  }

  private onBlur = () => {
    if (this.matchRunning && this.phase !== 'over' && !this.paused && this.mode !== 'online') {
      this.setPaused(true);
    }
  };

  private attachInput(): void {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  // ================= public API =================

  startMatch(cfg: { mode: Mode; difficulty?: number }): void {
    this.mode = cfg.mode;
    this.difficulty = cfg.difficulty ?? 1;
    if (this.mode === 'cpu') {
      this.names = ['YOU', DIFFICULTY[this.difficulty].aiName.toUpperCase()];
      this.myIndex = 0;
    } else if (this.mode === 'local') {
      this.names = ['PLAYER 1', 'PLAYER 2'];
      this.myIndex = 0;
    } else {
      this.names = this.net?.role === 'guest' ? ['OPPONENT', 'YOU'] : ['YOU', 'OPPONENT'];
      this.myIndex = this.net?.role === 'guest' ? 1 : 0;
    }
    this.scores = [0, 0];
    this.kos = [0, 0];
    this.flicks = [0, 0];
    this.hits = [0, 0];
    this.chainHits = 0;
    this.turn = 0;
    this.matchRunning = true;
    this.paused = false;
    this.timeScale = 1;
    this.targetTimeScale = 1;
    this.slowmoHold = 0;
    this.roundTimer = -1;
    this.aiTimer = -1;
    this.events.onScores(0, 0);
    this.classroom.scoreCard.update(0, 0, this.matchNames()[0], this.matchNames()[1]);
    this.resetRound(false);
    // entry flourish
    this.dust.spawn(this.bodies[0].x, 0.05, this.bodies[0].z, 10, 1.4, 1.4, 0.96, 0.91, 0.8, 7, 0.9);
    this.dust.spawn(this.bodies[1].x, 0.05, this.bodies[1].z, 10, 1.4, 1.4, 0.96, 0.91, 0.8, 7, 0.9);
    this.sfx.turn();
    this.events.onPhase(this.phase);
  }

  requestRestart(): void {
    if (this.mode === 'online') {
      if (this.myIndex === 0) {
        this.net?.send({ t: 'rematch' });
        this.startMatch({ mode: 'online' });
      } else {
        this.net?.send({ t: 'rematch' });
        this.events.onToast('Rematch request sent…', 'info');
      }
      return;
    }
    this.startMatch({ mode: this.mode, difficulty: this.difficulty });
    this.events.onPhase(this.phase);
  }

  quitToMenu(): void {
    this.matchRunning = false;
    this.paused = false;
    this.phase = 'menu';
    this.roundTimer = -1;
    this.aiTimer = -1;
    this.timeScale = 1;
    this.targetTimeScale = 1;
    this.slowmoHold = 0;
    this.hideAim();
    this.turnRing.visible = false;
    this.events.onCharge(null);
    if (this.net) {
      this.net.send({ t: 'bye' });
      this.net.close();
      this.net = null;
    }
    this.events.onNetStatus({ status: 'idle' });
    this.events.onPhase('menu');
  }

  setPaused(p: boolean): void {
    if (!this.matchRunning || this.phase === 'over') return;
    if (this.mode === 'online' && p) {
      this.events.onToast("No pause in online — it's a real match!", 'info');
      this.sfx.deny();
      return;
    }
    if (this.paused === p) return;
    this.paused = p;
    if (p) {
      this.dragging = false;
      this.charging = false;
      this.hideAim();
      this.events.onCharge(null);
    }
    this.events.onPause(p);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  setMuted(m: boolean): void {
    this.sfx.setMuted(m);
  }

  get muted(): boolean {
    return this.sfx.muted;
  }

  // ---------- online ----------

  hostOnline(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.leaveNet();
      this.events.onNetStatus({ status: 'connecting' });
      const net = new NetClient(this.netHandlers());
      net.create()
        .then((code) => {
          this.net = net;
          this.events.onNetStatus({ status: 'waiting', code });
          resolve(code);
        })
        .catch((err: Error) => {
          this.events.onNetStatus({ status: 'error', error: err.message });
          reject(err);
        });
    });
  }

  joinOnline(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.leaveNet();
      this.events.onNetStatus({ status: 'connecting' });
      const net = new NetClient(this.netHandlers());
      net.join(code)
        .then(() => {
          this.net = net;
          this.events.onNetStatus({ status: 'connecting', code: code.toUpperCase() });
          resolve();
        })
        .catch((err: Error) => {
          this.events.onNetStatus({ status: 'error', error: err.message });
          reject(err);
        });
    });
  }

  leaveNet(): void {
    if (this.net) {
      this.net.close();
      this.net = null;
    }
  }

  private netHandlers() {
    return {
      onPaired: () => {
        this.events.onNetStatus({ status: 'paired', code: this.net?.code });
        if (this.net?.role === 'host' && (!this.matchRunning || this.phase === 'menu' || this.phase === 'over')) {
          // host starts the match; guests follow snapshots
          setTimeout(() => {
            if (this.net && this.net.role === 'host') {
              this.startMatch({ mode: 'online' });
              this.sendSnapshot(true);
            }
          }, 350);
        }
      },
      onPeerLeft: () => {
        this.events.onNetStatus({ status: 'left' });
        if (this.matchRunning && this.mode === 'online') {
          this.events.onToast('Opponent left the match', 'miss');
        }
        this.matchRunning = false;
        this.phase = 'menu';
        this.turnRing.visible = false;
        this.leaveNet();
        this.events.onPhase('menu');
      },
      onMessage: (p: Record<string, unknown>) => this.handleNetMessage(p),
      onClosed: () => { /* noop */ },
    };
  }

  private handleNetMessage(p: Record<string, unknown>): void {
    const t = p.t as string;
    if (t === 'flick' && this.mode === 'online' && this.myIndex === 0) {
      // guest fired: host applies authoritatively
      if (this.phase === 'aiming' && this.turn === 1) {
        this.execFlick(p.a as number, Math.max(0.05, Math.min(1, p.p as number)), 1);
        this.sendSnapshot(true);
      }
    } else if (t === 'snap' && this.myIndex === 1) {
      this.applySnapshot(p);
    } else if (t === 'rematch') {
      if (this.myIndex === 0) {
        this.startMatch({ mode: 'online' });
        this.sendSnapshot(true);
      }
      // guest hides overlay via snapshot phase change
    } else if (t === 'ev' && this.myIndex === 1) {
      this.applyNetEvent(p);
    } else if (t === 'bye') {
      this.events.onNetStatus({ status: 'left' });
      if (this.mode === 'online') {
        this.matchRunning = false;
        this.phase = 'menu';
        this.turnRing.visible = false;
        this.events.onToast('Opponent left the match', 'miss');
        this.leaveNet();
        this.events.onPhase('menu');
      }
    }
  }

  private sendSnapshot(force = false, dt = 0): void {
    if (this.mode !== 'online' || this.myIndex !== 0 || !this.net) return;
    this.snapTimer -= dt;
    if (this.snapTimer > 0 && !force) return;
    const flying = this.phase === 'flying' || this.phase === 'settling';
    this.snapTimer = flying ? 0.05 : 0.3;
    const b = this.bodies.map((x) => [
      Math.round(x.x * 1000) / 1000,
      Math.round(x.z * 1000) / 1000,
      Math.round(x.y * 1000) / 1000,
      Math.round(x.angle * 1000) / 1000,
    ]);
    this.net.send({ t: 'snap', ph: this.phase, turn: this.turn, sc: this.scores, b });
  }

  private applySnapshot(p: Record<string, unknown>): void {
    const bb = p.b as number[][];
    if (!this.matchRunning || this.mode !== 'online') {
      // first snapshot: guest enters the match
      this.startMatch({ mode: 'online' });
    }
    this.guestTargets = bb.map((v) => ({ x: v[0], z: v[1], y: v[2], angle: v[3] }));
    const ph = p.ph as GamePhase;
    const scores = p.sc as [number, number];
    const turn = p.turn as number;
    if (ph !== this.phase) {
      if (ph === 'aiming' || ph === 'flying' || ph === 'settling' || ph === 'roundwait' || ph === 'over') {
        this.phase = ph;
      }
      this.events.onPhase(this.phase);
    }
    if (turn !== this.lastNetTurn) {
      this.turn = turn;
      this.lastNetTurn = turn;
      this.emitTurn();
    }
    // guest turn ring follows the active pen
    this.turnRing.visible = this.phase === 'aiming';
    (this.turnRing.material as THREE.MeshBasicMaterial).color.set(PEN_COLORS[this.turn]);
    if (scores[0] !== this.lastNetScores[0] || scores[1] !== this.lastNetScores[1]) {
      this.scores = [...scores];
      this.lastNetScores = [...scores];
      this.events.onScores(scores[0], scores[1]);
      this.classroom.scoreCard.update(scores[0], scores[1], this.matchNames()[0], this.matchNames()[1]);
    }
  }

  private applyNetEvent(p: Record<string, unknown>): void {
    const k = p.k as string;
    if (k === 'toast') {
      this.events.onToast(p.text as string, p.kind as ToastKind);
    } else if (k === 'impact') {
      this.impactFx(p.x as number, p.z as number, p.power as number);
    } else if (k === 'flick') {
      this.sfx.flick(p.pw as number);
      this.fovKick = 1;
    } else if (k === 'fell') {
      this.fellFx();
    } else if (k === 'land') {
      this.sfx.thud();
      this.dust.spawn(p.x as number, -3.4, p.z as number, 16, 2.5, 2, 0.92, 0.85, 0.7, 10, 1.1);
    } else if (k === 'streak') {
      this.sfx.streak(p.n as number);
    } else if (k === 'over') {
      const w = p.w as number;
      this.finishGameOver(w, p.f as [number, number], p.h as [number, number], p.ko as [number, number]);
    }
  }

  // ================= match flow =================

  private matchNames(): [string, string] {
    if (this.mode === 'cpu') return ['YOU', DIFFICULTY[this.difficulty].aiName.toUpperCase()];
    if (this.mode === 'local') return ['P1', 'P2'];
    return this.myIndex === 0 ? ['YOU', 'FOE'] : ['FOE', 'YOU'];
  }

  private canHumanInput(): boolean {
    if (this.phase !== 'aiming' || this.paused || !this.matchRunning) return false;
    if (this.mode === 'local') return true;
    if (this.mode === 'cpu') return this.turn === 0;
    return this.turn === this.myIndex;
  }

  private resetRound(animated: boolean): void {
    const a0 = Math.PI / 2 + (Math.random() - 0.5) * 0.7;
    const a1 = -Math.PI / 2 + (Math.random() - 0.5) * 0.7;
    const positions: [number, number, number][] = [
      [-PHYS.SPAWN_X, (Math.random() - 0.5) * 1.6, a0],
      [PHYS.SPAWN_X, (Math.random() - 0.5) * 1.6, a1],
    ];
    if (animated) {
      this.phase = 'settling';
      this.events.onPhase('settling');
      this.settleT = 0;
      this.settleFrom = this.bodies.map((b) => ({ x: b.x, z: b.z, y: b.y, a: b.angle }));
      this.settleTo = positions;
      for (const b of this.bodies) {
        b.vx = 0; b.vy = 0; b.vz = 0; b.angVel = 0;
        b.state = 'desk';
        b.hitContact = false;
      }
    } else {
      placeBody(this.bodies[0], ...positions[0]);
      placeBody(this.bodies[1], ...positions[1]);
      this.beginAiming();
    }
  }

  private settleT = 0;
  private settleFrom: { x: number; z: number; y: number; a: number }[] = [];
  private settleTo: [number, number, number][] = [];

  private beginAiming(): void {
    this.phase = 'aiming';
    this.dragging = false;
    this.charging = false;
    this.hideAim();
    this.events.onCharge(null);
    for (const b of this.bodies) b.hitContact = false;
    this.emitTurn();
    this.events.onPhase('aiming');
    this.turnRing.visible = true;
    this.turnRing.position.set(this.bodies[this.turn].x, 0.02, this.bodies[this.turn].z);
    (this.turnRing.material as THREE.MeshBasicMaterial).color.set(PEN_COLORS[this.turn]);
    if (this.mode === 'cpu' && this.turn === 1) {
      this.planAI();
    }
    this.sendSnapshot(true);
  }

  private emitTurn(): void {
    const canInput = this.canHumanInput();
    let label: string;
    let sub: string;
    if (this.mode === 'local') {
      label = `${this.names[this.turn]}'S TURN`;
      sub = 'Pull back & release to flick';
    } else if (canInput) {
      label = 'YOUR TURN';
      sub = 'Pull back & release to flick';
    } else {
      label = `${this.names[this.turn]}'S TURN`;
      sub = this.mode === 'cpu' ? 'Watch out…' : 'Opponent is aiming…';
    }
    this.events.onTurn({ turn: this.turn, canInput, label, sub });
  }

  private commitFlick(angle: number, power: number): void {
    if (!this.canHumanInput()) return;
    this.hideAim();
    this.events.onCharge(null);
    if (this.mode === 'online' && this.myIndex === 1) {
      // guest: send to host, wait for snapshot
      this.net?.send({ t: 'flick', a: angle, p: power });
      this.phase = 'flying';
      this.events.onPhase('flying');
      this.fovKick = 1;
      this.sfx.flick(power);
      return;
    }
    this.execFlick(angle, power, this.turn);
  }

  private execFlick(angle: number, power: number, who: number): void {
    applyFlick(this.bodies[who], angle, power);
    this.flicks[who]++;
    this.phase = 'flying';
    this.stillSteps = 0;
    this.hideAim();
    this.events.onCharge(null);
    this.events.onPhase('flying');
    this.sfx.flick(power);
    this.fovKick = 1;
    this.tryHaptic(18);
    if (this.mode === 'online' && this.myIndex === 0 && who === 0) {
      // only echo the host's own flick — the guest heard theirs locally
      this.net?.send({ t: 'ev', k: 'flick', pw: power });
    }
    // small dust kick at launch
    const b = this.bodies[who];
    this.dust.spawn(b.x, 0.05, b.z, 6, 1.2, 0.7, 0.95, 0.9, 0.8, 5, 0.7);
  }

  private hideAim(): void {
    this.showingAim = false;
    this.aimGroup.visible = false;
    this.aimPower = 0;
  }

  // ---------- AI ----------

  private planAI(): void {
    const diff = DIFFICULTY[this.difficulty];
    const me = this.bodies[1];
    const opp = this.bodies[0];
    const hx = DESK.W / 2;
    const hz = DESK.D / 2;
    let tx = opp.x;
    let tz = opp.z;
    const dxEdge = hx - Math.abs(opp.x);
    const dzEdge = hz - Math.abs(opp.z);
    const near = Math.min(dxEdge, dzEdge);
    if (near < 1.65) {
      if (dxEdge < dzEdge) tx = opp.x + Math.sign(opp.x || 1) * 0.65;
      else tz = opp.z + Math.sign(opp.z || 1) * 0.65;
    }
    const dist = Math.hypot(opp.x - me.x, opp.z - me.z);
    const behind = this.scores[1] < this.scores[0];
    const sigma = diff.aimSigma * (behind ? 0.72 : 1.12);
    const angle = Math.atan2(tz - me.z, tx - me.x) + (Math.random() + Math.random() - 1) * sigma;
    // velocity needed to reach target with ~3u/s of shove left
    const vNeed = Math.sqrt(9 + 2 * PHYS.FRICTION * (dist + 0.35));
    let power = (vNeed - PHYS.MIN_FLICK) / (PHYS.MAX_FLICK - PHYS.MIN_FLICK);
    power += (Math.random() * 2 - 1) * diff.powSigma * 0.5;
    if (near < 1.2 && dist < 3) power = Math.min(power, 0.62); // gentle tap off the edge
    power = clamp(power, 0.3, 0.96);
    this.aiPlan = { angle, power, think: diff.thinkMs * (0.85 + Math.random() * 0.4) };
    this.aiTimer = diff.thinkMs * (0.85 + Math.random() * 0.4);
    this.aiChargeT = 0;
  }

  // ---------- resolution ----------

  private resolveSim(): void {
    const flicker = this.bodies[this.turn];
    const fallen = this.bodies.filter((b) => b.state !== 'desk');
    let scored = false;
    let scorer = -1;
    if (fallen.length > 0) {
      for (const f of fallen) {
        const otherPlayer = 1 - f.id;
        this.scores[otherPlayer]++;
        scorer = scorer === -1 ? otherPlayer : -2; // both scored -> -2
        this.kos[otherPlayer]++;
        scored = true;
      }
      this.events.onScores(this.scores[0], this.scores[1]);
      this.classroom.scoreCard.update(this.scores[0], this.scores[1], this.matchNames()[0], this.matchNames()[1]);
      const both = fallen.length === 2;
      const text = both ? 'DOUBLE KNOCKOUT!' : fallen[0].id === this.turn ? 'OWN GOAL!' : 'KNOCKOUT!';
      this.events.onToast(text, 'ko');
      this.net?.send({ t: 'ev', k: 'toast', text, kind: 'ko' });
      this.net?.send({ t: 'ev', k: 'impact', x: 0, z: 0, power: 3 });
      this.sfx.score();
      this.shakeFx.add(0.65);
      this.tryHaptic(90);
      // celebratory chalk bursts
      for (let i = 0; i < 3; i++) {
        this.dust.spawn((Math.random() - 0.5) * 8, 0.1, (Math.random() - 0.5) * 4, 20, 2.4, 2.6, 1, 0.95, 0.8, 8, 1.2);
      }
      this.chainHits = 0;
      this.turnRing.visible = false;
    } else if (flicker.hitContact) {
      // hit => same player attacks again
      this.hits[this.turn]++;
      this.chainHits++;
      const c = this.chainHits;
      const text = c >= 3 ? `ON FIRE! Attack #${c + 1}` : c === 2 ? 'COMBO x3 — go again' : 'HIT! Go again';
      this.events.onToast(text, c >= 2 ? 'streak' : 'hit');
      this.net?.send({ t: 'ev', k: 'toast', text, kind: c >= 2 ? 'streak' : 'hit' });
      if (c >= 2) {
        this.sfx.streak(c);
        this.net?.send({ t: 'ev', k: 'streak', n: c });
      } else {
        this.sfx.turn();
      }
    } else {
      // miss => turn passes
      this.chainHits = 0;
      this.turn = 1 - this.turn;
      this.events.onToast('Miss! Turn passes', 'miss');
      this.net?.send({ t: 'ev', k: 'toast', text: 'Miss! Turn passes', kind: 'miss' });
      this.sfx.turn();
    }

    // game over check
    const winNeeded = PHYS.WIN_SCORE;
    const a = this.scores[0];
    const b = this.scores[1];
    const bothOver = a >= winNeeded && b >= winNeeded;
    let winner = -1;
    if (a >= winNeeded && b < winNeeded) winner = 0;
    else if (b >= winNeeded && a < winNeeded) winner = 1;

    if (bothOver) {
      // tiebreak round
      this.events.onToast('Tied! Sudden death…', 'info');
      this.net?.send({ t: 'ev', k: 'toast', text: 'Tied! Sudden death…', kind: 'info' });
    }

    if (winner >= 0) {
      this.finishGameOver(winner, this.flicks, this.hits, this.kos);
      this.net?.send({ t: 'ev', k: 'over', w: winner, f: this.flicks, h: this.hits, ko: this.kos });
      return;
    }

    if (scored) {
      this.phase = 'roundwait';
      this.events.onPhase('roundwait');
      this.roundTimer = 1.25;
      // scorer attacks first next round (if both scored, keep turn player start)
      this.turn = scorer >= 0 ? scorer : this.turn;
      this.sendSnapshot(true);
    } else {
      this.beginAiming();
    }
  }

  private finishGameOver(winner: number, flicks: [number, number], hits: [number, number], kos: [number, number]): void {
    this.phase = 'over';
    this.matchRunning = true; // keep rendering scene; input closed
    this.hideAim();
    this.turnRing.visible = false;
    this.events.onCharge(null);
    let winStreak = 0;
    let streakToSubmit: number | null = null;
    const youWon = this.mode === 'cpu' ? winner === 0 : this.mode === 'online' ? winner === this.myIndex : null;
    if (this.mode === 'cpu') {
      if (winner === 0) {
        winStreak = getStreak() + 1;
        setStreak(winStreak);
        this.sfx.win();
      } else {
        const prev = getStreak();
        if (prev > 0 && qualifies(prev)) streakToSubmit = prev;
        setStreak(0);
        this.sfx.lose();
      }
    } else if (youWon === true) {
      this.sfx.win();
    } else if (youWon === false) {
      this.sfx.lose();
    } else {
      this.sfx.win();
    }
    this.events.onGameOver({
      winnerIdx: winner,
      winnerName: this.names[winner],
      mode: this.mode,
      flicks: [...flicks] as [number, number],
      hits: [...hits] as [number, number],
      winStreak,
      streakToSubmit,
      kos: [...kos] as [number, number],
    });
    this.events.onPhase('over');
    this.sendSnapshot(true);
    // confetti chalk
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        if (this.disposed) return;
        this.dust.spawn((Math.random() - 0.5) * 9, 0.15, (Math.random() - 0.5) * 5, 26, 3, 3.4, 1, 0.92, 0.72, 7, 1.5);
      }, i * 160);
    }
  }

  // ---------- fx helpers ----------

  private impactFx(x: number, z: number, power: number): void {
    const k = clamp(power / 6, 0.15, 1);
    this.dust.spawn(x, 0.06, z, Math.round(6 + k * 22), 1.6 + k * 2.4, 1.5 + k * 2.2, 0.97, 0.92, 0.8, 8, 1);
    this.rings.spawn(x, z, k);
    this.shakeFx.add(0.14 + k * 0.4);
    this.sfx.clack(power);
    this.tryHaptic(Math.round(12 + k * 30));
    if (this.timeScale > 0.9 && power > 4.5) {
      // micro hitstop on big hits
      this.targetTimeScale = 0.42;
      this.slowmoHold = 0.085;
    }
  }

  private fellFx(): void {
    this.targetTimeScale = 0.24;
    this.slowmoHold = 0.62;
    this.shakeFx.add(0.35);
    this.sfx.fallWhistle();
    this.events.onToast('Off the desk!', 'ko');
  }

  private tryHaptic(ms: number): void {
    try {
      if ('vibrate' in navigator) navigator.vibrate(ms);
    } catch { /* ignore */ }
  }

  // ================= frame loop =================

  private tick(): void {
    if (this.disposed) return;
    const rawDt = Math.min(this.clock.getDelta(), 0.05);
    const dt = this.paused ? 0 : rawDt;
    this.elapsed += rawDt;

    // time scaling (slow-mo)
    if (this.slowmoHold > 0) {
      this.slowmoHold -= rawDt;
      if (this.slowmoHold <= 0) this.targetTimeScale = 1;
    }
    this.timeScale = lerp(this.timeScale, this.targetTimeScale, dampAlpha(7, rawDt));
    const sdt = dt * this.timeScale;

    // physics
    if (dt > 0 && this.phase === 'flying') {
      if (this.mode === 'online' && this.myIndex === 1) {
        // guest: purely visual interpolation — snapshots drive the pens
      } else {
        this.physAcc += sdt;
        let steps = 0;
        while (this.physAcc >= PHYS.STEP && steps < 40) {
          this.physAcc -= PHYS.STEP;
          steps++;
          const res = stepWorld(this.bodies, PHYS.STEP);
          if (res.impact) {
            if (this.mode === 'online' && this.myIndex === 0) {
              this.net?.send({ t: 'ev', k: 'impact', x: res.impact.x, z: res.impact.z, power: res.impact.power });
            }
            if (performance.now() - this.lastClack > 70) {
              this.lastClack = performance.now();
              this.impactFx(res.impact.x, res.impact.z, res.impact.power);
            }
          }
          if (res.fellOff) {
            this.fellFx();
            if (this.mode === 'online' && this.myIndex === 0) {
              this.net?.send({ t: 'ev', k: 'fell' });
            }
          }
          if (res.landed) {
            this.sfx.thud();
            this.shakeFx.add(0.18);
            this.dust.spawn(res.landed.x, -3.4, res.landed.z, 16, 2.5, 2, 0.92, 0.85, 0.7, 10, 1.1);
            if (this.mode === 'online' && this.myIndex === 0) {
              this.net?.send({ t: 'ev', k: 'land', x: res.landed.x, z: res.landed.z });
            }
          }
        }
        if (allStopped(this.bodies)) {
          this.stillSteps++;
          if (this.stillSteps > 10) {
            this.stillSteps = 0;
            this.resolveSim();
          }
        } else {
          this.stillSteps = 0;
        }
      }
      this.sendSnapshot(false, dt);
    }

    // round transition timer
    if (this.roundTimer > 0 && dt > 0) {
      this.roundTimer -= dt;
      if (this.roundTimer <= 0) {
        this.roundTimer = -1;
        this.resetRound(true);
        this.sendSnapshot(true);
      }
    }

    // settle animation
    if (this.phase === 'settling' && dt > 0) {
      this.settleT += dt / 0.85;
      const t = Math.min(1, this.settleT);
      const ease = 1 - Math.pow(1 - t, 3);
      for (let i = 0; i < 2; i++) {
        const b = this.bodies[i];
        const f = this.settleFrom[i];
        const tt = this.settleTo[i];
        b.x = lerp(f.x, tt[0], ease);
        b.z = lerp(f.z, tt[1], ease);
        // rise from wherever the pen ended up (incl. the floor) with a hop
        b.y = lerp(f.y, 0, ease) + Math.sin(t * Math.PI) * 1.15;
        b.angle = lerpAngle(f.a, tt[2] + Math.PI * 2 * (i === 0 ? 1 : -1), ease);
      }
      if (t >= 1) {
        for (let i = 0; i < 2; i++) {
          placeBody(this.bodies[i], ...this.settleTo[i]);
        }
        this.dust.spawn(this.bodies[0].x, 0.05, this.bodies[0].z, 8, 1, 1, 0.95, 0.9, 0.8, 6, 0.8);
        this.dust.spawn(this.bodies[1].x, 0.05, this.bodies[1].z, 8, 1, 1, 0.95, 0.9, 0.8, 6, 0.8);
        this.sfx.turn();
        this.beginAiming();
      }
      this.sendSnapshot(false, dt);
    }

    // guest visual interpolation
    if (this.mode === 'online' && this.myIndex === 1 && this.guestTargets && dt > 0) {
      const a = dampAlpha(15, dt);
      for (let i = 0; i < 2; i++) {
        const b = this.bodies[i];
        const tgt = this.guestTargets[i];
        b.x = lerp(b.x, tgt.x, a);
        b.z = lerp(b.z, tgt.z, a);
        b.y = lerp(b.y, tgt.y, a);
        b.angle = lerpAngle(b.angle, tgt.angle, a);
      }
    }

    // AI behavior
    if (this.mode === 'cpu' && this.turn === 1 && this.phase === 'aiming' && dt > 0 && !this.paused) {
      this.aiTimer -= dt * 1000;
      this.aiChargeT += dt;
      const k = clamp(1 - this.aiTimer / this.aiPlan.think, 0, 1);
      const wobble = Math.sin(this.aiChargeT * 13) * 0.008 * k;
      this.aiTimer > 0 && this.showAiAim(this.aiPlan.angle + wobble, this.aiPlan.power * k);
      if (this.aiTimer <= 0) {
        this.aiTimer = -1;
        this.hideAim();
        this.execFlick(this.aiPlan.angle, this.aiPlan.power, 1);
      }
    }

    // human keyboard aim
    if (this.canHumanInput() && this.usingKeys && dt > 0) {
      if (this.keys.left) this.aimAngle += 1.9 * dt;
      if (this.keys.right) this.aimAngle -= 1.9 * dt;
      if (this.keys.up) this.aimPower = clamp(this.aimPower + 0.8 * dt, 0.12, 1);
      if (this.keys.down) this.aimPower = clamp(this.aimPower - 0.8 * dt, 0.12, 1);
      if (this.charging) {
        this.chargePhase += dt * 1.5;
        const ph = this.chargePhase % 2;
        this.chargePower = ph < 1 ? ph : 2 - ph;
        if (this.chargePhase - this.lastChargeBeep > 0.14) {
          this.lastChargeBeep = this.chargePhase;
          this.sfx.chargeTick(this.chargePower);
        }
        this.events.onCharge(this.chargePower, 'Release SPACE to flick');
      } else if (this.keys.left || this.keys.right || this.keys.up || this.keys.down) {
        this.events.onCharge(this.aimPower, 'SPACE to charge · release to fire');
      }
    }
    if (this.canHumanInput() && this.showingAim && !this.paused) {
      this.showAim(this.aimAngle, this.charging ? this.chargePower : this.aimPower, this.turn);
    }

    // idle turn ring pulse
    if (this.turnRing.visible && this.phase === 'aiming') {
      const p = this.bodies[this.turn];
      this.turnRing.position.set(p.x, 0.025, p.z);
      const s = 1 + Math.sin(this.elapsed * 5) * 0.09;
      this.turnRing.scale.set(s, s, s);
      (this.turnRing.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(this.elapsed * 5) * 0.15;
    }

    // fans + motes
    for (const fan of this.classroom.fans) {
      const blades = fan.children[fan.children.length - 1];
      blades.rotation.y += dt * 2.6;
    }
    const mp = (this.classroom.motes.geometry.attributes.position as THREE.BufferAttribute);
    for (let i = 0; i < mp.count; i++) {
      const yy = mp.getY(i) + Math.sin(this.elapsed * 0.6 + i) * 0.0012;
      mp.setY(i, yy);
      mp.setX(i, mp.getX(i) + dt * 0.06);
      if (mp.getX(i) > 15.5) mp.setX(i, 6);
    }
    mp.needsUpdate = true;

    // sync pen meshes
    this.syncPenMeshes(sdt);

    // camera
    this.updateCamera(dt, rawDt);

    // effects
    this.dust.update(sdt);
    this.rings.update(sdt);
    this.streakFx.sync([
      { x: this.bodies[0].x, z: this.bodies[0].z, y: this.bodies[0].y, vx: this.bodies[0].vx, vz: this.bodies[0].vz, onDesk: this.bodies[0].state === 'desk' },
      { x: this.bodies[1].x, z: this.bodies[1].z, y: this.bodies[1].y, vx: this.bodies[1].vx, vz: this.bodies[1].vz, onDesk: this.bodies[1].state === 'desk' },
    ]);

    this.renderer.render(this.scene, this.camera);
  }

  private syncPenMeshes(dt: number): void {
    for (let i = 0; i < 2; i++) {
      const b = this.bodies[i];
      const rig = this.pens[i];
      rig.group.position.set(b.x, b.y, b.z);
      rig.group.rotation.y = -b.angle;
      // falling pens pitch nose-down for drama
      if (b.state === 'falling') {
        rig.group.rotation.z = lerp(rig.group.rotation.z, 0.5, dt > 0 ? dampAlpha(4, dt) : 0.2);
      } else {
        rig.group.rotation.z = lerp(rig.group.rotation.z, 0, dt > 0 ? dampAlpha(8, dt) : 1);
      }
      // speed squash (juice)
      const sp = Math.hypot(b.vx, b.vz);
      const squash = clamp(1 + sp * 0.008, 1, 1.14);
      rig.inner.scale.set(squash, 1, 1);
    }
  }

  private updateCamera(dt: number, rawDt: number): void {
    const menuDrift = this.phase === 'menu';
    if (menuDrift) {
      const t = this.elapsed * 0.1;
      this.camPosGoal.set(Math.sin(t) * 4.2, 7.6 + Math.sin(t * 0.7) * 0.5, 10.6);
      this.camTargetGoal.set(0, -0.6, -0.8);
    } else if (this.phase === 'flying') {
      const pen = this.bodies[this.turn] ?? this.bodies[0];
      const fallen = this.bodies.find((b) => b.state !== 'desk');
      const focus = fallen ?? pen;
      this.camTargetGoal.set(focus.x * 0.42, -0.2, focus.z * 0.42 - 0.4);
      this.camPosGoal.set(focus.x * 0.2, 8.9, 10.2);
    } else {
      const pen = this.bodies[this.turn] ?? this.bodies[0];
      this.camTargetGoal.set(pen.x * 0.3, -0.2, pen.z * 0.3 - 0.5);
      this.camPosGoal.set(pen.x * 0.14, 8.8, 10.4);
    }
    const a = dampAlpha(3.4, rawDt);
    this.camPos.lerp(this.camPosGoal, a);
    this.camTarget.lerp(this.camTargetGoal, a);

    // fov kick
    this.fovKick = Math.max(0, this.fovKick - dt * 3.4);
    const fov = this.baseFov + this.fovKick * 3.2;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    const shake = this.paused ? { x: 0, y: 0, roll: 0 } : this.shakeFx.sample(rawDt);
    this.camera.position.set(
      this.camPos.x + shake.x,
      this.camPos.y + shake.y,
      this.camPos.z + shake.x * 0.3
    );
    this.camera.lookAt(this.camTarget);
    this.camera.rotateZ(shake.roll);
  }

  // ---------- aim rendering ----------

  private colorForPower(p: number, out: THREE.Color): THREE.Color {
    // green → amber → red
    if (p < 0.5) return out.set('#7ee787').lerp(new THREE.Color('#ffd166'), p * 2);
    return out.set('#ffd166').lerp(new THREE.Color('#ff5d5d'), (p - 0.5) * 2);
  }

  private _aimColor = new THREE.Color();

  private showAim(angle: number, power: number, penIdx: number): void {
    const pen = this.bodies[penIdx];
    this.aimGroup.visible = true;
    const col = this.colorForPower(power, this._aimColor);
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const shaftLen = 0.8 + power * 1.3;

    this.aimShaft.position.set(pen.x + dx * (PEN.HALF_LEN + shaftLen / 2 + 0.15), 0.1, pen.z + dz * (PEN.HALF_LEN + shaftLen / 2 + 0.15));
    this.aimShaft.rotation.y = -angle;
    this.aimShaft.scale.set(1, shaftLen, 1);
    (this.aimShaft.material as THREE.MeshBasicMaterial).color.copy(col);

    this.aimHead.position.set(pen.x + dx * (PEN.HALF_LEN + shaftLen + 0.38), 0.1, pen.z + dz * (PEN.HALF_LEN + shaftLen + 0.38));
    this.aimHead.rotation.y = -angle;
    (this.aimHead.material as THREE.MeshBasicMaterial).color.copy(col);

    this.aimRing.position.set(pen.x, 0.035, pen.z);
    this.aimRing.scale.setScalar(1 + power * 0.55);
    (this.aimRing.material as THREE.MeshBasicMaterial).color.copy(col);
    (this.aimRing.material as THREE.MeshBasicMaterial).opacity = 0.35 + power * 0.4;

    // dotted preview
    const previewLen = 1.4 + power * 4.6;
    for (let i = 0; i < this.aimDots.length; i++) {
      const t = (i + 1) / (this.aimDots.length + 1);
      const dot = this.aimDots[i];
      dot.position.set(
        pen.x + dx * (PEN.HALF_LEN + 0.4 + t * previewLen),
        0.04,
        pen.z + dz * (PEN.HALF_LEN + 0.4 + t * previewLen)
      );
      (dot.material as THREE.MeshBasicMaterial).color.copy(col);
      (dot.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.75 + 0.1;
      dot.scale.setScalar(1 - t * 0.35);
    }
  }

  private showAiAim(angle: number, power: number): void {
    this.showAim(angle, power, 1);
    this.events.onCharge(power, `${this.names[1]} is aiming…`);
  }

  // ================= disposal =================

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.resizeObs?.disconnect();
    this.leaveNet();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        const mat = obj.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      }
    });
    this.renderer.dispose();
    if (el.parentElement === this.container) this.container.removeChild(el);
  }
}
