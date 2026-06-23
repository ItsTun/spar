// coach.js — Sparky, your sparring-partner coach dog. (EXPERIMENTAL, v0.2 preview)
// Unlike a tamagotchi you feed, Sparky *trains* you: he shows a problem, you TYPE
// your answer, he reacts, and he levels up as your skills do. Pure Node, no deps.

const readline = require("readline");
const state = require("./state.js");
const sched = require("./scheduler.js");
const render = require("./render.js");
const bank = require("./bank.js");

// ── moods (the snout •ᴥ• changes; that's the dog's face) ────────────────
const MOODS = {
  neutral: "•ᴥ•", happy: "^ᴥ^", excited: "ᗒᴥᗕ", love: "♥ᴥ♥",
  think: "·ᴥ·", proud: "▼ᴥ▼", sad: "╥ᴥ╥", sleepy: "-ᴥ-",
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

// Sparky sprite. `frame` toggles tail-wag / paw-walk; gear comes from level.
function sparky(mood, gear, frame = 0) {
  const face = MOODS[mood] || MOODS.neutral;
  const tail = frame % 2 ? "〜" : "৴ "; // wag
  const paws = frame % 2 ? " ∪   ∪ " : "  ∪ ∪  "; // little trot
  const top = {
    headband: "  ╭══╮ ",
    shades:   "  ╭──╮ ",
    medal:    "      ",
    crown:    "  ♔   ",
    null:     null,
  }[gear];
  const lines = [];
  if (top) lines.push(top);
  lines.push(`/ᐢ${face}ᐢ\\${tail}`);
  lines.push(paws);
  if (gear === "medal") lines.push("  ◖★◗ ");
  return lines;
}

// ── speech bubble pointing down-left at Sparky ──────────────────────────
function bubble(text, c, w = 40) {
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
  "sliding window": ["window", "sliding", "two pointer window"],
  "binary search": ["bsearch", "binary", "search on answer", "bisect"],
  "stack": ["monotonic stack", "mono stack", "monotonic"],
  "dp": ["dynamic programming", "dynamic", "memo", "memoization", "tabulation", "knapsack", "kadane"],
  "bfs": ["breadth first", "breadth-first", "level order", "queue", "flood fill"],
  "dfs": ["depth first", "depth-first", "recursion", "recursive", "flood fill"],
  "backtracking": ["backtrack", "back tracking"],
  "greedy": ["greedy", "kadane"],
  "heap": ["priority queue", "pq", "min heap", "max heap", "two heaps"],
  "interval": ["intervals", "sweep", "merge"],
  "linked list": ["list", "pointers", "fast slow", "floyd", "cycle"],
  "trie": ["prefix tree"],
  "bit": ["xor", "bitmask", "bit manipulation", "bits"],
  "prefix": ["suffix", "prefix sum", "prefix product"],
  "tree": ["traversal", "dfs", "bfs", "in-order", "inorder"],
};
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function gradeAnswer(problem, text) {
  const a = norm(text);
  if (!a) return { verdict: "cold" };
  const pat = norm(problem.pattern); // e.g. "monotonic stack", "sliding window", "dp 1d"
  // 1) direct: did they name (part of) the pattern?
  const patWords = pat.split(" ").filter((w) => w.length > 2 && !["the", "and", "1d", "2d"].includes(w));
  if (patWords.some((w) => a.includes(w)) || (pat.length > 3 && a.includes(pat))) return { verdict: "correct" };
  // 2) alias families
  for (const [canon, syns] of Object.entries(ALIASES)) {
    const inPattern = pat.includes(canon) || syns.some((s) => pat.includes(s));
    if (!inPattern) continue;
    if (a.includes(canon) || syns.some((s) => a.includes(s))) return { verdict: "correct" };
  }
  // 3) warm: their words show up in the key idea
  const idea = norm(problem.drillA + " " + problem.approach);
  const hit = a.split(" ").filter((w) => w.length > 3 && idea.includes(w));
  if (hit.length) return { verdict: "warm", matched: hit };
  return { verdict: "cold" };
}

// ── reactions: mood + what Sparky says ──────────────────────────────────
const BARKS = {
  correct: ["WOOF! nailed it.", "that's the one — good dog energy!", "*tail goes brrr* — exactly!", "yes!! you saw it."],
  warm: ["sooo close — you smell it!", "warm! you've got the family, not the move yet.", "*tilts head* almost — keep pulling that thread."],
  cold: ["hmm, not the scent. want a hint? (type 'hint')", "*sniffs* let's stalk it differently — try 'hint'.", "no worries — every miss is a rep. 'hint'?"],
};
const pick = (arr, i) => arr[i % arr.length];

// ── render one scene ────────────────────────────────────────────────────
function scene(r, ctx) {
  const { color: c, box, width } = r;
  const innerW = width() - 4;
  const L = [];
  if (ctx.problem) {
    const diffC = (d) => (d === "Easy" ? c.grn : d === "Hard" ? c.red : c.yel)(d);
    L.push(c.bold(ctx.problem.title) + "   " + diffC(ctx.problem.diff));
    L.push(c.cyan(ctx.problem.pattern && ctx.reveal ? ctx.problem.pattern : c.dim("pattern: ?")));
    L.push("");
  }
  if (ctx.speech) bubble(ctx.speech, c, Math.min(innerW - 6, 46)).forEach((l) => L.push("  " + l));
  const lvl = levelFor(ctx.xp);
  const moodColor = { excited: c.grn, happy: c.grn, love: c.mag, proud: c.yel, sad: c.red, think: c.cyan, sleepy: c.gray, neutral: c.yel }[ctx.mood] || c.yel;
  sparky(ctx.mood, lvl.gear, ctx.frame).forEach((l) => L.push("       " + moodColor(l)));
  L.push(c.dim("  " + "▔".repeat(Math.max(8, innerW - 4)))); // ground
  // relationship footer
  const tricks = ctx.tricks && ctx.tricks.length ? ctx.tricks.slice(-4).join(", ") : "none yet";
  L.push(c.dim(`streak ${ctx.streak || 0} · today ${ctx.today || 0}/${ctx.goal || 5} · tricks: `) + c.grn(tricks));
  const titleR = c.bold(ctx.name || "Sparky") + c.dim(` · lvl ${lvl.idx + 1} `) + c.yel(`"${lvl.title}"`) + c.dim(` · `) + c.yel("★" + (ctx.xp || 0));
  return box(c.mag(c.bold("spar ⊹ coach")), titleR, L);
}

module.exports = { sparky, bubble, gradeAnswer, scene, levelFor, MOODS, BARKS, pick, norm };

// ── interactive loop ─────────────────────────────────────────────────────
function run() {
  state.ensure();
  const cfg = state.loadConfig();
  const r = render.make({ ascii: cfg.ascii });
  const c = r.color;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const stats = () => state.loadStats();
  const xp = () => { const s = stats(); return (s.solved || 0) * 10 + (s.bestStreak || 0) * 5; };
  const tricksLearned = () => {
    const s = stats(); const out = [];
    const TRICK = { "Sliding Window": "fetch", "Two Pointers": "sit", "Hash Map": "shake", "DP (1D)": "roll", "Binary Search": "stay", "Tree BFS": "spin", "Greedy / Kadane": "jump" };
    for (const [pat, trick] of Object.entries(TRICK)) {
      const any = bank.filter((p) => p.pattern === pat).some((p) => (s.problems[p.id] || {}).box >= 2);
      if (any) out.push(trick);
    } return out;
  };

  let cur = null, frame = 0, reactMood = "happy", reactSpeech = null, hintsShown = 0, barkI = 0;
  const today = () => { const s = stats(); return (s.days || {})[new Date().toISOString().slice(0, 10)] || 0; };

  function nextProblem(greeting) {
    const recent = state.loadRecent();
    cur = sched.pick(stats(), recent, cfg);
    state.pushRecent(cur.id);
    hintsShown = 0;
    reactMood = "think"; reactSpeech = greeting || "what pattern is this? type it ↵   (or: hint / skip / show / quit)";
    draw();
  }
  function draw(reveal) {
    const s = stats();
    process.stdout.write("\x1b[2J\x1b[H");
    process.stdout.write(scene(r, {
      problem: cur, speech: reactSpeech, mood: reactMood, frame, reveal,
      xp: xp(), streak: s.streak, today: today(), goal: cfg.dailyGoal, tricks: tricksLearned(),
    }).join("\n") + "\n");
    rl.setPrompt(c.mag("you ▸ ")); rl.prompt();
  }
  function celebrate(lines) { // tiny multi-frame reaction
    let i = 0; const seq = lines;
    const iv = setInterval(() => { frame++; reactMood = seq[i % seq.length]; draw(); if (++i >= 4) { clearInterval(iv); } }, 160);
  }
  function grade(text) {
    const before = levelFor(xp()).idx;
    const res = gradeAnswer(cur, text);
    const s = stats();
    if (res.verdict === "correct") { sched.record(s, cur.id, "got"); state.saveStats(s); reactSpeech = pick(BARKS.correct, barkI++); celebrate(["excited", "love", "proud", "happy"]); }
    else if (res.verdict === "warm") { reactSpeech = pick(BARKS.warm, barkI++); reactMood = "happy"; }
    else { reactSpeech = pick(BARKS.cold, barkI++); reactMood = "think"; }
    const after = levelFor(xp()).idx;
    setTimeout(() => {
      if (after > before) { reactMood = "proud"; reactSpeech = `LEVEL ${after + 1}! ${c.bold(LEVELS[after].title)} — new gear unlocked!`; draw(); setTimeout(() => nextProblem("next round — what pattern?"), 1400); }
      else if (res.verdict === "correct") setTimeout(() => nextProblem("nice. next — what pattern?"), 900);
      else draw();
    }, res.verdict === "correct" ? 720 : 60);
  }

  console.log(c.dim("\n  Sparky trots in…\n"));
  nextProblem("yo! I'm Sparky, your sparring partner. " + (MOODS.happy) + "  what pattern is this? type it ↵");
  rl.on("line", (line) => {
    const t = line.trim(), low = t.toLowerCase();
    if (["quit", "q", "exit"].includes(low)) { rl.close(); return; }
    if (["skip", "n", "next"].includes(low)) return nextProblem("ok! fresh one — what pattern?");
    if (["hint", "h"].includes(low)) { if (cur.hints && hintsShown < cur.hints.length) { reactSpeech = "» " + cur.hints[hintsShown++]; reactMood = "neutral"; } else { reactSpeech = "that's all my hints! type 'show' for the answer."; } return draw(); }
    if (["show", "s", "answer"].includes(low)) { reactSpeech = c.grn("KEY IDEA: ") + cur.drillA; reactMood = "neutral"; return draw(true); }
    if (!t) return draw();
    grade(t);
  });
  rl.on("close", () => { process.stdout.write("\x1b[2J\x1b[H"); console.log(c.yel("\n  Sparky: good session! see you next wait. (•ᴥ• )/\n")); process.exit(0); });
}

module.exports.run = run;
