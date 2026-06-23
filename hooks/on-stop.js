#!/usr/bin/env node
// Stop / StopFailure hook — Claude finished (or was interrupted) → wait is over.
// Stamps endedAt on this session's active problem so the pane chimes "time's up".
// Prints nothing; never emits decision:"block" (that would loop Claude); exits 0.

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
    const sid = payload.session_id || "default";
    const s = state.loadSession(sid);
    if (s && !s.endedAt) { s.endedAt = Date.now(); state.saveSession(sid, s); }
  } catch (_) {}
  safeExit();
});
