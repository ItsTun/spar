# spar

**Stay sharp while the AI does the work.**

`spar` turns the dead time while Claude Code is "thinking / running tools" into
bite-sized coding-interview reps. The moment you send a prompt, a problem lands
in a side pane; you drill it while the agent works. Your raw problem-solving
muscle stays warm instead of atrophying as the AI types for you.

```
┌ spar ─────────────────────────────── waiting ⠹ 1:12 ┐
│ Daily Temperatures   Medium                          │
│ Monotonic Stack                                      │
│                                                      │
│ DRILL — recall the approach:                         │
│   Days until a warmer temperature, for each day?     │
│                                                      │
│ ▸ f full · h hint · s solution                       │
│ ▸ grade: g got it · x missed  ·  n next · q quit     │
│ solved 11 · streak 4 · best 7 · today 3/5            │
│ Claude: refactor the parser…                         │
└──────────────────────────────────────────────────────┘
```

## How it works

Two Claude Code hooks drive it:

- **`UserPromptSubmit`** → you hit enter, Claude starts working → a problem is
  pushed to your drill pane.
- **`Stop`** → Claude finishes → the pane chimes "time's up" and lets you grade
  yourself.

It's **adaptive**: short waits show a quick *pattern-recall drill*; if Claude
grinds for more than ~90s the pane escalates to the **full problem**. Problems
you miss resurface sooner (spaced repetition), and the scheduler **interleaves**
patterns so you don't drill five sliding-window problems in a row.

You don't even need Claude — press **`n`** anytime to drill on demand.

## Install

**1. The hooks (Claude Code plugin):**

```
/plugin marketplace add ItsTun/spar
/plugin install spar
```

Installing the plugin wires the hooks automatically. Uninstalling removes them —
no `settings.json` surgery.

**2. The drill pane (npm):**

```sh
npm i -g spar     # then run `spar`
# or zero-install:
npx spar
```

> The npm package name may be published under a scope (e.g. `@itstun/spar`); the
> command is always `spar`. See [CHANGELOG](CHANGELOG.md).

**3. Open a split** next to Claude Code and run `spar`:

- tmux: `Ctrl-b %` then `spar`
- iTerm2: `⌘D` then `spar`
- VS Code terminal: split the panel, run `spar`

Run `spar doctor` if anything looks off.

## Keys

| key | action |
|-----|--------|
| `f` | reveal the full problem now |
| `h` | reveal the next hint |
| `s` | reveal the solution / approach |
| `g` | grade **got it** |
| `x` | grade **missed** (it resurfaces sooner) |
| `n` / space | next problem (drill on demand) |
| `q` | quit (stats are saved) |

## Commands

```sh
spar              # open the drill pane (default)
spar stats        # progress + per-pattern mastery + weak spots
spar off | on     # pause / resume the hooks without uninstalling
spar pause 2h     # snooze for a while (30m, 2h, 1d)
spar reset        # wipe stats
spar doctor       # diagnose install + terminal
```

Inside Claude Code you can also use the slash command: `/spar stats`, `/spar off`, …

## Privacy

- **Zero telemetry.** Nothing leaves your machine, ever.
- Your prompt text is **not** stored by default. The pane can optionally show
  "what Claude's working on" — it's opt-in (set `showPrompt: true` in your
  config) and capped at 80 characters.
- All state lives in a local data dir (`~/.local/share/spar`, or `$SPAR_DATA` /
  `%APPDATA%\spar`), **outside** the plugin install dir so your streak survives
  plugin updates.

## The problem bank

55 problems (and growing) across every core interview pattern — arrays/hashing,
two pointers, sliding window, stack, binary search, linked lists, trees, tries,
heaps, backtracking, graphs, DP, greedy, intervals, bit tricks.

All problem statements are **original** — written to teach the same pattern, not
copied from any paid platform. Want to add some? See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Status

`v0.1` — early but working end-to-end. Roadmap: richer spaced repetition,
community problem packs, streak freezes, Windows/ASCII polish, and adapters for
other AI coding tools. See [CHANGELOG.md](CHANGELOG.md).

## License

MIT © Tun Han. Not affiliated with or endorsed by LeetCode or Anthropic.
"LeetCode-style" is used descriptively.
