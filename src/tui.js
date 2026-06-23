// tui.js — the split-pane drill. Follows whichever Claude session is currently
// working ("follow the action"); also self-drives when you press `n`.

const fs = require("fs");
const state = require("./state.js");
const sched = require("./scheduler.js");
const render = require("./render.js");
const bank = require("./bank.js");

const FULL_AFTER_MS = 90 * 1000; // drill → full problem after this long a wait

// ── reveal state (reset whenever the shown problem changes) ──────────────
let key = null, hintsShown = 0, fullShown = false, solutionShown = false, scored = false, flash = "";
let spinIdx = 0;
function resetReveal() { hintsShown = 0; fullShown = false; solutionShown = false; scored = false; flash = ""; }

function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Build the frame (array of lines) for the current state. Pure-ish: only mutates
// reveal state on problem change. `r` is a render context from render.make().
function frame(r) {
  const { color: c, spin, box, wrap, width } = r;
  const innerW = width() - 4;
  const cfg = state.loadConfig();
  const cur = state.latestSession();
  const stats = state.loadStats();

  if (!cur) {
    return box(c.bold("spar"), c.dim("idle"), [
      "", c.gray("Waiting for Claude to start working…"),
      c.gray("(a problem lands here the moment you send a prompt)"),
      "", c.dim("Drill right now? press ") + c.bold("n") + c.dim(" for a problem"),
      c.dim("Keys: ") + "n " + c.dim("next · ") + "q " + c.dim("quit"), "",
    ]);
  }

  const k = cur.sid + ":" + cur.startedAt;
  if (k !== key) { key = k; resetReveal(); }

  const prob = bank.find((p) => p.id === cur.id) || {};
  const now = Date.now();
  const elapsed = (cur.endedAt || now) - cur.startedAt;
  const done = !!cur.endedAt;
  const local = !!cur.local;
  const showFull = fullShown || done || elapsed >= FULL_AFTER_MS;

  spinIdx = (spinIdx + 1) % spin.length;
  const status = done ? c.grn("✓ done") : local ? c.mag("drilling " + spin[spinIdx]) : c.yel("waiting " + spin[spinIdx]);
  const timer = (done ? c.grn : c.yel)(fmtElapsed(elapsed));
  const diffC = (d) => (d === "Easy" ? c.grn : d === "Hard" ? c.red : c.yel)(d || "");

  const L = [];
  L.push(c.bold(prob.title || cur.title || cur.id) + "   " + diffC(prob.diff || cur.diff));
  L.push(c.cyan(prob.pattern || cur.pattern || ""));
  L.push("");

  if (!showFull) {
    L.push(c.bold("DRILL ") + c.dim("— recall the approach:"));
    wrap(prob.drillQ || "(no drill)", innerW).forEach((l) => L.push("  " + l));
    if (solutionShown) {
      L.push(""); L.push(c.grn("KEY IDEA:"));
      wrap(prob.drillA || "", innerW).forEach((l) => L.push("  " + c.gray(l)));
    }
  } else {
    wrap(prob.prompt || "", innerW).forEach((l) => L.push(l));
    if (prob.examples) { L.push(""); L.push(c.dim("e.g.  ") + c.gray(prob.examples)); }
    if (hintsShown > 0 && prob.hints) {
      L.push(""); L.push(c.blu("Hints:"));
      prob.hints.slice(0, hintsShown).forEach((h, i) =>
        wrap(`${i + 1}. ${h}`, innerW - 2).forEach((l, j) => L.push("  " + (j ? "   " : "") + c.gray(l))));
    }
    if (solutionShown) {
      L.push(""); L.push(c.grn("Approach:"));
      wrap(prob.approach || "", innerW).forEach((l) => L.push("  " + c.gray(l)));
      if (prob.complexity) L.push("  " + c.dim(prob.complexity));
    }
  }

  if (done && !solutionShown && !scored) {
    L.push(""); L.push(c.dim("time's up — press ") + c.bold("s") + c.dim(" to reveal, then grade yourself"));
  }

  L.push("");
  const ctl = [
    !showFull ? c.bold("f") + c.dim(" full") : null,
    prob.hints && hintsShown < prob.hints.length ? c.bold("h") + c.dim(" hint") : null,
    !solutionShown ? c.bold("s") + c.dim(" solution") : null,
  ].filter(Boolean).join(c.dim(" · "));
  if (ctl) L.push(c.gray("▸ ") + ctl);
  if (scored) L.push(c.gray("▸ ") + flash + c.dim("  ·  ") + c.bold("n") + c.dim(" next · ") + c.bold("q") + c.dim(" quit"));
  else L.push(c.gray("▸ grade: ") + c.grn("g") + c.dim(" got it · ") + c.red("x") + c.dim(" missed") +
    c.dim("  ·  ") + c.bold("n") + c.dim(" next · ") + c.bold("q") + c.dim(" quit"));

  L.push("");
  const today = new Date(now).toISOString().slice(0, 10);
  const todayCount = (stats.days && stats.days[today]) || 0;
  L.push(c.dim(`solved ${stats.solved || 0} · streak `) + c.bold(String(stats.streak || 0)) +
    c.dim(` · best ${stats.bestStreak || 0} · today ${todayCount}/${cfg.dailyGoal}`));
  if (!done && !local && cur.promptPreview) wrap(c.dim("Claude: ") + c.gray(cur.promptPreview), innerW).slice(0, 1).forEach((l) => L.push(l));
  if (flash && !scored) L.push(c.yel(flash));

  return box(c.mag(c.bold("spar")), `${status} ${timer}`, L);
}

// ── actions ──────────────────────────────────────────────────────────
function grade(result) {
  const cur = state.latestSession();
  if (!cur || scored) return;
  const stats = state.loadStats();
  sched.record(stats, cur.id, result);
  state.saveStats(stats); // watcher is the sole stats writer
  cur.answered = true; state.saveSession(cur.sid, cur);
  scored = true; solutionShown = true;
}

function nextProblem(r) {
  const stats = state.loadStats();
  const recent = state.loadRecent();
  const cfg = state.loadConfig();
  const prob = sched.pick(stats, recent, cfg);
  state.pushRecent(prob.id);
  state.saveSession("local", {
    id: prob.id, title: prob.title, diff: prob.diff, pattern: prob.pattern,
    startedAt: Date.now(), endedAt: null, answered: false, local: true, promptPreview: null,
  });
}

// ── live loop ───────────────────────────────────────────────────────────
function run(opts = {}) {
  state.ensure();
  state.pruneSessions();
  const cfg = state.loadConfig();
  const r = render.make({ ascii: cfg.ascii });
  const out = process.stdout;
  let timer = null, watcher = null;

  const draw = () => {
    const f = frame(r).map((l) => l + "\x1b[K").join("\n");
    out.write("\x1b[H" + f + "\x1b[J");
  };
  const teardown = () => {
    if (timer) clearInterval(timer);
    try { if (watcher) watcher.close(); } catch (_) {}
    try { process.stdin.setRawMode && process.stdin.setRawMode(false); } catch (_) {}
    out.write("\x1b[?25h\x1b[2J\x1b[H");
    console.log(r.color.gray("drill paused — stats saved. run `spar` anytime.\n"));
    process.exit(0);
  };
  const onKey = (str) => {
    const ch = str.toLowerCase();
    if (ch === "q" || str === "\x03") return teardown();
    const cur = state.latestSession();
    const prob = (cur && bank.find((p) => p.id === cur.id)) || {};
    switch (ch) {
      case "f": fullShown = true; break;
      case "h": if (prob.hints && hintsShown < prob.hints.length) { hintsShown++; fullShown = true; } break;
      case "s": solutionShown = true; break;
      case "g": grade("got"); break;
      case "x": grade("miss"); break;
      case "n": case " ": resetReveal(); nextProblem(r); break;
      default: return;
    }
    draw();
  };

  out.write("\x1b[2J\x1b[?25l");
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", onKey);
  }
  try { watcher = fs.watch(state.SESSIONS_DIR, () => draw()); } catch (_) {}
  timer = setInterval(draw, 450);
  out.on("resize", draw);
  process.on("SIGINT", teardown);
  process.on("SIGTERM", teardown);
  draw();
}

// one-shot render (for --once / piping / tests)
function renderOnce(opts = {}) {
  const cfg = state.loadConfig();
  const r = render.make({ ascii: cfg.ascii, columns: opts.columns });
  return frame(r).join("\n");
}

module.exports = { run, frame, renderOnce, FULL_AFTER_MS };
