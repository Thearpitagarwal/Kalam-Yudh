'use client';

// ============================================================
// Pen Fight — React shell: menus, HUD, overlays, high scores.
// The three.js engine lives behind everything on a canvas.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Check,
  Copy,
  Flame,
  Hand,
  Home,
  Keyboard,
  Loader2,
  Pause,
  RotateCcw,
  Swords,
  Target,
  Trash2,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import type {
  GameEngine,
  GameOverResult,
  GamePhase,
  NetStatus,
  ToastKind,
  TurnInfo,
} from '@/lib/game/engine';
import { DIFFICULTY, Mode, PHYS } from '@/lib/game/constants';
import {
  addScore,
  clearScores,
  getSavedName,
  getStreak,
  loadScores,
  saveName,
  ScoreEntry,
} from '@/lib/scores';

// ---------------- types ----------------

type Screen = 'boot' | 'menu' | 'lobby' | 'game';
type Overlay = 'none' | 'pause' | 'gameover' | 'scores';

interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
}

const TOAST_STYLE: Record<ToastKind, string> = {
  hit: 'text-emerald-300 text-4xl sm:text-5xl',
  miss: 'text-rose-300 text-3xl sm:text-4xl',
  ko: 'text-amber-300 text-5xl sm:text-7xl',
  streak: 'text-orange-300 text-4xl sm:text-6xl',
  info: 'text-[#f6f2e4] text-2xl sm:text-3xl',
};

// ===============================================================

export default function GameUI() {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const toastId = useRef(0);

  // imperative power bar refs (no re-render at 60fps)
  const chargeWrapRef = useRef<HTMLDivElement>(null);
  const chargeFillRef = useRef<HTMLDivElement>(null);
  const chargeLabelRef = useRef<HTMLDivElement>(null);

  const [screen, setScreen] = useState<Screen>('boot');
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [bootError, setBootError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('cpu');
  const [isHost, setIsHost] = useState(true);
  const [difficulty, setDifficulty] = useState(1);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [turnInfo, setTurnInfo] = useState<TurnInfo | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [gameOver, setGameOver] = useState<GameOverResult | null>(null);
  const [netStatus, setNetStatus] = useState<NetStatus>({ status: 'idle' });
  const [muted, setMuted] = useState(false);
  const [bestStreak, setBestStreak] = useState(0);
  const [rematchWaiting, setRematchWaiting] = useState(false);

  // lobby local state
  const [lobbyTab, setLobbyTab] = useState<'create' | 'join'>('create');
  const [joinCode, setJoinCode] = useState('');
  const [lobbyError, setLobbyError] = useState('');
  const [copied, setCopied] = useState(false);

  // high-score local state
  const [entries, setEntries] = useState<ScoreEntry[]>([]);
  const [hsName, setHsName] = useState('');
  const [hsSaved, setHsSaved] = useState(false);

  const pushToast = useCallback((text: string, kind: ToastKind) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 1600);
  }, []);

  // ---------- engine bootstrap ----------

  useEffect(() => {
    let disposed = false;
    let engine: GameEngine | null = null;

    const boot = async () => {
      try {
        const mod = await import('@/lib/game/engine');
        if (disposed || !mountRef.current) return;
        engine = new mod.GameEngine(mountRef.current, {
          onPhase: (p: GamePhase) => {
            if (p === 'menu') {
              setScreen('menu');
              setOverlay('none');
              setGameOver(null);
              setTurnInfo(null);
              setRematchWaiting(false);
            } else if (p === 'over') {
              setOverlay('gameover');
            } else {
              setOverlay((o) => (o === 'gameover' && p === 'aiming' ? 'none' : o === 'pause' ? o : 'none'));
              if (p === 'aiming') setRematchWaiting(false);
            }
          },
          onScores: (a, b) => setScores([a, b]),
          onTurn: (t) => setTurnInfo(t),
          onToast: (text, kind) => pushToast(text, kind),
          onCharge: (power, label) => {
            const wrap = chargeWrapRef.current;
            if (!wrap) return;
            if (power === null || power <= 0.02) {
              wrap.style.opacity = '0';
              wrap.style.transform = 'translate(-50%, 12px)';
              return;
            }
            wrap.style.opacity = '1';
            wrap.style.transform = 'translate(-50%, 0)';
            if (chargeFillRef.current) chargeFillRef.current.style.width = `${Math.round(power * 100)}%`;
            if (chargeLabelRef.current) chargeLabelRef.current.textContent = `${label ?? ''} · ${Math.round(power * 100)}%`;
          },
          onPause: (paused) => setOverlay(paused ? 'pause' : 'none'),
          onGameOver: (r) => {
            setGameOver(r);
            setBestStreak(getStreak());
            setHsName(getSavedName());
            setHsSaved(false);
          },
          onNetStatus: (s) => {
            setNetStatus(s);
            if (s.status === 'paired') {
              setScreen('game');
              setOverlay('none');
              setLobbyError('');
            }
            if (s.status === 'error') setLobbyError(s.error ?? 'Connection failed');
          },
        });
        engineRef.current = engine;
        setMuted(engine.muted);
        setBestStreak(getStreak());
        setScreen('menu');
      } catch (err) {
        console.error(err);
        setBootError('Could not start the 3D classroom. Your browser may not support WebGL.');
      }
    };
    void boot();
    return () => {
      disposed = true;
      engine?.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- keyboard shortcuts for overlays ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') {
        toggleMute();
        return;
      }
      if (overlay === 'gameover' && (e.key === 'Enter' || e.key === 'r' || e.key === 'R')) {
        handleRematch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay, gameOver, mode, isHost]);

  // ---------- actions ----------

  const startCpu = useCallback(() => {
    engineRef.current?.startMatch({ mode: 'cpu', difficulty });
    setIsHost(true);
    setMode('cpu');
    setScores([0, 0]);
    setGameOver(null);
    setScreen('game');
    setOverlay('none');
  }, [difficulty]);

  const startLocal = useCallback(() => {
    engineRef.current?.startMatch({ mode: 'local' });
    setIsHost(true);
    setMode('local');
    setScores([0, 0]);
    setGameOver(null);
    setScreen('game');
    setOverlay('none');
  }, []);

  const handleRematch = useCallback(() => {
    if (mode === 'online' && !isHost) {
      engineRef.current?.requestRestart();
      setRematchWaiting(true);
      return;
    }
    engineRef.current?.requestRestart();
    setGameOver(null);
    setOverlay('none');
  }, [mode, isHost]);

  const handleQuit = useCallback(() => {
    engineRef.current?.quitToMenu();
    engineRef.current?.setPaused(false);
    setGameOver(null);
    setScreen('menu');
    setOverlay('none');
    setBestStreak(getStreak());
  }, []);

  const toggleMute = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    e.setMuted(!e.muted);
    setMuted(e.muted);
  }, []);

  const handleCreateRoom = useCallback(() => {
    setLobbyError('');
    setIsHost(true);
    setMode('online');
    engineRef.current?.hostOnline().catch(() => { /* surfacing via status */ });
  }, []);

  const handleJoinRoom = useCallback(() => {
    setLobbyError('');
    setIsHost(false);
    setMode('online');
    engineRef.current?.joinOnline(joinCode).catch(() => { /* via status */ });
  }, [joinCode]);

  const handleCancelLobby = useCallback(() => {
    engineRef.current?.leaveNet();
    setNetStatus({ status: 'idle' });
    setScreen('menu');
    setLobbyError('');
    setJoinCode('');
  }, []);

  const copyCode = useCallback(() => {
    if (!netStatus.code) return;
    try {
      void navigator.clipboard?.writeText(netStatus.code);
    } catch { /* ignore */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }, [netStatus.code]);

  const saveHighScore = useCallback(() => {
    if (!gameOver?.streakToSubmit) return;
    const name = hsName.trim().slice(0, 12) || 'ANONYMOUS';
    saveName(name);
    addScore({ name, streak: gameOver.streakToSubmit, kos: totalKos(gameOver), diff: difficulty });
    setHsSaved(true);
  }, [gameOver, hsName, difficulty]);

  // ---------- derived ----------

  const plaqueNames = useMemo<[string, string]>(() => {
    if (mode === 'cpu') return ['YOU', DIFFICULTY[difficulty].aiName.toUpperCase()];
    if (mode === 'local') return ['P1', 'P2'];
    return isHost ? ['YOU', 'FOE'] : ['FOE', 'YOU'];
  }, [mode, difficulty, isHost]);

  const winnerHeading = useMemo(() => {
    if (!gameOver) return '';
    if (gameOver.mode === 'cpu') return gameOver.winnerIdx === 0 ? 'YOU WIN!' : `${gameOver.winnerName} WINS`;
    if (gameOver.mode === 'local') return `${gameOver.winnerName} WINS!`;
    return gameOver.winnerIdx === (isHost ? 0 : 1) ? 'YOU WIN!' : 'OPPONENT WINS';
  }, [gameOver, isHost]);

  // ===============================================================
  // render
  // ===============================================================

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#1a3a2d]" style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}>
      {/* 3D canvas mount */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* immersion overlays */}
      <div className="pointer-events-none absolute inset-0 vignette" />
      <div className="pointer-events-none absolute inset-0 grain-overlay" />

      {/* ================= BOOT ================= */}
      {screen === 'boot' && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-[#143429]">
          <div className="flex flex-col items-center gap-5">
            {bootError ? (
              <div className="chalk-panel max-w-sm p-8 text-center">
                <p className="font-display text-lg text-rose-200">{bootError}</p>
              </div>
            ) : (
              <>
                <PenMark className="pen-float" size={54} />
                <div className="font-display text-2xl font-800 tracking-[0.18em] text-[#f6f2e4]/90">
                  SHARPENING PENS…
                </div>
                <Loader2 className="spin-slow text-[#ffb444]" size={30} />
              </>
            )}
          </div>
        </div>
      )}

      {/* ================= MENU ================= */}
      {screen === 'menu' && (
        <div className="absolute inset-0 z-30 flex flex-col justify-between p-5 sm:p-9">
          {/* top bar */}
          <div className="flex items-start justify-between fade-up">
            <div className="hint-chip rounded-full px-4 py-1.5 text-xs tracking-[.18em] font-semibold">
              CLASS 10-B · PERIOD 6 · NO TEACHERS AROUND
            </div>
            <div className="flex gap-2.5">
              <button className="icon-btn" onClick={() => { setEntries(loadScores()); setOverlay('scores'); }} aria-label="High scores">
                <Trophy size={19} />
              </button>
              <button className="icon-btn" onClick={toggleMute} aria-label="Toggle sound">
                {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
              </button>
            </div>
          </div>

          {/* title + actions */}
          <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <div className="fade-up">
              <div className="relative inline-block">
                <PenMark className="absolute -top-12 -left-2 wiggle" size={44} />
                <h1 className="font-display font-800 leading-[0.92] text-[#f6f2e4] text-[clamp(3.4rem,11vw,7.5rem)] tracking-tight drop-shadow-[0_6px_0_rgba(15,8,2,0.35)]">
                  PEN
                  <br />
                  <span className="chalk-underline text-[#ffb444]">FIGHT</span>
                </h1>
              </div>
              <p className="font-hand mt-5 text-2xl sm:text-3xl text-[#f6f2e4]/85">
                the legendary classroom desk duel — flick, spin, knock &apos;em off!
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[#f6f2e4]/75 text-sm">
                <span className="hint-chip rounded-full px-3 py-1 inline-flex items-center gap-1.5"><Hand size={14} /> drag &amp; release</span>
                <span className="hint-chip rounded-full px-3 py-1 inline-flex items-center gap-1.5"><Keyboard size={14} /> A/D aim · SPACE charge</span>
                <span className="hint-chip rounded-full px-3 py-1 inline-flex items-center gap-1.5"><Target size={14} /> first to {PHYS.WIN_SCORE}</span>
              </div>
            </div>

            <div className="w-full max-w-xs space-y-3 fade-up">
              <button className="chalk-btn chalk-btn--amber w-full text-lg" onClick={startCpu}>
                <Bot size={22} /> VS COMPUTER
              </button>
              {/* difficulty chips */}
              <div className="flex gap-2">
                {DIFFICULTY.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setDifficulty(d.id)}
                    className={`flex-1 rounded-xl border-2 px-1 py-2 text-center transition-all ${
                      difficulty === d.id
                        ? 'border-[#ffe2ae] bg-[#ffb444]/15 shadow-[0_8px_20px_rgba(232,147,12,0.25)]'
                        : 'border-dashed border-[rgba(246,242,228,0.3)] bg-transparent hover:border-[rgba(246,242,228,0.6)]'
                    }`}
                  >
                    <div className={`font-display text-[11px] font-700 tracking-wide ${difficulty === d.id ? 'text-[#ffd58a]' : 'text-[#f6f2e4]/70'}`}>
                      {d.label.toUpperCase()}
                    </div>
                    <div className={`text-[10px] ${difficulty === d.id ? 'text-[#ffd58a]/80' : 'text-[#f6f2e4]/45'}`}>{d.sub} · {d.aiName}</div>
                  </button>
                ))}
              </div>
              <button className="chalk-btn w-full" onClick={startLocal}>
                <Users size={20} /> PASS &amp; PLAY
              </button>
              <button className="chalk-btn w-full" onClick={() => { setScreen('lobby'); setLobbyTab('create'); setLobbyError(''); }}>
                <Wifi size={20} /> PLAY ONLINE
              </button>
              <button className="chalk-btn w-full" onClick={() => { setEntries(loadScores()); setOverlay('scores'); }}>
                <Trophy size={19} /> LEGENDS BOARD
              </button>
              {bestStreak > 0 && (
                <div className="hint-chip rounded-full px-4 py-1.5 text-center font-display text-xs tracking-widest text-[#ffd58a]">
                  <Flame size={13} className="mr-1 inline" /> ACTIVE WIN STREAK: {bestStreak}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= ONLINE LOBBY ================= */}
      {screen === 'lobby' && (
        <div className="absolute inset-0 z-30 grid place-items-center p-4">
          <div className="chalk-panel card-in w-full max-w-md p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <button className="icon-btn" onClick={handleCancelLobby} aria-label="Back">
                <ArrowLeft size={18} />
              </button>
              <h2 className="font-display text-2xl font-800 tracking-wide">PLAY ONLINE</h2>
              <div className="w-11" />
            </div>
            <div className="chalk-hr my-4" />

            {/* tabs */}
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`chalk-btn ${lobbyTab === 'create' ? 'chalk-btn--amber' : ''}`}
                onClick={() => { setLobbyTab('create'); setLobbyError(''); }}
              >
                <Swords size={17} /> CREATE
              </button>
              <button
                className={`chalk-btn ${lobbyTab === 'join' ? 'chalk-btn--amber' : ''}`}
                onClick={() => { setLobbyTab('join'); setLobbyError(''); }}
              >
                <Wifi size={17} /> JOIN
              </button>
            </div>

            <div className="mt-6 min-h-[190px]">
              {lobbyTab === 'create' ? (
                netStatus.status === 'waiting' && netStatus.code ? (
                  <div className="flex flex-col items-center gap-4 text-center">
                    <p className="font-hand text-2xl text-[#f6f2e4]/85">shout this code across the classroom:</p>
                    <div className="chalk-frame px-8 py-4">
                      <div className="code-letters text-5xl text-[#ffb444]">{netStatus.code}</div>
                    </div>
                    <button className="chalk-btn" onClick={copyCode}>
                      {copied ? <Check size={17} className="text-emerald-300" /> : <Copy size={17} />}
                      {copied ? 'COPIED!' : 'COPY CODE'}
                    </button>
                    <div className="flex items-center gap-2 text-[#f6f2e4]/70 text-sm pulse-soft">
                      <Loader2 size={16} className="spin-slow" /> waiting for your rival to join…
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 text-center pt-2">
                    <p className="font-hand text-2xl leading-snug text-[#f6f2e4]/85">
                      open a secret room and get a 4-letter code.<br />your friend joins with it — pens ready!
                    </p>
                    <button
                      className="chalk-btn chalk-btn--amber px-8"
                      onClick={handleCreateRoom}
                      disabled={netStatus.status === 'connecting'}
                    >
                      {netStatus.status === 'connecting' ? <Loader2 size={18} className="spin-slow" /> : <Swords size={18} />}
                      CREATE ROOM
                    </button>
                  </div>
                )
              ) : netStatus.status === 'connecting' && joinCode.length === 4 ? (
                <div className="flex flex-col items-center gap-4 pt-8 text-center">
                  <Loader2 size={26} className="spin-slow text-[#ffb444]" />
                  <p className="font-hand text-2xl text-[#f6f2e4]/85">sneaking into {joinCode.toUpperCase()}…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 pt-2">
                  <p className="font-hand text-2xl text-[#f6f2e4]/85">type the code your friend created:</p>
                  <input
                    className="room-input w-56 rounded-xl px-4 py-3 text-center text-3xl"
                    maxLength={4}
                    value={joinCode}
                    onChange={(e) => {
                      setJoinCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4));
                      setLobbyError('');
                    }}
                    placeholder="CODE"
                    autoComplete="off"
                  />
                  <button
                    className="chalk-btn chalk-btn--amber px-8"
                    disabled={joinCode.length !== 4}
                    onClick={handleJoinRoom}
                  >
                    <Wifi size={18} /> JOIN ROOM
                  </button>
                </div>
              )}
              {lobbyError && (
                <p className="mt-4 text-center font-display text-sm font-700 tracking-wide text-rose-300">{lobbyError}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= GAME HUD ================= */}
      {screen === 'game' && (
        <>
          {/* score plaque */}
          <div className="absolute left-1/2 top-3 z-30 -translate-x-1/2 sm:top-5">
            <div className="hud-plaque flex items-center gap-3 px-4 py-2 sm:gap-5 sm:px-6 sm:py-2.5">
              <PlayerChip name={plaqueNames[0]} color="#3d7bfd" score={scores[0]} active={turnInfo?.turn === 0} align="right" />
              <div className="flex flex-col items-center px-1">
                <span className="font-display text-[10px] font-800 tracking-[0.3em] text-[#f6f2e4]/60">VS</span>
                <span className="font-hand text-lg leading-none text-[#ffb444]">first to {PHYS.WIN_SCORE}</span>
              </div>
              <PlayerChip name={plaqueNames[1]} color="#fb5f76" score={scores[1]} active={turnInfo?.turn === 1} align="left" />
            </div>
          </div>

          {/* turn banner */}
          {turnInfo && (
            <div className="absolute left-1/2 top-[4.6rem] z-30 -translate-x-1/2 text-center sm:top-24">
              <div className={`font-display font-800 tracking-[0.14em] transition-colors text-sm sm:text-base ${turnInfo.canInput ? 'text-[#ffd58a]' : 'text-[#f6f2e4]/85'}`}>
                {turnInfo.label}
              </div>
              <div className="text-xs text-[#f6f2e4]/60">{turnInfo.sub}</div>
            </div>
          )}

          {/* room chip (online) */}
          {mode === 'online' && netStatus.code && (
            <div className="absolute left-3 top-3 z-30 hint-chip rounded-full px-3.5 py-1.5 font-display text-xs font-700 tracking-[0.25em] sm:left-5 sm:top-5">
              ROOM {netStatus.code}
            </div>
          )}

          {/* syncing (guest waiting for first snapshot) */}
          {mode === 'online' && !turnInfo && (
            <div className="absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2">
              <div className="hud-plaque flex items-center gap-3 px-6 py-3">
                <Loader2 size={18} className="spin-slow text-[#ffb444]" />
                <span className="font-hand text-2xl">syncing pens…</span>
              </div>
            </div>
          )}

          {/* top-right controls */}
          <div className="absolute right-3 top-3 z-30 flex gap-2.5 sm:right-5 sm:top-5">
            <button className="icon-btn" onClick={toggleMute} aria-label="Toggle sound">
              {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
            </button>
            <button className="icon-btn" onClick={() => engineRef.current?.setPaused(true)} aria-label="Pause">
              <Pause size={19} />
            </button>
          </div>

          {/* controls hint */}
          {turnInfo?.canInput && overlay === 'none' && (
            <div className="absolute bottom-24 left-3 z-30 hidden sm:block sm:left-5">
              <div className="hint-chip rounded-2xl px-4 py-2.5 text-xs leading-relaxed">
                <div className="flex items-center gap-2"><Hand size={14} className="text-[#ffd58a]" /> pull back on your pen, release to flick</div>
                <div className="mt-1 flex items-center gap-2"><Keyboard size={14} className="text-[#ffd58a]" /> A/D or ←→ aim · SPACE charge · ESC pause</div>
              </div>
            </div>
          )}

          {/* power bar (imperatively driven) */}
          <div
            ref={chargeWrapRef}
            className="pointer-events-none absolute bottom-8 left-1/2 z-30 w-[min(420px,74vw)] opacity-0 transition-all duration-150"
            style={{ transform: 'translate(-50%, 12px)' }}
          >
            <div className="power-track relative h-5 overflow-hidden rounded-full">
              <div ref={chargeFillRef} className="power-fill h-full rounded-full transition-[width] duration-75" style={{ width: '0%' }} />
            </div>
            <div ref={chargeLabelRef} className="mt-1.5 text-center font-hand text-xl text-[#f6f2e4]/90 drop-shadow-[0_2px_0_rgba(15,8,2,0.4)]" />
          </div>
        </>
      )}

      {/* ================= TOASTS ================= */}
      <div className="pointer-events-none absolute left-1/2 top-[32%] z-40 flex w-full -translate-x-1/2 flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-item text-center ${TOAST_STYLE[t.kind]}`}>
            {t.kind === 'streak' && <Flame className="mr-2 inline -mt-2 text-orange-400" size={34} />}
            {t.text}
          </div>
        ))}
      </div>

      {/* ================= PAUSE ================= */}
      {overlay === 'pause' && screen === 'game' && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-[#0d241b]/60 p-4 backdrop-blur-[3px]">
          <div className="chalk-panel card-in w-full max-w-sm p-7 text-center">
            <h2 className="font-display text-3xl font-800 tracking-[0.2em]">PAUSED</h2>
            <div className="font-hand mt-1 text-2xl text-[#f6f2e4]/70">teacher walked by… act natural</div>
            <div className="chalk-hr my-5" />
            <div className="space-y-3">
              <button className="chalk-btn chalk-btn--amber w-full" onClick={() => engineRef.current?.setPaused(false)}>
                <Zap size={18} /> RESUME
              </button>
              <button className="chalk-btn w-full" onClick={() => { engineRef.current?.setPaused(false); engineRef.current?.requestRestart(); setGameOver(null); }}>
                <RotateCcw size={17} /> RESTART MATCH
              </button>
              <button className="chalk-btn w-full" onClick={handleQuit}>
                <Home size={17} /> QUIT TO CLASS
              </button>
            </div>
            <div className="hint-chip mt-5 rounded-xl px-4 py-2.5 text-left text-xs leading-relaxed">
              <div className="flex items-center gap-2"><Hand size={13} className="shrink-0 text-[#ffd58a]" /> drag back on your pen &amp; release to flick</div>
              <div className="mt-1 flex items-center gap-2"><Keyboard size={13} className="shrink-0 text-[#ffd58a]" /> A/D aim · SPACE charge &amp; release · M mute</div>
            </div>
          </div>
        </div>
      )}

      {/* ================= GAME OVER ================= */}
      {overlay === 'gameover' && gameOver && screen === 'game' && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-[#0d241b]/55 p-4 backdrop-blur-[3px]">
          <div className="chalk-panel card-in w-full max-w-md p-6 sm:p-8">
            <div className="flex flex-col items-center text-center">
              <div className="bounce-ghost"><Trophy size={52} className="text-[#ffb444]" /></div>
              <h2 className="font-display mt-2 text-4xl font-800 tracking-wide sm:text-5xl">{winnerHeading}</h2>
              <div className="font-hand text-2xl text-[#f6f2e4]/75">
                {gameOver.kos[0]} — {gameOver.kos[1]} · {mode === 'cpu' ? DIFFICULTY[difficulty].label : mode === 'online' ? `room ${netStatus.code ?? ''}` : 'pass & play'}
              </div>
              {gameOver.mode === 'cpu' && gameOver.winStreak > 0 && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#ffb444]/60 bg-[#ffb444]/10 px-4 py-1 font-display text-sm font-700 tracking-widest text-[#ffd58a]">
                  <Flame size={15} /> WIN STREAK: {gameOver.winStreak}
                </div>
              )}
            </div>
            <div className="chalk-hr my-5" />

            {/* stats */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <StatCell label="FLICKS" a={gameOver.flicks[0]} b={gameOver.flicks[1]} names={plaqueNames} />
              <StatCell label="HITS" a={gameOver.hits[0]} b={gameOver.hits[1]} names={plaqueNames} />
              <StatCell
                label="ACCURACY"
                a={pct(gameOver.hits[0], gameOver.flicks[0])}
                b={pct(gameOver.hits[1], gameOver.flicks[1])}
                names={plaqueNames}
              />
            </div>

            {/* high score submit */}
            {gameOver.streakToSubmit ? (
              <div className="chalk-frame mt-5 p-4">
                {hsSaved ? (
                  <div className="flex items-center justify-center gap-2 font-display font-700 tracking-widest text-emerald-300">
                    <Check size={18} /> SAVED TO THE LEGENDS BOARD!
                  </div>
                ) : (
                  <>
                    <div className="text-center font-hand text-2xl text-[#ffd58a]">
                      your win streak of {gameOver.streakToSubmit} makes the legends board!
                    </div>
                    <div className="mt-2.5 flex gap-2">
                      <input
                        value={hsName}
                        onChange={(e) => setHsName(e.target.value.toUpperCase().slice(0, 12))}
                        placeholder="YOUR NAME"
                        maxLength={12}
                        className="room-input flex-1 rounded-xl px-3 py-2 text-lg tracking-[0.25em] [text-indent:0.25em]"
                        style={{ letterSpacing: '0.2em', textIndent: '0.2em' }}
                      />
                      <button className="chalk-btn chalk-btn--amber px-4" onClick={saveHighScore}>
                        <Trophy size={17} /> SAVE
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button className="chalk-btn chalk-btn--amber flex-1" onClick={handleRematch} disabled={rematchWaiting} autoFocus>
                {rematchWaiting ? <Loader2 size={18} className="spin-slow" /> : <RotateCcw size={18} />}
                {mode === 'online' ? (rematchWaiting ? 'WAITING…' : 'REQUEST REMATCH') : 'REMATCH'}
              </button>
              <button className="chalk-btn flex-1" onClick={handleQuit}>
                <Home size={17} /> MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= HIGH SCORES ================= */}
      {overlay === 'scores' && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-[#0d241b]/60 p-4 backdrop-blur-[3px]">
          <div className="paper-panel card-in w-full max-w-md p-6 sm:p-8" style={{ transform: 'rotate(0.4deg)' }}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-800 tracking-[0.12em] text-[#33251a]">
                <Trophy className="mr-2 -mt-1 inline text-[#e8930c]" size={24} />
                LEGENDS BOARD
              </h2>
              <button className="icon-btn !border-[#33251a]/40 !bg-transparent !text-[#33251a]" onClick={() => setOverlay(screen === 'game' && engineRef.current?.isPaused ? 'pause' : 'none')} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p className="font-hand text-xl text-[#6d5a3d]">longest win streaks vs the computer — chalked up on this very desk</p>

            <div className="mt-4 space-y-0">
              {entries.length === 0 && (
                <div className="py-8 text-center font-hand text-2xl text-[#6d5a3d]">
                  the board is blank… go write history.
                </div>
              )}
              {entries.map((e, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-dashed border-[#33251a]/15 py-[7px]">
                  <span className={`font-display w-7 text-center font-800 ${i === 0 ? 'text-[#e8930c]' : i === 1 ? 'text-[#8b8f98]' : i === 2 ? 'text-[#b07a3e]' : 'text-[#33251a]/50'}`}>
                    {i + 1}
                  </span>
                  <span className="font-hand flex-1 text-2xl font-600 text-[#33251a]">{e.name}</span>
                  <span className="hint-chip !border-[#33251a]/25 !bg-[#33251a]/5 !text-[#33251a]/70 rounded-full px-2 py-0.5 text-[10px] font-700">
                    {DIFFICULTY[e.diff]?.sub ?? ''}
                  </span>
                  <span className="font-display w-16 text-right font-800 text-[#33251a]">
                    x{e.streak} <Swords className="ml-0.5 inline -mt-0.5" size={13} />
                  </span>
                  <span className="w-14 text-right text-xs text-[#6d5a3d]">{e.date}</span>
                </div>
              ))}
            </div>

            {entries.length > 0 && (
              <button
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-700 tracking-widest text-[#a4382e] opacity-70 hover:opacity-100"
                onClick={() => { clearScores(); setEntries([]); }}
              >
                <Trash2 size={13} /> WIPE THE BOARD
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- subcomponents ----------------

function PlayerChip({ name, color, score, active, align }: { name: string; color: string; score: number; active?: boolean; align: 'left' | 'right' }) {
  const dots = [];
  for (let i = 0; i < PHYS.WIN_SCORE; i++) {
    dots.push(
      <span
        key={i}
        className="tally-dot"
        style={{
          background: i < score ? color : 'transparent',
          boxShadow: i < score ? `0 0 8px ${color}` : 'none',
        }}
      />
    );
  }
  return (
    <div className={`flex items-center gap-2.5 ${align === 'right' ? 'flex-row' : 'flex-row-reverse'}`}>
      <div className={`${align === 'right' ? 'text-right' : 'text-left'}`}>
        <div className={`font-display text-sm font-800 tracking-wider transition-colors sm:text-base ${active ? 'text-[#ffd58a]' : 'text-[#f6f2e4]/80'}`}>
          {name}
          {active && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[#ffd58a] align-middle pulse-soft" />}
        </div>
        <div className={`mt-1 flex gap-1.5 ${align === 'right' ? 'justify-end' : ''}`}>{dots}</div>
      </div>
      <span className="h-4 w-4 rounded-full border-2 border-white/50" style={{ background: color, boxShadow: `0 0 10px ${color}66` }} />
    </div>
  );
}

function StatCell({ label, a, b, names }: { label: string; a: string | number; b: string | number; names: [string, string] }) {
  return (
    <div className="chalk-frame px-2 py-2.5">
      <div className="font-display text-[10px] font-800 tracking-[0.2em] text-[#f6f2e4]/55">{label}</div>
      <div className="mt-1.5 text-sm">
        <div className="flex justify-between px-1">
          <span className="text-[#8fb4ff] font-700 font-display">{names[0].slice(0, 6)}</span>
          <span className="font-display font-800">{a}</span>
        </div>
        <div className="flex justify-between px-1">
          <span className="text-[#ff9dade0] font-700 font-display">{names[1].slice(0, 6)}</span>
          <span className="font-display font-800">{b}</span>
        </div>
      </div>
    </div>
  );
}

function PenMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <g transform="rotate(38 32 32)">
        <rect x="12" y="27" width="30" height="10" rx="4" fill="#3d7bfd" stroke="#1e3a8a" strokeWidth="2" />
        <rect x="8" y="27.5" width="7" height="9" rx="3" fill="#1e3a8a" />
        <path d="M42 28 L54 32 L42 36 Z" fill="#d7dce4" stroke="#8b93a5" strokeWidth="1.6" />
        <circle cx="54.5" cy="32" r="1.6" fill="#33251a" />
        <rect x="20" y="24.5" width="14" height="3" rx="1.5" fill="#ffd58a" opacity="0.9" />
      </g>
    </svg>
  );
}

function pct(hits: number, flicks: number): string {
  if (!flicks) return '—';
  return `${Math.round((hits / flicks) * 100)}%`;
}

function totalKos(g: GameOverResult): number {
  return g.kos[0] + g.kos[1];
}
