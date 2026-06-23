---
description: spar — interview-drill controls (stats, pause, doctor)
argument-hint: "[stats | doctor | off | on | pause 2h]"
allowed-tools: Bash(spar:*), Bash(node:*)
---

Run the spar CLI with the user's argument and show its output verbatim — do not
editorialize or reformat.

Argument (default to `stats` if empty): $ARGUMENTS

Run `spar $ARGUMENTS`. If the `spar` command is not found (the npm package isn't
installed), fall back to `node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" $ARGUMENTS`.
Then print the result.

Note: the live drill *pane* (`spar` with no argument) is interactive and must be
run by the user in their own terminal split — don't try to launch it here.
