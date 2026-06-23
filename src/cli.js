#!/usr/bin/env node
// spar — stay sharp while the AI does the work.
// Usage:
//   spar              open the drill pane (default; keep it in a split pane)
//   spar next         drill on demand (alias inside the pane: press `n`)
//   spar stats        show your progress
//   spar reset        wipe stats
//   spar off | on     pause / resume the hooks (no uninstall)
//   spar pause 2h     snooze for a duration (30m, 2h, 1d)
//   spar doctor       diagnose install + terminal
//   spar demo         render a sample frame and exit
//   spar --version

const state = require("./state.js");
const sched = require("./scheduler.js");
const tui = require("./tui.js");
const bank = require("./bank.js");

const pkg = (() => { try { return require("../package.json"); } catch (_) { return { version: "0.1.0" }; } })();
const args = process.argv.slice(2);
const cmd = (args[0] || "watch").replace(/^--/, "");

function parseDuration(s) {
  const m = String(s || "").match(/^(\d+)\s*([smhd])?$/i);
  if (!m) return null;
  const n = +m[1], unit = (m[2] || "m").toLowerCase();
  return n * ({ s: 1e3, m: 60e3, h: 3600e3, d: 86400e3 }[unit]);
}

function printStats() {
  const s = state.loadStats();
  const seen = Object.values(s.problems).filter((p) => p.seen).length;
  console.log(`solved ${s.solved || 0} · attempted ${s.attempted || 0} · streak ${s.streak || 0} · best ${s.bestStreak || 0}`);
  console.log(`coverage: ${seen}/${bank.length} problems touched`);
  // per-pattern mastery
  const byPat = {};
  for (const p of bank) {
    const st = s.problems[p.id] || {};
    const b = (byPat[p.pattern] = byPat[p.pattern] || { total: 0, warm: 0 });
    b.total++; if ((st.box || 0) >= 2) b.warm++; // "warm" = box 2+ (recalled a couple times)
  }
  console.log("\npattern mastery:");
  Object.entries(byPat).sort().forEach(([pat, b]) => {
    const n = 10, filled = Math.round((b.warm / b.total) * n);
    console.log(`  ${"█".repeat(filled)}${"░".repeat(n - filled)}  ${b.warm}/${b.total}  ${pat}`);
  });
  const weak = Object.entries(s.problems).filter(([, p]) => p.lastResult === "miss").map(([id]) => id);
  if (weak.length) console.log("\nto revisit: " + weak.join(", "));
}

function doctor() {
  const c = require("./render.js").make({}).color;
  const ok = (b) => (b ? c.grn("✓") : c.red("✗"));
  const node = process.versions.node;
  let writable = state.writeJSON(require("path").join(state.DATA, ".write-test"), { t: 1 });
  try { require("fs").unlinkSync(require("path").join(state.DATA, ".write-test")); } catch (_) {}
  const cfg = state.loadConfig();
  // best-effort: is the plugin installed?
  let plugin = false;
  try {
    const fs = require("fs"), path = require("path"), os = require("os");
    const root = path.join(os.homedir(), ".claude", "plugins");
    plugin = fs.existsSync(root) && JSON.stringify(fs.readdirSync(root)).toLowerCase().includes("spar");
  } catch (_) {}
  console.log(`spar v${pkg.version} — doctor\n`);
  console.log(`${ok(true)} node ${node}`);
  console.log(`${ok(writable)} data dir writable: ${state.DATA}`);
  console.log(`${ok(process.stdout.isTTY)} interactive TTY (needed for the drill pane)`);
  console.log(`${ok(!process.env.NO_COLOR)} color ${process.env.NO_COLOR ? "(NO_COLOR set)" : "enabled"}`);
  console.log(`${ok(cfg.enabled && !(cfg.pausedUntil > Date.now()))} spar active ${cfg.enabled ? (cfg.pausedUntil > Date.now() ? "(paused)" : "") : "(off)"}`);
  console.log(`${plugin ? ok(true) : c.yel("?")} claude code plugin ${plugin ? "detected" : "not detected — install via /plugin or run `spar` standalone"}`);
}

switch (cmd) {
  case "watch": case "": tui.run(); break;
  case "next": tui.run(); break; // opens the pane; press n / it auto-shows
  case "coach": require("./coach.js").run(); break; // EXPERIMENTAL: Sparky, interactive
  case "stats": case "status": printStats(); break;
  case "reset": state.saveStats(state.freshStats()); console.log("stats reset."); break;
  case "off": { const c = state.loadConfig(); c.enabled = false; state.saveConfig(c); console.log("spar paused (hooks no-op). `spar on` to resume."); break; }
  case "on": { const c = state.loadConfig(); c.enabled = true; c.pausedUntil = null; state.saveConfig(c); console.log("spar on."); break; }
  case "pause": {
    const ms = parseDuration(args[1]);
    if (!ms) { console.log("usage: spar pause <30m|2h|1d>"); break; }
    const c = state.loadConfig(); c.pausedUntil = Date.now() + ms; state.saveConfig(c);
    console.log(`snoozed until ${new Date(c.pausedUntil).toLocaleTimeString()}.`); break;
  }
  case "doctor": doctor(); break;
  case "demo": {
    const p = bank[Math.floor(bank.length / 2)];
    state.saveSession("demo", { id: p.id, title: p.title, diff: p.diff, pattern: p.pattern,
      startedAt: Date.now() - 100e3, endedAt: null, answered: false, local: false, promptPreview: null });
    console.log(tui.renderOnce({ columns: +process.env.COLUMNS || 70 }));
    try { require("fs").unlinkSync(state.sessionFile("demo")); } catch (_) {}
    break;
  }
  case "once": console.log(tui.renderOnce({ columns: +process.env.COLUMNS || 70 })); break;
  case "version": case "v": console.log(pkg.version); break;
  default: console.log(`unknown command: ${cmd}\nrun \`spar doctor\` or see https://github.com/`);
}
