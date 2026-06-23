#!/usr/bin/env node
// UserPromptSubmit hook — Claude is about to start working → the wait begins.
// Picks a problem and writes it to this session's state file for the drill pane.
//
// INVARIANTS (do not break — these keep the hook safe):
//   • print NOTHING to stdout (UserPromptSubmit stdout is injected into context)
//   • never block; always exit 0, even on error
//   • read-only on stats.json (the watcher is its sole writer); we own recent.json
//   • finish fast (well under the 30s UserPromptSubmit timeout)

function safeExit() { try { process.exit(0); } catch (_) {} }
const bail = setTimeout(safeExit, 1500);

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (input += d));
process.stdin.on("error", () => { clearTimeout(bail); safeExit(); });
process.stdin.on("end", () => {
  clearTimeout(bail);
  try {
    const payload = input ? JSON.parse(input) : {};
    const state = require("../src/state.js");
    const { pick } = require("../src/scheduler.js");
    const cfg = state.loadConfig();
    if (!state.isActive(cfg)) return safeExit(); // paused / disabled → no-op

    const stats = state.loadStats();
    const recent = state.loadRecent();
    const prob = pick(stats, recent, cfg);
    state.pushRecent(prob.id);

    const sid = payload.session_id || "default";
    const prompt = String(payload.prompt || "").replace(/\s+/g, " ").trim();
    state.saveSession(sid, {
      id: prob.id, title: prob.title, diff: prob.diff, pattern: prob.pattern,
      startedAt: Date.now(), endedAt: null, answered: false, local: false,
      cwd: payload.cwd || null,
      promptPreview: cfg.showPrompt ? prompt.slice(0, 80) : null, // privacy: off by default
    });
  } catch (_) { /* best-effort — never disrupt the prompt */ }
  safeExit();
});
