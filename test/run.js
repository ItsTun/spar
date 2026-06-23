#!/usr/bin/env node
// Minimal dependency-free test harness. Uses an isolated temp data dir so it
// never touches your real stats. Run: `npm test`.

const assert = require("assert");
const os = require("os");
const path = require("path");
const fs = require("fs");

// isolate state BEFORE requiring state.js (it resolves the data dir at load)
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "spar-test-"));
process.env.SPAR_DATA = TMP;

const state = require("../src/state.js");
const sched = require("../src/scheduler.js");
const tui = require("../src/tui.js");

let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("  ✓ " + name); } catch (e) { console.error("  ✗ " + name + "\n    " + e.message); process.exitCode = 1; } };

console.log("state");
t("config defaults + round-trip", () => {
  const c = state.loadConfig();
  assert.strictEqual(c.enabled, true);
  assert.strictEqual(c.showPrompt, false); // privacy default
  c.dailyGoal = 7; state.saveConfig(c);
  assert.strictEqual(state.loadConfig().dailyGoal, 7);
});
t("isActive respects enabled + pause", () => {
  assert.strictEqual(state.isActive({ enabled: true, pausedUntil: null }), true);
  assert.strictEqual(state.isActive({ enabled: false }), false);
  assert.strictEqual(state.isActive({ enabled: true, pausedUntil: Date.now() + 1e6 }), false);
});
t("session save/load/latest follows most recent startedAt", () => {
  state.saveSession("s1", { id: "two-sum", startedAt: 1000 });
  state.saveSession("s2", { id: "3sum", startedAt: 2000 });
  const latest = state.latestSession();
  assert.strictEqual(latest.id, "3sum");
  assert.strictEqual(latest.sid, "s2");
});
t("recent ring caps and dedupes", () => {
  for (let i = 0; i < 12; i++) state.pushRecent("p" + i);
  const r = state.loadRecent();
  assert.ok(r.length <= 8);
  assert.strictEqual(r[r.length - 1], "p11");
});

console.log("scheduler");
t("record: got advances streak + solved, sets dueAt", () => {
  const s = state.freshStats();
  sched.record(s, "two-sum", "got");
  assert.strictEqual(s.solved, 1);
  assert.strictEqual(s.streak, 1);
  assert.ok(s.problems["two-sum"].dueAt > Date.now());
});
t("record: miss resets streak + box", () => {
  const s = state.freshStats();
  sched.record(s, "a", "got"); sched.record(s, "a", "got");
  assert.strictEqual(s.streak, 2);
  sched.record(s, "a", "miss");
  assert.strictEqual(s.streak, 0);
  assert.strictEqual(s.problems["a"].box, 0);
});
t("pick: returns a real problem and never repeats lastId", () => {
  const s = state.freshStats();
  const last = sched.bank[0].id;
  for (let i = 0; i < 100; i++) {
    const p = sched.pick(s, [last], state.DEFAULT_CONFIG);
    assert.ok(sched.bank.find((b) => b.id === p.id), "is a real problem");
    assert.notStrictEqual(p.id, last, "never the immediately-previous id");
  }
});
t("pick: difficulty filter respected", () => {
  const s = state.freshStats();
  for (let i = 0; i < 50; i++) {
    const p = sched.pick(s, [], { difficulty: "hard", topics: [] });
    assert.strictEqual(p.diff, "Hard");
  }
});

console.log("tui");
t("renderOnce produces a framed box", () => {
  state.saveSession("local", { id: sched.bank[0].id, title: sched.bank[0].title, diff: sched.bank[0].diff,
    pattern: sched.bank[0].pattern, startedAt: Date.now(), endedAt: null, local: true });
  const out = tui.renderOnce({ columns: 70 });
  assert.ok(out.includes("spar"));
  assert.ok(out.split("\n").length > 5);
});

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
console.log(`\n${pass} passed${process.exitCode ? " (with failures)" : ""}`);
