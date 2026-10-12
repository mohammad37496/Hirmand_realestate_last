#!/usr/bin/env node
/**
 * Reports CSS custom properties that are *referenced* via var() in the
 * stylesheets but never *defined* anywhere in the loaded cascade.
 *
 * An undefined custom property makes the whole declaration invalid at
 * computed-value time, so the property silently falls back to its initial
 * value — e.g. `background: linear-gradient(…, var(--missing), …)` becomes
 * `background: transparent` while `color: #fff` still applies. That is how
 * white text ends up on a transparent surface.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = "src";
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => join(dir, f));

// Load order matters only for reporting; definitions are global for this check.
const defined = new Set();
const used = new Map(); // name -> Set(files)

for (const file of files) {
  const css = readFileSync(file, "utf8");
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:/gi)) defined.add(m[1]);
  for (const m of css.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
    if (!used.has(m[1])) used.set(m[1], new Set());
    used.get(m[1]).add(file);
  }
}

const undefinedVars = [...used.entries()]
  .filter(([name]) => !defined.has(name))
  .map(([name, fs]) => ({ name, files: [...fs].sort() }))
  .sort((a, b) => b.files.length - a.files.length);

console.log(
  JSON.stringify(
    {
      cssFiles: files.length,
      defined: defined.size,
      referenced: used.size,
      undefinedCount: undefinedVars.length,
      undefinedVars,
    },
    null,
    1,
  ),
);
