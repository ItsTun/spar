# Contributing to spar

Thanks for helping keep engineers sharp! The most valuable contribution is
**more problems**.

## Adding a problem

Problems live in `src/bank.js` as plain objects. Add one with all required
fields, then run the linter:

```sh
npm run lint:problems
```

### Required fields

| field | what |
|-------|------|
| `id` | stable kebab-case key, **never reused** (stats reference it) |
| `title` | the problem name |
| `diff` | `Easy` \| `Medium` \| `Hard` |
| `pattern` | the technique drilled, e.g. `"Sliding Window"` |
| `drillQ` | one-line recall prompt shown on short waits |
| `drillA` | the key idea in 1–2 lines |
| `prompt` | the full statement — **original wording** (see below) |
| `examples` | (optional) example I/O |
| `hints` | array of progressive hints (≥1) |
| `approach` | solution sketch |
| `complexity` | e.g. `"Time O(n), Space O(1)"` |

The contract is also formalized in [`schema/problem.schema.json`](schema/problem.schema.json).

### ⚠️ Write original statements

Do **not** paste problem statements from LeetCode or any paid platform — those
are copyrighted. Write the task in your own words. The underlying algorithmic
idea (e.g. "find two indices that sum to a target") is fair game; the verbatim
text is not. PRs with copied text will be asked to reword.

## Before opening a PR

```sh
npm run check     # lint problems + run tests
```

CI runs the same on Node 18 and 20. Keep it green.

## Other contributions

Bug fixes, terminal/Windows compatibility, scheduler improvements, and docs are
all welcome. Open an issue first for anything large so we can align on approach.
