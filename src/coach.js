// coach.js — Sparky, your sparring-partner coach dog. (v0.2)
// A LIVING companion: he roams the pane, naps when idle, trots over and drops a
// problem when Claude starts working (read from the hook session state), and
// celebrates when Claude finishes — while you type your answers inline.
// Pure Node, no deps. The quiet `spar` pane (tui.js) is unaffected.

const state = require("./state.js");
const sched = require("./scheduler.js");
const render = require("./render.js");
const bank = require("./bank.js");

// ── moods (the snout •ᴥ• is the face) ───────────────────────────────────
const MOODS = {
  neutral: "•ᴥ•", happy: "^ᴥ^", excited: "ᗒᴥᗕ", love: "♥ᴥ♥",
  think: "·ᴥ·", proud: "▼ᴥ▼", sad: "╥ᴥ╥", sleepy: "-ᴥ-", alert: "OᴥO",
};

// ── leveling: a relationship that grows as you drill ────────────────────
const LEVELS = [
  { at: 0,   title: "rookie pup",        gear: null },
  { at: 40,  title: "coach-in-training", gear: "headband" },
  { at: 120, title: "sparring partner",  gear: "shades" },
  { at: 280, title: "head coach",        gear: "medal" },
  { at: 600, title: "sensei",            gear: "crown" },
];
function levelFor(xp) {
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (xp >= LEVELS[k].at) i = k;
  return { idx: i, ...LEVELS[i], next: LEVELS[i + 1] || null };
}

const TAIL = ["〜", "৴ "];
// Sparky sprite (≈ width 9). frame toggles tail-wag / trot; gear from level; zzz naps.
function sparky(mood, gear, frame = 0, zzz = false) {
  const face = MOODS[mood] || MOODS.neutral;
  const tail = zzz ? "  " : TAIL[frame % 2];
  const paws = frame % 2 ? " ∪   ∪ " : "  ∪ ∪  ";
  const top = { headband: "  ╭══╮ ", shades: "  ╭──╮ ", crown: "   ♔   ", medal: null, null: null }[gear];
  const lines = [];
  if (top) lines.push(top);
  lines.push(`/ᐢ${face}ᐢ\\${tail}` + (zzz ? "  z" : ""));
  lines.push(paws + (zzz ? " Z" : ""));
  if (gear === "medal") lines.push("  ◖★◗ ");
  return lines;
}
const SPRITE_W = 9;

// ── speech bubble (rendered above Sparky, anchored near his x) ───────────
function bubble(text, c, w = 44) {
  const lines = render.wrap(text, w - 2);
  const width = Math.max(...lines.map((l) => l.length), 6);
  const out = [c.cyan("╭" + "─".repeat(width + 2) + "╮")];
  for (const l of lines) out.push(c.cyan("│ ") + l + " ".repeat(width - l.length) + c.cyan(" │"));
  out.push(c.cyan("╰─" + "─".repeat(width) + "╯"));
  out.push(c.cyan("  ╲"));
  return out;
}

// ── grade a TYPED pattern answer (generous + encouraging) ───────────────
const ALIASES = {
  "hash": ["hash map", "hashmap", "map", "dict", "dictionary", "hash table", "set", "hash set", "bucket"],
  "two pointer": ["two pointers", "2 pointer", "2 pointers", "two-pointer", "opposite ends"],
  "sliding window": ["window", "sliding"],
  "binary search": ["bsearch", "binary", "search on answer", "bisect"],
  "stack": ["monotonic stack", "mono stack", "monotonic", "next greater"],
  "dp": ["dynamic programming", "dynamic", "memo", "memoization", "tabulation", "knapsack", "kadane"],
  "bfs": ["breadth first", "breadth-first", "level order", "queue", "flood fill"],
  "dfs": ["depth first", "depth-first", "recursion", "recursive", "flood fill"],
  "backtracking": ["backtrack", "back tracking"],
  "greedy": ["greedy", "kadane"],
  "heap": ["priority queue", "pq", "min heap", "max heap", "two heaps"],
  "interval": ["intervals", "sweep", "merge"],
  "linked list": ["list", "fast slow", "floyd", "cycle"],
  "trie": ["prefix tree"],
  "bit": ["xor", "bitmask", "bit manipulation", "bits"],
  "prefix": ["suffix", "prefix sum", "prefix product"],
  "tree": ["traversal", "in-order", "inorder"],
};
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function gradeAnswer(problem, text) {
  const a = norm(text);
  if (!a) return { verdict: "cold" };
  const pat = norm(problem.pattern);
  const patWords = pat.split(" ").filter((w) => w.length > 2 && !["the", "and", "1d", "2d"].includes(w));
  if (patWords.some((w) => a.includes(w)) || (pat.length > 3 && a.includes(pat))) return { verdict: "correct" };
  for (const [canon, syns] of Object.entries(ALIASES)) {
    const inPattern = pat.includes(canon) || syns.some((s) => pat.includes(s));
    if (!inPattern) continue;
    if (a.includes(canon) || syns.some((s) => a.includes(s))) return { verdict: "correct" };
  }
  const idea = norm(problem.drillA + " " + problem.approach + " " + (problem.hints || []).join(" "));
  const hit = a.split(" ").filter((w) => w.length > 3 && idea.includes(w));
  if (hit.length) return { verdict: "warm", matched: hit };
  return { verdict: "cold" };
}

const BARKS = {
  correct: ["WOOF! nailed it.", "that's the one — good dog energy!", "*tail goes brrr* — exactly!", "yes!! you saw it."],
  warm: ["sooo close — you smell it!", "warm! the family's right, not the move yet.", "*tilts head* almost — keep pulling."],
  cold: ["hmm, not the scent. type 'hint'?", "*sniffs* think again — 'hint' helps.", "every miss is a rep. try 'hint'."],
  idle: ["*sniff sniff*", "throw me a prompt…", "*chases tail*", "ready when you are.", "*flops down*"],
};
const pick = (arr, i) => arr[(i % arr.length + arr.length) % arr.length];

// ── compose one frame ────────────────────────────────────────────────────
function scene(r, ctx) {
  const { color: c, box, width } = r;
  const innerW = width() - 4;
  const L = [];
  if (ctx.problem && !ctx.hideHeader) {
    const diffC = (d) => (d === "Easy" ? c.grn : d === "Hard" ? c.red : c.yel)(d);
    L.push(c.bold(ctx.problem.title) + "   " + diffC(ctx.problem.diff));
    L.push(ctx.reveal ? c.cyan(ctx.problem.pattern) : c.dim("pattern: ?"));
  }
  const x = Math.max(0, Math.min(ctx.x == null ? 5 : ctx.x, innerW - SPRITE_W));
  const padL = (s) => " ".repeat(x) + s;
  if (ctx.speech) {
    const bx = Math.max(0, Math.min(x, innerW - 14));      // anchor near Sparky, leave room
    const avail = innerW - bx - 2;                          // don't run past the right border
    const bub = bubble(ctx.speech, c, Math.max(14, Math.min(avail, 46)));
    bub.forEach((l) => L.push(" ".repeat(bx) + l));
  } else {
    L.push(""); // keep vertical rhythm
  }
  const lvl = levelFor(ctx.xp);
  const moodColor = { excited: c.grn, happy: c.grn, love: c.mag, proud: c.yel, alert: c.cyan, think: c.cyan, sad: c.red, sleepy: c.gray, neutral: c.yel }[ctx.mood] || c.yel;
  sparky(ctx.mood, lvl.gear, ctx.frame, ctx.zzz).forEach((l) => L.push(padL(moodColor(l))));
  L.push(c.dim("  " + "▔".repeat(Math.max(8, innerW - 4))));
  const tricks = ctx.tricks && ctx.tricks.length ? ctx.tricks.slice(-5).join(", ") : "none yet";
  L.push(c.dim(`streak ${ctx.streak || 0} · today ${ctx.today || 0}/${ctx.goal || 5} · tricks: `) + c.grn(tricks));
  if (ctx.input !== undefined) L.push(c.mag("you ▸ ") + ctx.input + c.dim("▏"));
  const titleR = c.bold(ctx.name || "Sparky") + c.dim(` · lvl ${lvl.idx + 1} `) + c.yel(`"${lvl.title}"`) + c.dim(" · ") + c.yel("★" + (ctx.xp || 0));
  return box(c.mag(c.bold("spar ⊹ coach")), titleR, L);
}

// ── live, animated, hook-tied app ─────────────────────────────────────────
function run() {
  state.ensure();
  const cfg = state.loadConfig();
  const r = render.make({ ascii: cfg.ascii });
  const out = process.stdout;
  const innerW = () => r.width() - 4;

  // session-derived stats helpers
  const stats = () => state.loadStats();
  const xp = () => { const s = stats(); return (s.solved || 0) * 10 + (s.bestStreak || 0) * 5; };
  const TRICK = { "Sliding Window": "fetch", "Two Pointers": "sit", "Hash Map": "shake", "DP (1D)": "roll", "Binary Search": "stay", "Tree BFS": "spin", "Greedy / Kadane": "jump", "Monotonic Stack": "beg" };
  const tricks = () => {
    const s = stats(); const o = [];
    for (const [pat, tr] of Object.entries(TRICK))
      if (bank.filter((p) => p.pattern === pat).some((p) => (s.problems[p.id] || {}).box >= 2)) o.push(tr);
    return o;
  };
  const today = () => (stats().days || {})[new Date().toISOString().slice(0, 10)] || 0;

  // app state
  let cur = null, curFrom = null, answered = false, reveal = false, hintsShown = 0;
  let buffer = "", barkI = 0, tick = 0, frame = 0;
  let x = 5, vx = 1, target = null, idleSince = 0;
  let mood = "neutral", react = null; // react: {mood, speech, until}
  let lastAdopted = 0, doneCelebrated = true, idleBark = "", idleBarkAt = 0;

  function setReact(m, speech, ticks = 12) { react = { mood: m, speech, until: tick + ticks }; }
  function presentProblem(prob, from, greet) {
    cur = prob; curFrom = from; answered = false; reveal = false; hintsShown = 0; buffer = "";
    target = Math.floor((innerW() - SPRITE_W) / 2); // trot to center
    setReact("alert", greet || "what pattern is this? type it ↵", 10);
  }
  function localProblem() {
    const prob = sched.pick(stats(), state.loadRecent(), cfg);
    state.pushRecent(prob.id);
    state.saveSession("local", { id: prob.id, title: prob.title, diff: prob.diff, pattern: prob.pattern,
      startedAt: Date.now(), endedAt: null, answered: false, local: true });
    lastAdopted = Date.now();
    presentProblem(prob, "local", "fresh rep! what pattern?");
  }

  function grade(text) {
    if (!cur) return;
    const before = levelFor(xp()).idx;
    const res = gradeAnswer(cur, text);
    if (res.verdict === "correct") {
      const s = stats(); sched.record(s, cur.id, "got"); state.saveStats(s);
      answered = true; setReact("excited", pick(BARKS.correct, barkI++), 16);
      const after = levelFor(xp()).idx;
      if (after > before) setReact("proud", `LEVEL ${after + 1}! ${LEVELS[after].title} — new gear unlocked!`, 26);
    } else if (res.verdict === "warm") setReact("happy", pick(BARKS.warm, barkI++), 14);
    else setReact("think", pick(BARKS.cold, barkI++), 14);
  }

  function submit() {
    const t = buffer.trim(), low = t.toLowerCase(); buffer = "";
    if (["quit", "exit"].includes(low)) return teardown();
    if (["skip", "next"].includes(low)) return localProblem();
    if (["hint"].includes(low)) {
      if (cur && cur.hints && hintsShown < cur.hints.length) setReact("neutral", "» " + cur.hints[hintsShown++], 40);
      else setReact("neutral", "that's all my hints — type 'show'.", 30);
      return;
    }
    if (["show", "answer"].includes(low)) { if (cur) { reveal = true; setReact("neutral", "KEY IDEA: " + cur.drillA, 60); } return; }
    if (["g"].includes(low) && cur) { const s = stats(); sched.record(s, cur.id, "got"); state.saveStats(s); answered = true; setReact("excited", "logged — nice!", 14); return; }
    if (["x"].includes(low) && cur) { const s = stats(); sched.record(s, cur.id, "miss"); state.saveStats(s); answered = true; setReact("sad", "logged — it'll come back around.", 14); return; }
    if (!t) { if (!cur || answered) return localProblem(); return; } // empty enter fetches a problem when idle
    grade(t);
  }

  // detect Claude activity from the hook-written session state
  function syncSession() {
    const ls = state.latestSession();
    if (!ls) return;
    const isClaude = !ls.local;
    // a NEW Claude wait → Sparky trots over with that problem (Claude takes priority)
    if (isClaude && ls.startedAt > lastAdopted && (!cur || answered || curFrom !== "claude")) {
      lastAdopted = ls.startedAt; doneCelebrated = false;
      const prob = bank.find((p) => p.id === ls.id);
      if (prob) presentProblem(prob, "claude", "Claude's working — what pattern is this?");
    }
    // Claude finished this wait → celebrate once
    if (isClaude && ls.endedAt && !doneCelebrated && curFrom === "claude") {
      doneCelebrated = true;
      if (!answered) setReact("happy", "time's up! your guess? (or 'show' / 'g' / 'x')", 30);
      else setReact("love", "Claude's done — and so are you. good rep!", 22);
    }
  }

  function baseMoodSpeech() {
    if (cur && !answered) return { mood: "think", speech: hintsShown ? null : "what pattern? type it ↵   (hint · show · skip · quit)" };
    if (cur && answered) return { mood: "happy", speech: "press ↵ for the next rep" };
    // idle
    if (tick - idleSince > 70) { // napping
      return { mood: "sleepy", speech: tick - idleSince > 90 ? null : "*yawn*", zzz: true };
    }
    if (tick - idleBarkAt > 45) { idleBark = pick(BARKS.idle, barkI++); idleBarkAt = tick; }
    return { mood: "neutral", speech: idleBark };
  }

  function step() {
    tick++; if (tick % 3 === 0) frame++;
    syncSession();
    // movement
    if (target != null) { // easing to a target (trot-in)
      if (Math.abs(x - target) <= 1) { x = target; target = null; }
      else x += Math.sign(target - x) * 2;
    } else if (!cur || answered) { // idle wander
      x += vx; const max = innerW() - SPRITE_W - 2;
      if (x <= 2 || x >= max) { vx = -vx; x = Math.max(2, Math.min(x, max)); }
    }
    if (cur && !answered) idleSince = tick; // not idle while a problem is up
    const base = baseMoodSpeech();
    if (!base.zzz && (cur || buffer)) idleSince = tick;
    const active = react && tick < react.until ? react : null;
    mood = active ? active.mood : base.mood;
    const speech = active ? active.speech : base.speech;
    const s = stats();
    out.write("\x1b[H" + scene(r, {
      problem: cur, hideHeader: !cur, reveal, speech, mood, frame, x, zzz: base.zzz && !active,
      xp: xp(), streak: s.streak, today: today(), goal: cfg.dailyGoal, tricks: tricks(), input: buffer,
    }).map((l) => l + "\x1b[K").join("\n") + "\x1b[J");
  }

  // raw-mode line editor + animation loop
  function onData(str) {
    if (str.charCodeAt(0) === 27) return; // ignore escape seqs (arrows/fn keys)
    for (const ch of str) {
      const code = ch.charCodeAt(0);
      idleSince = tick;
      if (ch === "\x03") return teardown();      // ctrl-c
      else if (ch === "\r" || ch === "\n") submit();
      else if (code === 127 || ch === "\b") buffer = buffer.slice(0, -1);
      else if (code >= 32 && code < 127) buffer += ch;
    }
    step();
  }
  let timer = null;
  function teardown() {
    if (timer) clearInterval(timer);
    try { process.stdin.setRawMode && process.stdin.setRawMode(false); } catch (_) {}
    out.write("\x1b[?25h\x1b[2J\x1b[H");
    console.log(r.color.yel("\n  Sparky: good session — see you next wait. (•ᴥ• )/\n"));
    process.exit(0);
  }

  out.write("\x1b[2J\x1b[?25l");
  setReact("happy", "yo! I'm Sparky, your sparring partner. throw me a prompt — or type to drill.", 30);
  if (!process.stdin.isTTY) { step(); out.write("\x1b[?25h\n"); return; } // non-interactive: render one frame and bail
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding("utf8");
  process.stdin.on("data", onData);
  process.on("SIGINT", teardown); process.on("SIGTERM", teardown);
  out.on("resize", step);
  timer = setInterval(step, 90); // ~11 fps
  step();
}

// ── flipbook demo (non-interactive; conveys the motion) ──────────────────
function framesDemo() {
  const r = render.make({ columns: +process.env.COLUMNS || 72 });
  const dt = bank.find((p) => p.id === "daily-temperatures");
  const seq = [
    { t: "idle: Sparky wanders", x: 4, mood: "neutral", speech: "throw me a prompt…", frame: 0, input: "" },
    { t: "idle: …and naps", x: 10, mood: "sleepy", speech: null, zzz: true, frame: 0, input: "" },
    { t: "Claude starts → Sparky perks up + trots in", x: 22, mood: "alert", speech: "Claude's working — what pattern is this?", problem: dt, frame: 1, input: "" },
    { t: "you start typing…", x: 30, mood: "think", problem: dt, speech: "what pattern? type it ↵", frame: 0, input: "monoton" },
    { t: "…enter → CORRECT, he leaps", x: 30, mood: "excited", problem: dt, speech: "WOOF! nailed it.", frame: 1, input: "" },
    { t: "Claude finishes → celebration", x: 26, mood: "love", problem: dt, speech: "Claude's done — and so are you. good rep!", frame: 1, input: "" },
  ];
  for (const f of seq) {
    console.log("\n———————— " + f.t + " ————————");
    console.log(scene(r, { ...f, reveal: false, xp: 130, streak: 5, today: 3, goal: 5, tricks: ["sit", "fetch", "roll"], hideHeader: !f.problem }).join("\n"));
  }
}

module.exports = { sparky, bubble, gradeAnswer, scene, levelFor, MOODS, LEVELS, BARKS, pick, norm, run, framesDemo };
