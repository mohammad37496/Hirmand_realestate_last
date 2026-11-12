export type AreaPageDependency = "properties" | "market" | "content";

export type AreaPageDependencyResult<TProperties, TMarket, TContent> = {
  properties: TProperties | null;
  market: TMarket | null;
  content: TContent | null;
  failed: AreaPageDependency[];
};

/** Loads independent area-page data without allowing one failed query to erase the others. */
export async function settleAreaPageDependencies<TProperties, TMarket, TContent>(
  loaders: {
    properties: () => Promise<TProperties>;
    market: () => Promise<TMarket>;
    content: () => Promise<TContent>;
  },
  onError: (dependency: AreaPageDependency, error: unknown) => void = () => undefined,
): Promise<AreaPageDependencyResult<TProperties, TMarket, TContent>> {
  const [properties, market, content] = await Promise.allSettled([
    Promise.resolve().then(loaders.properties),
    Promise.resolve().then(loaders.market),
    Promise.resolve().then(loaders.content),
  ]);

  const failed: AreaPageDependency[] = [];
  if (properties.status === "rejected") {
    failed.push("properties");
    onError("properties", properties.reason);
  }
  if (market.status === "rejected") {
    failed.push("market");
    onError("market", market.reason);
  }
  if (content.status === "rejected") {
    failed.push("content");
    onError("content", content.reason);
  }

  return {
    properties: properties.status === "fulfilled" ? properties.value : null,
    market: market.status === "fulfilled" ? market.value : null,
    content: content.status === "fulfilled" ? content.value : null,
    failed,
  };
}
