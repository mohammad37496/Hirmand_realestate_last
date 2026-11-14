import assert from "node:assert/strict";
import test from "node:test";
import { loadAreaPropertiesIfConfigured, settleAreaPageDependencies } from "./area-page-data.ts";

test("an unconfigured database does not turn unavailable area properties into a zero count", async () => {
  let loadCalled = false;
  const properties = await loadAreaPropertiesIfConfigured("unconfigured", async () => {
    loadCalled = true;
    return [];
  });

  assert.equal(properties, null);
  assert.equal(loadCalled, false);
});

test("a configured database preserves a genuine empty area property result", async () => {
  const properties = await loadAreaPropertiesIfConfigured("postgres", async () => []);
  assert.deepEqual(properties, []);
});

test("optional area content failures do not erase published property listings", async () => {
  const errors: Array<[string, unknown]> = [];
  const properties = [{ id: "published-1" }];
  const result = await settleAreaPageDependencies(
    {
      properties: async () => properties,
      market: async () => { throw new Error("market query unavailable"); },
      content: async () => { throw new Error("editorial query unavailable"); },
    },
    (dependency, error) => errors.push([dependency, error]),
  );

  assert.deepEqual(result.properties, properties);
  assert.equal(result.properties === null, false);
  assert.equal(result.market, null);
  assert.equal(result.content, null);
  assert.deepEqual(result.failed, ["market", "content"]);
  assert.deepEqual(errors.map(([dependency]) => dependency), ["market", "content"]);
});

test("a property listing query failure is distinguishable from a valid empty result", async () => {
  const failure = new Error("published property query unavailable");
  const errors: Array<[string, unknown]> = [];
  const market = { activeFiles: 3 };
  const content = { intro: "Editorial content remains available" };
  const result = await settleAreaPageDependencies(
    {
      properties: async () => { throw failure; },
      market: async () => market,
      content: async () => content,
    },
    (dependency, error) => errors.push([dependency, error]),
  );

  assert.equal(result.properties, null);
  assert.equal(result.market, market);
  assert.equal(result.content, content);
  assert.deepEqual(result.failed, ["properties"]);
  assert.deepEqual(errors, [["properties", failure]]);
});

test("a successful empty property query remains a genuine empty state", async () => {
  const result = await settleAreaPageDependencies(
    {
      properties: async () => [],
      market: async () => ({ activeFiles: 0 }),
      content: async () => null,
    },
  );

  assert.deepEqual(result.properties, []);
  assert.deepEqual(result.failed, []);
});

test("an unavailable market snapshot is distinct from a successful zero-count snapshot", async () => {
  const unavailable = await settleAreaPageDependencies({
    properties: async () => [],
    market: async () => null,
    content: async () => null,
  });
  const emptyButAvailable = await settleAreaPageDependencies({
    properties: async () => [],
    market: async () => ({ activeFiles: 0, saleFiles: 0, rentFiles: 0 }),
    content: async () => null,
  });

  assert.equal(unavailable.market, null);
  assert.deepEqual(emptyButAvailable.market, { activeFiles: 0, saleFiles: 0, rentFiles: 0 });
});
