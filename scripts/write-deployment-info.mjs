import { mkdir, writeFile } from "node:fs/promises";

const commit = process.env.DEPLOYMENT_SHA?.trim();
if (!commit || !/^[a-f0-9]{40}$/i.test(commit)) {
  throw new Error("DEPLOYMENT_SHA must be the full Git commit SHA.");
}

const publicDirectory = new URL("../public/", import.meta.url);
const destination = new URL("../public/deployment.json", import.meta.url);
const payload = {
  commit,
  branch: process.env.DEPLOYMENT_BRANCH || "unknown",
  runId: process.env.DEPLOYMENT_RUN_ID || null,
};

await mkdir(publicDirectory, { recursive: true });
await writeFile(destination, JSON.stringify(payload, null, 2) + "\n", "utf8");
process.stdout.write("Stamped public deployment revision " + commit + "\n");
