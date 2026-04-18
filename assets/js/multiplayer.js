/* ================================================================
   MULTIPLAYER - P2P WebRTC via Trystero (BitTorrent DHT, no server)

   Flow:
     Host opens modal → generates room code → joins Trystero room
     Guest enters code → clicks Join → joins same room
     Both connected → host clicks Start → game begins in sync

   Architecture:
     - MP is the global singleton multiplayer state
     - HOST is authoritative: sends dungeon blueprint, monster templates,
       run persistent state, weather/time sync
     - GUEST adopts host's vocabulary/progression for the session
     - Kill events matched by words array, item effects broadcast to both
================================================================ */
import { G } from './state.js';

/* ── Public state ──────────────────────────────────────────────── */
export const MP = {
  active:    false,
  isHost:    false,
  roomCode:  null,
  connected: false,  // remote peer is currently connected
  peerId:    null,

  // Remote player state (what we know about P2)
  p2: {
    avatar:      null,   // avataaars opts object
    emoji:       '🤺',  // fallback emoji
    hp:          5,
    hpMax:       5,
    currentRoom: null,   // { col, row } | null
    wallet:      0,
    lang:        'en',
    ready:       false,  // sent hello / confirmed
    name:        null,
  },

  // Received dungeon blueprint from host (guest only)
  _blueprintPending: null,

  // Received monster templates keyed by 'col:row' (guest only)
  _roomTemplates: {},

  // Guest: host's persistent state applied for this session
  _savedGuestState: null,

  // Teacher: which lessons P2 has passed the test for (to require both)
  _p2TeacherPasses: new Set(),

  // Internal
  _room:  null,
  _send:  null,

  // Callbacks set by game.js
  onP2Join:    null,
  onP2Leave:   null,
  onMessage:   null,
};

/* ── Room code generation ──────────────────────────────────────── */
export function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) c += '-';
    c += chars[Math.floor(Math.random() * chars.length)];
  }
  return c;
}

/* ── Trystero loading ──────────────────────────────────────────── */
let _joinRoomFn = null;

async function _loadTrystero() {
  if (_joinRoomFn) return _joinRoomFn;
  // Using Trystero with BitTorrent DHT strategy - truly serverless P2P
  const mod = await import('https://esm.sh/trystero@0.21.0/torrent');
  _joinRoomFn = mod.joinRoom;
  return _joinRoomFn;
}

function _setupRoom(room) {
  const [send, onMsg] = room.makeAction('msg');

  MP._send = (data) => {
    if (send) {
      try { send(data); } catch (e) { console.warn('[MP] send error', e); }
    }
  };

  onMsg((data, peerId) => {
    MP.peerId = peerId;
    if (MP.onMessage) MP.onMessage(data, peerId);
  });

  room.onPeerJoin((peerId) => {
    MP.peerId    = peerId;
    MP.connected = true;
    if (MP.onP2Join) MP.onP2Join(peerId);
  });

  room.onPeerLeave((peerId) => {
    if (peerId === MP.peerId) {
      MP.connected = false;
      if (MP.onP2Leave) MP.onP2Leave(peerId);
    }
  });
}

/* ── Public API ────────────────────────────────────────────────── */

export async function startHost(roomCode) {
  const joinRoom = await _loadTrystero();
  const room = joinRoom(
    { appId: 'ezra-taja-mp-v1' },
    'r-' + roomCode.replace('-', '')
  );
  MP.active    = true;
  MP.isHost    = true;
  MP.roomCode  = roomCode;
  MP.connected = false;
  MP._room     = room;
  MP._roomTemplates = {};
  MP._p2TeacherPasses = new Set();
  _setupRoom(room);
}

export async function startGuest(roomCode) {
  const joinRoom = await _loadTrystero();
  const room = joinRoom(
    { appId: 'ezra-taja-mp-v1' },
    'r-' + roomCode.replace('-', '')
  );
  MP.active    = true;
  MP.isHost    = false;
  MP.roomCode  = roomCode;
  MP.connected = false;
  MP._room     = room;
  MP._roomTemplates = {};
  MP._blueprintPending = null;
  MP._p2TeacherPasses = new Set();
  _setupRoom(room);
}

/** Send a message to the remote peer (no-op if not connected). */
export function mpSend(data) {
  if (MP._send && MP.connected) MP._send(data);
}

/** Disconnect and reset all multiplayer state. */
export function leaveMultiplayer() {
  try { MP._room?.leave?.(); } catch (_) {}
  // Restore guest's own persistent state if it was overridden
  if (!MP.isHost && MP._savedGuestState && typeof window !== 'undefined') {
    _restoreGuestState();
  }
  MP.active      = false;
  MP.connected   = false;
  MP.isHost      = false;
  MP.roomCode    = null;
  MP._room       = null;
  MP._send       = null;
  MP.peerId      = null;
  MP._blueprintPending = null;
  MP._roomTemplates    = {};
  MP._savedGuestState  = null;
  MP._p2TeacherPasses  = new Set();
  MP.p2.ready    = false;
  MP.p2.currentRoom = null;
  MP.p2.hp  = 5;
  MP.p2.hpMax = 5;
}

/* ── Persistent state sync (guest adopts host vocabulary) ──────── */

/** Host calls this to get a compact persistent state snapshot to send. */
export function getHostPersistentSnapshot() {
  return {
    wordKillCounts:      G.wordKillCounts      || {},
    wordHiddenStatus:    G.wordHiddenStatus     || {},
    wordConjugationCounts: G.wordConjugationCounts || {},
    completedLessons:    G.completedLessons     || [],
    learnedWords:        G.learnedWords         || [],
    relThreshold:        G.relThreshold         ?? 90,
  };
}

/** Guest calls this after receiving host's persistent state. */
export function applyHostPersistentState(snap) {
  // Save guest's own state first
  MP._savedGuestState = {
    wordKillCounts:       G.wordKillCounts,
    wordHiddenStatus:     G.wordHiddenStatus,
    wordConjugationCounts: G.wordConjugationCounts,
    completedLessons:     G.completedLessons,
    learnedWords:         G.learnedWords,
    relThreshold:         G.relThreshold,
  };
  // Apply host's state (affects which words spawn as monsters)
  G.wordKillCounts        = snap.wordKillCounts       || {};
  G.wordHiddenStatus      = snap.wordHiddenStatus      || {};
  G.wordConjugationCounts = snap.wordConjugationCounts || {};
  G.completedLessons      = snap.completedLessons      || [];
  G.learnedWords          = snap.learnedWords          || [];
  G.relThreshold          = snap.relThreshold          ?? 90;
}

function _restoreGuestState() {
  const s = MP._savedGuestState;
  if (!s) return;
  G.wordKillCounts        = s.wordKillCounts;
  G.wordHiddenStatus      = s.wordHiddenStatus;
  G.wordConjugationCounts = s.wordConjugationCounts;
  G.completedLessons      = s.completedLessons;
  G.learnedWords          = s.learnedWords;
  G.relThreshold          = s.relThreshold;
  MP._savedGuestState = null;
}

/* ── Room template store (guest) ───────────────────────────────── */

export function storeMpTemplates(col, row, templates) {
  MP._roomTemplates[`${col}:${row}`] = templates;
}

export function getMpTemplates(col, row) {
  return MP._roomTemplates[`${col}:${row}`] || null;
}
