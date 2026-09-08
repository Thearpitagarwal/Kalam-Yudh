// ============================================================
// Pen Fight — classroom environment builder
// ============================================================

import * as THREE from 'three';
import { COLORS, DESK } from './constants';
import {
  chalkboardTexture,
  floorTexture,
  makeScoreCard,
  posterTexture,
  wallTexture,
  woodDeskTexture,
  type PosterKind,
} from './textures';

export interface Classroom {
  group: THREE.Group;
  fans: THREE.Group[];
  motes: THREE.Points;
  scoreCard: { update: (a: number, b: number, n1: string, n2: string) => void };
  deskTop: THREE.Mesh;
}

const std = (opts: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(opts);
const lamb = (opts: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(opts);

function box(
  w: number, h: number, d: number,
  mat: THREE.Material,
  x = 0, y = 0, z = 0,
  castShadow = false, receiveShadow = false
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = castShadow;
  m.receiveShadow = receiveShadow;
  return m;
}

/** The hero desk where the fight happens */
function buildHeroDesk(wood: THREE.CanvasTexture): { desk: THREE.Group; top: THREE.Mesh } {
  const g = new THREE.Group();
  const topMat = std({ map: wood, roughness: 0.72, metalness: 0.04 });
  const sideMat = std({ color: COLORS.woodDark, roughness: 0.8 });
  const edgeMat = std({ color: '#8a5a28', roughness: 0.75 });

  const top = new THREE.Mesh(new THREE.BoxGeometry(DESK.W, DESK.THICK, DESK.D), [
    edgeMat, edgeMat, topMat, sideMat, edgeMat, edgeMat,
  ]);
  top.position.y = -DESK.THICK / 2;
  top.receiveShadow = true;
  g.add(top);

  // modesty panel + legs
  g.add(box(DESK.W - 0.6, 2.2, 0.24, sideMat, 0, -1.5, -DESK.D / 2 + 0.5));
  const legG = new THREE.BoxGeometry(0.36, DESK.LEG_H, 0.36);
  const legPos: [number, number][] = [
    [-DESK.W / 2 + 0.45, DESK.D / 2 - 0.45],
    [DESK.W / 2 - 0.45, DESK.D / 2 - 0.45],
    [-DESK.W / 2 + 0.45, -DESK.D / 2 + 0.45],
    [DESK.W / 2 - 0.45, -DESK.D / 2 + 0.45],
  ];
  for (const [lx, lz] of legPos) {
    const leg = new THREE.Mesh(legG, sideMat);
    leg.position.set(lx, -DESK.THICK - DESK.LEG_H / 2, lz);
    g.add(leg);
  }
  // bench (front side, toward camera)
  g.add(box(DESK.W * 0.9, 0.22, 1.15, edgeMat, 0, -1.75, DESK.D / 2 + 1.5));
  g.add(box(0.3, 1.35, 0.9, sideMat, -DESK.W * 0.36, -2.5, DESK.D / 2 + 1.5));
  g.add(box(0.3, 1.35, 0.9, sideMat, DESK.W * 0.36, -2.5, DESK.D / 2 + 1.5));
  return { desk: g, top };
}

/** Simple student desk + bench, reused as a group */
function buildStudentDesk(): THREE.Group {
  const g = new THREE.Group();
  const top = std({ color: '#b07a3e', roughness: 0.8 });
  const dark = std({ color: '#7a4e22', roughness: 0.85 });
  g.add(box(4.0, 0.22, 1.7, top, 0, 0, 0));
  g.add(box(4.0, 1.0, 0.14, dark, 0, -0.62, -0.72));
  g.add(box(0.24, 2.1, 0.24, dark, -1.8, -1.16, 0.62));
  g.add(box(0.24, 2.1, 0.24, dark, 1.8, -1.16, 0.62));
  g.add(box(0.24, 2.1, 0.24, dark, -1.8, -1.16, -0.6));
  g.add(box(0.24, 2.1, 0.24, dark, 1.8, -1.16, -0.6));
  // bench
  g.add(box(3.6, 0.16, 0.85, top, 0, -1.0, 1.6));
  g.add(box(0.2, 1.2, 0.6, dark, -1.5, -1.65, 1.6));
  g.add(box(0.2, 1.2, 0.6, dark, 1.5, -1.65, 1.6));
  return g;
}

function buildFan(): THREE.Group {
  const fan = new THREE.Group();
  const rod = std({ color: '#8b8f98', roughness: 0.6, metalness: 0.4 });
  const bladeM = std({ color: '#e8dcc0', roughness: 0.7 });
  const r = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), rod);
  r.position.y = -0.8;
  fan.add(r);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.3, 12), rod);
  hub.position.y = -1.7;
  fan.add(hub);
  const blades = new THREE.Group();
  blades.position.y = -1.86;
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group();
    const bl = box(2.3, 0.04, 0.42, bladeM, 1.28, 0, 0);
    bl.rotation.y = 0.0;
    arm.add(bl);
    arm.rotation.y = (i / 3) * Math.PI * 2;
    blades.add(arm);
  }
  fan.add(blades);
  return fan;
}

function buildWindow(): THREE.Group {
  const g = new THREE.Group();
  const frame = std({ color: '#7c5a33', roughness: 0.7 });
  // sky gradient pane via vertex-colored plane
  const skyGeo = new THREE.PlaneGeometry(3.0, 3.6);
  const pos = skyGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color('#8fd0f0');
  const bot = new THREE.Color('#ffe9c4');
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + 1.8) / 3.6;
    const c = bot.clone().lerp(top, t);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));
  g.add(sky);
  // sun glow disc
  const sun = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: '#fff7de' }));
  sun.position.set(0.8, 1.0, 0.01);
  g.add(sun);
  // frame bars
  g.add(box(3.2, 0.16, 0.18, frame, 0, 1.85, 0.02));
  g.add(box(3.2, 0.16, 0.18, frame, 0, -1.85, 0.02));
  g.add(box(0.16, 3.8, 0.18, frame, -1.55, 0, 0.02));
  g.add(box(0.16, 3.8, 0.18, frame, 1.55, 0, 0.02));
  g.add(box(0.1, 3.6, 0.12, frame, 0, 0, 0.02));
  g.add(box(3.0, 0.1, 0.12, frame, 0, 0.6, 0.02));
  g.add(box(3.0, 0.1, 0.12, frame, 0, -0.6, 0.02));
  // bars (security grill, very Indian classroom)
  for (let i = -1; i <= 1; i++) {
    g.add(box(0.05, 3.5, 0.06, frame, i, 0, 0.05));
  }
  return g;
}

export function buildClassroom(): Classroom {
  const group = new THREE.Group();

  // ---------- floor ----------
  const floorTex = floorTexture();
  floorTex.repeat.set(8, 8);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    lamb({ map: floorTex })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -(DESK.THICK + DESK.LEG_H);
  floor.receiveShadow = false;
  group.add(floor);

  const wallTex = wallTexture();
  wallTex.repeat.set(4, 2);

  // ---------- back wall (chalkboard wall, z = -8) ----------
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(44, 18), lamb({ map: wallTex }));
  backWall.position.set(0, 4.6, -8);
  group.add(backWall);
  // green band on back wall
  const band = new THREE.Mesh(new THREE.PlaneGeometry(44, 5), lamb({ color: '#3f6b52' }));
  band.position.set(0, -0.3, -7.98);
  group.add(band);

  // ---------- chalkboard ----------
  const board = new THREE.Group();
  const bFrame = std({ color: '#7a4e22', roughness: 0.7 });
  const bTex = chalkboardTexture();
  const bPlane = new THREE.Mesh(new THREE.PlaneGeometry(13.4, 7.3), lamb({ map: bTex }));
  board.add(bPlane);
  board.add(box(13.9, 0.32, 0.24, bFrame, 0, 3.8, -0.06));
  board.add(box(13.9, 0.32, 0.24, bFrame, 0, -3.8, -0.06));
  board.add(box(0.32, 7.9, 0.24, bFrame, -6.95, 0, -0.06));
  board.add(box(0.32, 7.9, 0.24, bFrame, 6.95, 0, -0.06));
  // chalk tray with chalk pieces & duster
  board.add(box(9, 0.18, 0.5, bFrame, 0, -3.95, 0.22));
  const chalkW = std({ color: '#fafafa', roughness: 0.9 });
  const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), chalkW);
  c1.rotation.z = Math.PI / 2;
  c1.position.set(-2.4, -3.82, 0.3);
  board.add(c1);
  const c2 = c1.clone();
  c2.position.set(-1.9, -3.82, 0.34);
  c2.material = std({ color: '#ffd166', roughness: 0.9 });
  board.add(c2);
  board.add(box(0.9, 0.22, 0.42, std({ color: '#4a3423', roughness: 0.9 }), 2.6, -3.8, 0.3));
  board.position.set(0, 3.4, -7.86);
  group.add(board);

  // stage/platform under board (teacher's platform)
  group.add(box(16, 0.5, 4.4, lamb({ color: '#b98a58' }), 0, -(DESK.THICK + DESK.LEG_H) + 0.25, -5.6));

  // ---------- clock above board ----------
  const clockG = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.85, 32), lamb({ color: '#fffdf4' }));
  clockG.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.07, 8, 32), std({ color: '#343d4e', roughness: 0.5 }));
  clockG.add(rim);
  const handM = std({ color: '#343d4e', roughness: 0.5 });
  const hh = box(0.07, 0.44, 0.03, handM, 0, 0.18, 0.02);
  hh.rotation.z = -1.1;
  clockG.add(hh);
  const mh = box(0.05, 0.64, 0.03, handM, 0, 0.26, 0.03);
  mh.rotation.z = 0.7;
  clockG.add(mh);
  clockG.position.set(0, 8.6, -7.9);
  group.add(clockG);

  // ---------- side walls ----------
  const sideWallTex = wallTexture();
  sideWallTex.repeat.set(3.5, 2);
  const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(40, 18), lamb({ map: sideWallTex }));
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.set(16, 4.6, 4);
  group.add(rightWall);
  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(40, 18), lamb({ map: sideWallTex.clone() }));
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(-16, 4.6, 4);
  group.add(leftWall);

  // ---------- windows on right wall ----------
  for (let i = 0; i < 3; i++) {
    const w = buildWindow();
    w.rotation.y = -Math.PI / 2;
    w.position.set(15.9, 4.4, -2 + i * 5.2);
    group.add(w);
  }
  // light shafts from windows (soft additive planes)
  const shaftMat = new THREE.MeshBasicMaterial({
    color: '#ffdf9e',
    transparent: true,
    opacity: 0.10,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  for (let i = 0; i < 2; i++) {
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 5.2), shaftMat);
    shaft.position.set(11.5, 3.4, 0 + i * 5.2);
    shaft.rotation.set(0.12, -1.15, 0.32);
    group.add(shaft);
  }

  // ---------- posters on left wall ----------
  const posterKinds: PosterKind[] = ['tables', 'india', 'planets'];
  posterKinds.forEach((kind, i) => {
    const tex = posterTexture(kind);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.45), lamb({ map: tex }));
    p.rotation.y = Math.PI / 2;
    p.rotation.z = (i - 1) * 0.02;
    p.position.set(-15.9, 4.2, -3.5 + i * 5.4);
    group.add(p);
  });

  // door on left wall (toward back)
  const doorFrame = std({ color: '#6b4a26', roughness: 0.75 });
  const door = new THREE.Group();
  door.add(box(0.18, 6.4, 3.3, doorFrame, 0, 0, 0));
  const doorPanel = box(0.1, 6.0, 2.9, lamb({ color: '#9a6a36' }), 0.06, 0, 0);
  door.add(doorPanel);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), std({ color: '#d9b25f', metalness: 0.6, roughness: 0.4 }));
  knob.position.set(0.14, 0, 1.1);
  door.add(knob);
  door.position.set(-15.9, -(DESK.THICK + DESK.LEG_H) + 3.2, 12.5);
  group.add(door);

  // ---------- ceiling + fans ----------
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(44, 40), lamb({ color: '#e9e2cf' }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, 13, 4);
  group.add(ceil);
  const fans: THREE.Group[] = [];
  const fanPos: [number, number][] = [[-5, -2], [4.5, 5.5]];
  for (const [fx, fz] of fanPos) {
    const fan = buildFan();
    fan.position.set(fx, 13, fz);
    group.add(fan);
    fans.push(fan);
  }
  // tube light
  const tube = box(4.2, 0.12, 0.3, new THREE.MeshBasicMaterial({ color: '#fff7e0' }), -3, 12.6, 8);
  group.add(tube);

  // ---------- student desks rows (background, toward camera) ----------
  const rows: { x: number; z: number; r: number }[] = [
    { x: -7.5, z: 5.2, r: 0.05 }, { x: 7.0, z: 5.6, r: -0.07 },
    { x: -8, z: 9.3, r: -0.04 }, { x: 7.6, z: 9.6, r: 0.06 },
    { x: -6.4, z: 13.2, r: 0.02 }, { x: 6.8, z: 13.4, r: -0.03 },
  ];
  for (const rp of rows) {
    const d = buildStudentDesk();
    d.position.set(rp.x, -(DESK.THICK + DESK.LEG_H) + 2.1, rp.z);
    d.rotation.y = Math.PI + rp.r; // face the board
    group.add(d);
    // school bags leaning (little color pops)
    const bagCols = ['#e11d48', '#0ea5e9', '#65a30d', '#f59e0b'];
    const bag = box(0.9, 1.1, 0.5, std({ color: bagCols[Math.floor(Math.random() * bagCols.length)], roughness: 0.8 }), rp.x + 2.4, -(DESK.THICK + DESK.LEG_H) + 0.55, rp.z + 0.4);
    bag.rotation.y = Math.random() * 0.8;
    group.add(bag);
  }

  // ---------- hero desk ----------
  const wood = woodDeskTexture();
  const { desk, top } = buildHeroDesk(wood);
  group.add(desk);

  // ---------- paper scorecard on the desk ----------
  const card = makeScoreCard();
  const cardMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 1.17),
    lamb({ map: card.tex })
  );
  cardMesh.rotation.x = -Math.PI / 2;
  cardMesh.rotation.z = -0.18;
  cardMesh.position.set(0, 0.012, -DESK.D / 2 + 0.85);
  group.add(cardMesh);

  // ---------- dust motes (ambient) ----------
  const moteCount = 70;
  const moteGeo = new THREE.BufferGeometry();
  const mpos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    mpos[i * 3] = 6 + Math.random() * 9;
    mpos[i * 3 + 1] = -1 + Math.random() * 8;
    mpos[i * 3 + 2] = -4 + Math.random() * 14;
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mpos, 3));
  const motes = new THREE.Points(
    moteGeo,
    new THREE.PointsMaterial({
      color: '#ffe9b8',
      size: 0.055,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  group.add(motes);

  return { group, fans, motes, scoreCard: card, deskTop: top };
}
