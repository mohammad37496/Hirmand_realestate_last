import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { publicPropertyFiltersSchema } from "./property-search-contract.ts";
import { finishPropertyLoadMore, resetPropertySearchPaginationLock } from "./property-search-pagination.ts";

test("public filter contract accepts supported transaction types and money ranges", () => {
  const parsed = publicPropertyFiltersSchema.parse({
    transactionType: "rent",
    propertyType: "apartment",
    search: "شهرک ولی‌عصر",
    minDeposit: 500_000_000,
    maxDeposit: 900_000_000,
    minRent: 15_000_000,
    maxRent: 25_000_000,
  });
  assert.equal(parsed.transactionType, "rent");
  assert.equal(parsed.sort, "newest");
  assert.equal(parsed.offset, 0);
});

test("public filter contract accepts up to 12 distinct neighborhoods", () => {
  const neighborhoods = ["مرداویج", "جلفا", "خانه اصفهان"];
  const parsed = publicPropertyFiltersSchema.parse({ neighborhoods });
  assert.deepEqual(parsed.neighborhoods, neighborhoods);
  assert.equal(publicPropertyFiltersSchema.safeParse({ neighborhoods: Array.from({ length: 13 }, (_, index) => `محله ${index}`) }).success, false);
  assert.equal(publicPropertyFiltersSchema.safeParse({ neighborhoods: ["جلفا", "جلفا"] }).success, false);
  assert.equal(publicPropertyFiltersSchema.safeParse({ neighborhoods: ["جلفا", "جِلفا"] }).success, false);
  assert.equal(publicPropertyFiltersSchema.safeParse({ neighborhoods: [" "] }).success, false);
});

test("public filter contract rejects unsupported transaction and property types", () => {
  assert.equal(publicPropertyFiltersSchema.safeParse({ transactionType: "lease" }).success, false);
  assert.equal(publicPropertyFiltersSchema.safeParse({ propertyType: "garage" }).success, false);
});

test("public filter contract rejects negative, fractional, excessive and unsafe bounds", () => {
  for (const data of [
    { minPrice: -1 },
    { minArea: 100001 },
    { minBedrooms: 31 },
    { minRent: 10.5 },
    { maxDeposit: Number.MAX_SAFE_INTEGER },
    { offset: -1 },
  ]) {
    assert.equal(publicPropertyFiltersSchema.safeParse(data).success, false, JSON.stringify(data));
  }
});

test("public filter contract rejects inverted ranges and malformed map bounds", () => {
  assert.equal(publicPropertyFiltersSchema.safeParse({ minArea: 120, maxArea: 80 }).success, false);
  assert.equal(publicPropertyFiltersSchema.safeParse({ minRent: 25_000_000, maxRent: 15_000_000 }).success, false);
  assert.equal(publicPropertyFiltersSchema.safeParse({ mapBounds: [51.65, 32.6, 51.61, 32.7] }).success, false);
});

test("public filter contract rejects symbol-only search text but permits an empty search", () => {
  assert.equal(publicPropertyFiltersSchema.safeParse({ search: "!!!" }).success, false);
  assert.equal(publicPropertyFiltersSchema.safeParse({ neighborhood: "%%%" }).success, false);
  assert.equal(publicPropertyFiltersSchema.safeParse({ search: "" }).success, true);
  assert.equal(publicPropertyFiltersSchema.safeParse({ featureSearch: "؟؟؟" }).success, false);
});


test("public floor filters allow -60 and levels 0 through 20, rejecting unsupported values", () => {
  for (let floor = -59; floor <= -1; floor += 1) {
    assert.equal(publicPropertyFiltersSchema.safeParse({ minFloor: floor }).success, false, String(floor));
    assert.equal(publicPropertyFiltersSchema.safeParse({ maxFloor: floor }).success, false, String(floor));
  }
  for (let floor = 21; floor <= 200; floor += 1) {
    assert.equal(publicPropertyFiltersSchema.safeParse({ minFloor: floor }).success, false, String(floor));
    assert.equal(publicPropertyFiltersSchema.safeParse({ maxFloor: floor }).success, false, String(floor));
  }
  assert.equal(publicPropertyFiltersSchema.safeParse({ minFloor: -60, maxFloor: 0 }).success, true);
  assert.equal(publicPropertyFiltersSchema.safeParse({ minFloor: 0, maxFloor: 20 }).success, true);
});

test("stale load-more requests cannot clear a newer query loading state", async () => {
  const route = await readFile(new URL("../routes/properties.index.tsx", import.meta.url), "utf8");
  const queryEffectStart = route.indexOf("const currentRequest = ++requestId.current;");
  const queryEffectEnd = route.indexOf("const timer = window.setTimeout", queryEffectStart);
  const queryEffect = route.slice(queryEffectStart, queryEffectEnd);
  const validQueryStart = queryEffect.indexOf("setLoading(true);");
  assert.ok(validQueryStart >= 0, "a valid filter change must start the new query");
  assert.ok(
    queryEffect.indexOf("resetPropertySearchPaginationLock(setLoadingMore);", validQueryStart) >= 0,
    "a valid filter change must release the previous page-request lock",
  );

  const loadMoreStart = route.indexOf("const loadMore = useCallback");
  const loadMoreEnd = route.indexOf("  }, [", loadMoreStart);
  const loadMore = route.slice(loadMoreStart, loadMoreEnd);
  assert.match(loadMore, /finishPropertyLoadMore\(requestId, queryVersion, setLoadingMore\)/);

  const requestId = { current: 1 };
  let loadingMore = true;
  const setLoadingMore = (value: boolean) => { loadingMore = value; };
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
  };

  const oldPageVersion = requestId.current;
  const oldPage = deferred();
  const oldCompletion = oldPage.promise.finally(() =>
    finishPropertyLoadMore(requestId, oldPageVersion, setLoadingMore),
  );

  requestId.current += 1;
  resetPropertySearchPaginationLock(setLoadingMore);
  assert.equal(loadingMore, false, "the new query releases the old page lock");

  const currentPageVersion = requestId.current;
  const currentPage = deferred();
  const currentCompletion = currentPage.promise.finally(() =>
    finishPropertyLoadMore(requestId, currentPageVersion, setLoadingMore),
  );
  loadingMore = true;

  oldPage.resolve();
  await oldCompletion;
  assert.equal(loadingMore, true, "the stale page completion cannot clear the newer page lock");

  currentPage.resolve();
  await currentCompletion;
  assert.equal(loadingMore, false, "the current page completion releases its own lock");
});

test("map-list featured badge respects the same expiry rule as property cards", async () => {
  const route = await readFile(new URL("../routes/properties.index.tsx", import.meta.url), "utf8");
  assert.match(route, /import\s*\{[\s\S]*?isFeaturedActive[\s\S]*?\}\s*from "@\/lib\/properties"/);
  assert.match(route, /isFeaturedActive\(property\)\s*\?\s*"ویژه"/);
  assert.doesNotMatch(route, /property\.featured\s*\?\s*"ویژه"/);
});
