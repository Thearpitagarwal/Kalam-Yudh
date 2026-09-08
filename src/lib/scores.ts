// ============================================================
// Pen Fight — local high-score table (localStorage)
// ============================================================

import { STORAGE } from './game/constants';

export interface ScoreEntry {
  name: string;
  streak: number; // consecutive match wins vs computer
  kos: number; // total knockouts in that run
  diff: number; // difficulty at which it happened
  date: string;
}

const MAX_ENTRIES = 8;

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE.scores);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ScoreEntry[];
    if (!Array.isArray(arr)) return [];
    return arr.filter((e) => typeof e?.streak === 'number');
  } catch {
    return [];
  }
}

export function qualifies(streak: number): boolean {
  if (streak <= 0) return false;
  const scores = loadScores();
  if (scores.length < MAX_ENTRIES) return true;
  return streak > scores[scores.length - 1].streak;
}

export function addScore(entry: Omit<ScoreEntry, 'date'>): ScoreEntry[] {
  const scores = loadScores();
  scores.push({ ...entry, date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) });
  scores.sort((a, b) => b.streak - a.streak || b.kos - a.kos);
  const top = scores.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE.scores, JSON.stringify(top));
  } catch { /* ignore */ }
  return top;
}

export function clearScores(): void {
  try {
    localStorage.removeItem(STORAGE.scores);
  } catch { /* ignore */ }
}

export function getStreak(): number {
  try {
    return parseInt(localStorage.getItem(STORAGE.streak) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

export function setStreak(n: number): void {
  try {
    localStorage.setItem(STORAGE.streak, String(n));
  } catch { /* ignore */ }
}

export function getSavedName(): string {
  try {
    return localStorage.getItem(STORAGE.name) ?? '';
  } catch {
    return '';
  }
}

export function saveName(n: string): void {
  try {
    localStorage.setItem(STORAGE.name, n);
  } catch { /* ignore */ }
}
