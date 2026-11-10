#!/usr/bin/env node
import { createServer } from "node:http";

if (process.env.CI !== "true") {
  throw new Error("The password-reset mail mock may only run in CI.");
}

const messages = [];
const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  if (request.method === "GET" && request.url === "/last") {
    response.writeHead(200).end(JSON.stringify({ count: messages.length, message: messages.at(-1) ?? null }));
    return;
  }
  if (request.method === "GET" && request.url === "/count") {
    response.writeHead(200).end(JSON.stringify({ count: messages.length }));
    return;
  }
  if (request.method !== "POST" || request.url !== "/emails") {
    response.writeHead(404).end(JSON.stringify({ error: "not_found" }));
    return;
  }
  if (request.headers.authorization !== "Bearer ci-password-reset-test-key") {
    response.writeHead(401).end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  let body = "";
  for await (const chunk of request) body += chunk;
  try {
    const message = JSON.parse(body);
    if (!Array.isArray(message.to) || !message.to.length || typeof message.html !== "string" || typeof message.text !== "string") {
      response.writeHead(400).end(JSON.stringify({ error: "invalid_message" }));
      return;
    }
    messages.push(message);
    response.writeHead(200).end(JSON.stringify({ id: `ci-email-${messages.length}` }));
  } catch {
    response.writeHead(400).end(JSON.stringify({ error: "invalid_json" }));
  }
});

server.listen(4321, "127.0.0.1", () => {
  process.stdout.write("[password-reset-mail-mock] listening on loopback:4321\n");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
