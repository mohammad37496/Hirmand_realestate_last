import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [detail, neighborhood] = await Promise.all([
  readFile(new URL("../src/components/hirmand/property-detail-view.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/hirmand/property-neighborhood-insight.tsx", import.meta.url), "utf8"),
]);

test("price history distinguishes a failed query from a property with no recorded changes", () => {
  const effectStart = detail.indexOf("useEffect(() => {", detail.indexOf("const [priceHistoryRetry"));
  const effectEnd = detail.indexOf("}, [viewedPropertySlug, property?.price", effectStart);
  const effect = detail.slice(effectStart, effectEnd);

  assert.match(detail, /const \[priceHistoryError, setPriceHistoryError\] = useState\(""\)/);
  assert.match(detail, /const \[priceHistoryRetry, setPriceHistoryRetry\] = useState\(0\)/);
  assert.match(effect, /setPriceHistoryError\(""\)/);
  assert.match(effect, /setPriceHistoryError\("تاریخچه تغییرات قیمت/);
  assert.match(effect, /setPriceHistoryResolvedSlug\(viewedPropertySlug\)/);
  assert.doesNotMatch(effect, /catch\(\(\) => \{\s*if \(!cancelled\) setPriceHistory\(\[\]\)/);
  assert.match(detail, /className="property-price-history property-price-history-error" role="alert"/);
  assert.match(detail, /onClick=\{\(\) => setPriceHistoryRetry\(\(current\) => current \+ 1\)\}/);
  assert.match(detail, /className="property-price-history property-price-history-loading" role="status"/);
});

test("neighborhood insight query failures show a retryable error instead of silently hiding the card", () => {
  const effectStart = neighborhood.indexOf("useEffect(() => {");
  const effectEnd = neighborhood.indexOf("}, [property.neighborhood, retryVersion]);", effectStart);
  const effect = neighborhood.slice(effectStart, effectEnd);
  const errorBranch = neighborhood.indexOf("if (loadError)");
  const emptyDataBranch = neighborhood.indexOf("if (insight.count < 2)");

  assert.match(neighborhood, /const \[loadError, setLoadError\] = useState\(""\)/);
  assert.match(effect, /setLoadError\(""\)/);
  assert.match(effect, /setLoadError\("دریافت فایل‌های مقایسه‌ای/);
  assert.ok(errorBranch >= 0 && emptyDataBranch > errorBranch);
  assert.match(neighborhood, /className="property-neighborhood-insight" role="alert"/);
  assert.match(neighborhood, /onClick=\{\(\) => setRetryVersion\(\(current\) => current \+ 1\)\}/);
});
