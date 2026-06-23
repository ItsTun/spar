#!/usr/bin/env node
// Validates the problem bank against schema/problem.schema.json (hand-rolled, no deps)
// and guards against duplicate ids. Run in CI. Exits non-zero on any violation.

const bank = require("../src/bank.js");

const DIFFS = ["Easy", "Medium", "Hard"];
const REQUIRED = ["id", "title", "diff", "pattern", "drillQ", "drillA", "prompt", "hints", "approach", "complexity"];
const errors = [];
const seen = new Map();

bank.forEach((p, i) => {
  const where = `#${i} (${p && p.id ? p.id : "?"})`;
  if (!p || typeof p !== "object") { errors.push(`${where}: not an object`); return; }
  for (const f of REQUIRED) if (p[f] === undefined || p[f] === null || p[f] === "") errors.push(`${where}: missing "${f}"`);
  if (p.id && !/^[a-z0-9-]+$/.test(p.id)) errors.push(`${where}: id must be kebab-case [a-z0-9-]`);
  if (p.id) { if (seen.has(p.id)) errors.push(`${where}: duplicate id (also ${seen.get(p.id)})`); else seen.set(p.id, where); }
  if (p.diff && !DIFFS.includes(p.diff)) errors.push(`${where}: diff must be one of ${DIFFS.join("/")}, got "${p.diff}"`);
  if (p.hints && (!Array.isArray(p.hints) || p.hints.length < 1)) errors.push(`${where}: hints must be a non-empty array`);
});

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s) failed validation:\n` + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}
console.log(`✓ ${bank.length} problems valid · ${new Set(bank.map((p) => p.pattern)).size} patterns · ${seen.size} unique ids`);
