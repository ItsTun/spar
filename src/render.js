// render.js — terminal drawing: colors, box, word-wrap, with graceful fallbacks
// for NO_COLOR, non-TTY, narrow panes, and terminals without box-drawing glyphs.

function makeColor(enabled) {
  const C = (code) => (s) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : String(s));
  return {
    bold: C(1), dim: C(2), red: C(31), grn: C(32), yel: C(33),
    blu: C(34), mag: C(35), cyan: C(36), gray: C(90),
  };
}

// Box-drawing glyphs, with an ASCII fallback set.
const GLYPHS = {
  unicode: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" },
  ascii: { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" },
};
const SPINNERS = {
  unicode: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  ascii: ["|", "/", "-", "\\"],
};

// visible length, ignoring ANSI color codes
const vlen = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, "").length;

function wrap(text, w) {
  const out = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      if (vlen(line ? line + " " + word : word) > w) { if (line) out.push(line); line = word; }
      else line = line ? line + " " + word : word;
    }
    out.push(line);
  }
  return out;
}

// Returns { color, glyph, spinner, width, wrap, box } configured for this terminal.
function make(opts = {}) {
  const out = opts.stream || process.stdout;
  const useColor = !process.env.NO_COLOR && !opts.ascii && out.isTTY !== false;
  const useUnicode = !opts.ascii && (process.platform !== "win32" || process.env.WT_SESSION);
  const color = makeColor(useColor);
  const g = useUnicode ? GLYPHS.unicode : GLYPHS.ascii;
  const spin = useUnicode ? SPINNERS.unicode : SPINNERS.ascii;
  const width = () => Math.max(34, Math.min((opts.columns || out.columns || 64), 92));

  function box(titleLeft, titleRight, bodyLines) {
    const w = width();
    const inner = w - 2;
    const l = " " + titleLeft + " ";
    const r = titleRight ? " " + titleRight + " " : "";
    const fill = inner - vlen(l) - vlen(r);
    const top = g.tl + l + g.h.repeat(Math.max(0, fill)) + r + g.tr;
    const rows = bodyLines.map((line) => {
      const pad = inner - 1 - vlen(line);
      return g.v + " " + line + " ".repeat(Math.max(0, pad)) + g.v;
    });
    const bot = g.bl + g.h.repeat(inner) + g.br;
    return [top, ...rows, bot];
  }

  return { color, spin, width, wrap, box, vlen, useColor, useUnicode };
}

module.exports = { make, wrap, vlen };
