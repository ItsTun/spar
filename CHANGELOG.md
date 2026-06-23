# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] — unreleased

First working version.

### Added
- Claude Code **plugin** that wires `UserPromptSubmit` + `Stop` (+ `StopFailure`)
  hooks — installs/uninstalls cleanly, no `settings.json` editing.
- `spar` **CLI + split-pane TUI** drill surface (`watch`, `stats`, `doctor`,
  `off`/`on`, `pause`, `reset`, `demo`).
- **Adaptive** display: quick pattern-recall drill on short waits, full problem
  after ~90s.
- **Spaced repetition** (Leitner boxes on real-time intervals) + **interleaving**
  (avoids back-to-back same-pattern) + immediate resurfacing of misses.
- **Per-session state** keyed by `session_id` with "follow-the-action" selection,
  so multiple concurrent Claude sessions don't clobber each other.
- Durable data dir **outside** the plugin (survives updates) with migration from
  the `~/.claude/prep` prototype.
- **Privacy by default**: zero telemetry; prompt text not stored unless opted in.
- 55-problem original bank across 37 patterns; JSON Schema + CI linter.

### Experimental
- `spar coach` — **Sparky**, an interactive coach dog. He shows a problem, you
  *type* your pattern answer, he grades it (heuristic, generous) and reacts with
  moods + barks, and he levels up with your mastery (gear: headband → shades →
  medal → crown; learns "tricks" as you warm up patterns). Preview / opt-in.
  Known TODO: wide-glyph (kaomoji/emoji) width handling for pixel-perfect boxes;
  optional LLM grading of free-text answers.

### Known / planned
- npm package name: `spar` is squatted on the registry; release may publish under
  a scope (e.g. `@itstun/spar`) — the command stays `spar`.
- Pattern labels are not yet normalized into canonical categories (v0.2).
- Time-of-day streak freezes, community problem packs, and single-binary builds
  are planned (see README roadmap).
