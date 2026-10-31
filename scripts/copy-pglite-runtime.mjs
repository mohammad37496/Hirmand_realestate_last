import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configuredDataDir = process.env.PGLITE_DATA_DIR?.trim();

if (!configuredDataDir) {
  console.log("[pglite-runtime] skipped: PGLITE_DATA_DIR is not configured.");
} else {
  const outputDir = resolve(
    root,
    process.env.HIRMAND_BUILD_OUTPUT_DIR?.trim() || ".output",
  );
  const packageDir = join(root, "node_modules", "@electric-sql", "pglite", "dist");
  const runtimeDir = join(outputDir, "server", "_libs");
  const assets = ["pglite.data", "pglite.wasm", "initdb.wasm"];

  for (const asset of assets) {
    const source = join(packageDir, asset);
    if (!existsSync(source)) {
      throw new Error(`[pglite-runtime] required PGlite runtime asset is missing: ${source}`);
    }
  }

  mkdirSync(runtimeDir, { recursive: true });
  for (const asset of assets) {
    copyFileSync(join(packageDir, asset), join(runtimeDir, asset));
  }

  console.log(
    `[pglite-runtime] copied ${assets.join(", ")} to ${runtimeDir} for the explicitly configured local PGlite runtime.`,
  );
}
