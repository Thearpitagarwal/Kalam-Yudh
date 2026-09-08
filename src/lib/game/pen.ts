// ============================================================
// Pen Fight — pen mesh factory (long axis = local +X)
// ============================================================

import * as THREE from 'three';
import { COLORS, PEN } from './constants';

export interface PenRig {
  group: THREE.Group; // outer: position/rotation from physics
  inner: THREE.Group; // inner: visual squash/spin flair
  shadow: THREE.Mesh; // fake blob shadow
}

export function buildPen(color: string, dark: string): PenRig {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);

  const L = PEN.HALF_LEN * 2; // 1.9
  const R = 0.085; // visual radius
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.08 });
  const darkMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.45 });
  const metalMat = new THREE.MeshStandardMaterial({ color: COLORS.metal, roughness: 0.25, metalness: 0.75 });
  const gripMat = new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.9 });

  const y = R + 0.008;

  // barrel (centered)
  const barrelLen = L * 0.5;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(R, R, barrelLen, 14), bodyMat);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(0.06, y, 0);
  barrel.castShadow = true;
  inner.add(barrel);

  // grip section (front)
  const gripLen = L * 0.16;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.92, R * 0.86, gripLen, 12), gripMat);
  grip.rotation.z = Math.PI / 2;
  grip.position.set(barrelLen / 2 + 0.06 + gripLen / 2 - 0.02, y, 0);
  inner.add(grip);

  // metal tip cone
  const tipLen = L * 0.13;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(R * 0.82, tipLen, 12), metalMat);
  tip.rotation.z = -Math.PI / 2;
  tip.position.set(barrelLen / 2 + 0.06 + gripLen + tipLen / 2 - 0.04, y, 0);
  inner.add(tip);
  // needle point
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.14, 6), metalMat);
  needle.rotation.z = Math.PI / 2;
  needle.position.set(barrelLen / 2 + 0.06 + gripLen + tipLen + 0.05 - 0.04, y, 0);
  inner.add(needle);

  // cap (back)
  const capLen = L * 0.34;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.06, R * 1.06, capLen, 14), darkMat);
  cap.rotation.z = Math.PI / 2;
  cap.position.set(-(barrelLen / 2 + capLen / 2 - 0.1), y, 0);
  cap.castShadow = true;
  inner.add(cap);
  // cap end knob
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.98, R * 0.98, 0.07, 12), darkMat);
  knob.rotation.z = Math.PI / 2;
  knob.position.set(-(barrelLen / 2 + capLen - 0.1) - 0.02, y, 0);
  inner.add(knob);
  // cap clip
  const clip = new THREE.Mesh(new THREE.BoxGeometry(capLen * 0.85, 0.03, 0.05), darkMat);
  clip.position.set(-(barrelLen / 2 + capLen / 2 - 0.1), y + R * 1.02 + 0.02, 0.09);
  clip.rotation.x = 0.12;
  inner.add(clip);
  // colored ring accents
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.05, 0.016, 8, 16), metalMat);
  ring.rotation.y = Math.PI / 2;
  ring.position.set(-(barrelLen / 2) + 0.12, y, 0);
  inner.add(ring);
  // brand band
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.01, R * 1.01, 0.16, 14), new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.5 }));
  band.rotation.z = Math.PI / 2;
  band.position.set(0.32, y, 0);
  inner.add(band);

  // fake blob shadow (crisp directional shadows do the heavy lifting,
  // this adds contact grounding)
  return { group, inner, shadow: new THREE.Mesh() };
}
