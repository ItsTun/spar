// scheduler.js — which problem to surface next, and how grading reschedules it.
// Spaced-repetition-lite (Leitner boxes mapped to REAL time intervals) plus
// interleaving (avoid drilling the same pattern back-to-back). Pure, no deps.

const bank = require("./bank.js");

// Leitner box → how long until it's "due" again (ms). A miss drops to box 0.
const BOX_INTERVALS = [
  2 * 60e3,    // box 0: 2 min  (just missed → resurface fast)
  10 * 60e3,   // 1: 10 min
  60 * 60e3,   // 2: 1 hour
  6 * 60 * 60e3,  // 3: 6 hours
  24 * 60 * 60e3, // 4: 1 day
  3 * 24 * 60 * 60e3, // 5: 3 days
  7 * 24 * 60 * 60e3, // 6: 1 week
];

function pool(config) {
  let p = bank;
  const diff = (config && config.difficulty) || "all";
  if (diff !== "all") p = p.filter((x) => x.diff.toLowerCase() === diff);
  const topics = (config && config.topics) || [];
  if (topics.length) {
    const t = topics.map((s) => s.toLowerCase());
    const f = p.filter((x) => t.some((s) => x.pattern.toLowerCase().includes(s)));
    if (f.length) p = f;
  }
  return p.length ? p : bank;
}

// Weighted pick. Favors: never-seen (coverage), missed (resurface), due (review).
// Penalizes: in the recent ring, the same pattern as last time (interleaving),
// and never repeats the immediately-previous problem.
function pick(stats, recent, config, now = Date.now()) {
  const candidates = pool(config);
  const recentSet = new Set(recent || []);
  const lastId = recent && recent[recent.length - 1];
  const lastPattern = lastId ? (bank.find((p) => p.id === lastId) || {}).pattern : null;

  const scored = candidates.map((prob) => {
    const p = stats.problems[prob.id];
    let s = 1;
    if (!p || !p.seen) s += 4;                       // coverage
    else {
      if (p.lastResult === "miss") s += 5;           // hammer misses
      if (now >= (p.dueAt || 0)) s += 3;             // it's due
    }
    if (recentSet.has(prob.id)) s -= 4;              // seen very recently
    if (lastPattern && prob.pattern === lastPattern) s *= 0.4; // interleave
    if (prob.id === lastId) s = 0.0001;              // never twice in a row
    return { prob, s: Math.max(s, 0.01) };
  });

  const total = scored.reduce((a, x) => a + x.s, 0);
  let r = Math.random() * total;
  for (const x of scored) { r -= x.s; if (r <= 0) return x.prob; }
  return scored[scored.length - 1].prob;
}

// Grade a problem. result: "got" | "miss" | "skip". Mutates + returns stats.
function record(stats, id, result, now = Date.now()) {
  const p =
    stats.problems[id] ||
    (stats.problems[id] = { seen: 0, got: 0, miss: 0, box: 0, lastResult: null, lastSeenAt: 0, dueAt: 0 });
  p.seen++;
  stats.attempted = (stats.attempted || 0) + 1;
  if (result === "got") {
    p.got++; p.box = Math.min(p.box + 1, BOX_INTERVALS.length - 1); p.lastResult = "got";
    stats.solved = (stats.solved || 0) + 1;
    stats.streak = (stats.streak || 0) + 1;
    stats.bestStreak = Math.max(stats.bestStreak || 0, stats.streak);
  } else if (result === "miss") {
    p.miss++; p.box = 0; p.lastResult = "miss";
    stats.streak = 0;
  } else {
    p.lastResult = "skip";
  }
  p.lastSeenAt = now;
  p.dueAt = now + (result === "miss" ? BOX_INTERVALS[0] : BOX_INTERVALS[p.box]);
  // lightweight per-day tally for stats/streak-by-day (UTC day key)
  const day = new Date(now).toISOString().slice(0, 10);
  stats.days[day] = (stats.days[day] || 0) + (result === "skip" ? 0 : 1);
  return stats;
}

module.exports = { pick, record, pool, bank, BOX_INTERVALS };
