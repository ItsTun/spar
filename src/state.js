// state.js — durable state for spar, kept OUTSIDE the plugin install dir
// (the plugin cache is wiped on update; your streak must survive that).
// Resolution: $SPAR_DATA → %APPDATA%\spar (win) → $XDG_DATA_HOME/spar → ~/.local/share/spar
// Pure Node, no deps.

const fs = require("fs");
const os = require("os");
const path = require("path");

const SCHEMA_VERSION = 1;

function dataDir() {
  if (process.env.SPAR_DATA) return process.env.SPAR_DATA;
  if (process.platform === "win32" && process.env.APPDATA) return path.join(process.env.APPDATA, "spar");
  if (process.env.XDG_DATA_HOME) return path.join(process.env.XDG_DATA_HOME, "spar");
  return path.join(os.homedir(), ".local", "share", "spar");
}

const DATA = dataDir();
const SESSIONS_DIR = path.join(DATA, "sessions");
const STATS = path.join(DATA, "stats.json");
const RECENT = path.join(DATA, "recent.json");
const CONFIG = path.join(DATA, "config.json");
const OLD_PROTOTYPE = path.join(os.homedir(), ".claude", "prep", "state"); // migrate from the prototype

function ensure() {
  try { fs.mkdirSync(SESSIONS_DIR, { recursive: true }); } catch (_) {}
}
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { return fallback; }
}
function writeJSON(file, obj) {
  ensure();
  const tmp = `${file}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, file); // atomic: readers never see a half-written file
    return true;
  } catch (_) { return false; }
}

// ── config ────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  version: SCHEMA_VERSION,
  enabled: true,
  pausedUntil: null,     // epoch ms; hooks no-op until then
  showPrompt: false,     // PRIVACY: do not store your prompt text unless you opt in
  ascii: false,          // force ASCII borders/spinner
  difficulty: "all",     // all | easy | medium | hard
  topics: [],            // substrings matched against a problem's pattern
  dailyGoal: 5,
};
function loadConfig() { return { ...DEFAULT_CONFIG, ...(readJSON(CONFIG, {}) || {}) }; }
function saveConfig(c) { return writeJSON(CONFIG, { ...DEFAULT_CONFIG, ...c }); }
function isActive(cfg) {
  const c = cfg || loadConfig();
  if (!c.enabled) return false;
  if (c.pausedUntil && Date.now() < c.pausedUntil) return false;
  return true;
}

// ── stats (watcher is the SOLE writer; hooks read-only) ─────────────────
function freshStats() {
  return { version: SCHEMA_VERSION, attempted: 0, solved: 0, streak: 0, bestStreak: 0,
    days: {}, problems: {} };
}
function migrateFromPrototype() {
  const old = readJSON(path.join(OLD_PROTOTYPE, "stats.json"), null);
  if (old && typeof old === "object") {
    const s = { ...freshStats(), ...old, version: SCHEMA_VERSION };
    s.problems = old.problems || {};
    s.days = s.days || {};
    writeJSON(STATS, s);
    return s;
  }
  return null;
}
function loadStats() {
  let s = readJSON(STATS, null);
  if (!s) s = migrateFromPrototype() || freshStats();
  s.problems = s.problems || {};
  s.days = s.days || {};
  return s;
}
const saveStats = (s) => writeJSON(STATS, s);

// ── recent ring (hooks own this; decouples hook writes from stats.json) ──
function loadRecent() { const r = readJSON(RECENT, null); return Array.isArray(r) ? r : []; }
function pushRecent(id, keep = 8) {
  const r = loadRecent().filter((x) => x !== id);
  r.push(id);
  writeJSON(RECENT, r.slice(-keep));
}

// ── per-session active problem ──────────────────────────────────────────
const safeId = (id) => String(id || "default").replace(/[^A-Za-z0-9_.-]/g, "_");
function sessionFile(id) { return path.join(SESSIONS_DIR, safeId(id) + ".json"); }
function saveSession(id, obj) { return writeJSON(sessionFile(id), obj); }
function loadSession(id) { return readJSON(sessionFile(id), null); }

// the session whose wait started most recently = "follow the action".
// Attaches `sid` (the file's id) so callers can write grades back to it.
function latestSession() {
  let files = [];
  try { files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json")); } catch (_) { return null; }
  let best = null;
  for (const f of files) {
    const s = readJSON(path.join(SESSIONS_DIR, f), null);
    if (s && (!best || (s.startedAt || 0) > (best.startedAt || 0))) {
      s.sid = f.replace(/\.json$/, "");
      best = s;
    }
  }
  return best;
}

// prune session files whose wait started over `maxAgeMs` ago (housekeeping)
function pruneSessions(maxAgeMs = 24 * 60 * 60e3) {
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(SESSIONS_DIR)) {
      if (!f.endsWith(".json")) continue;
      const p = path.join(SESSIONS_DIR, f);
      const s = readJSON(p, null);
      if (s && now - (s.startedAt || 0) > maxAgeMs && f !== "local.json") {
        try { fs.unlinkSync(p); } catch (_) {}
      }
    }
  } catch (_) {}
}

module.exports = {
  SCHEMA_VERSION, DATA, SESSIONS_DIR, STATS, CONFIG, RECENT, OLD_PROTOTYPE,
  ensure, readJSON, writeJSON,
  loadConfig, saveConfig, isActive, DEFAULT_CONFIG,
  freshStats, loadStats, saveStats,
  loadRecent, pushRecent,
  saveSession, loadSession, latestSession, pruneSessions, sessionFile,
};
