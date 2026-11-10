import { SMART_MATCH_WEIGHTS } from "./smart-property-match.ts";

/** Weighted, transparent ranking for the guided purchase search. Parameters:
 * $3/$4 price range, $5 neighborhoods, $6/$7 area range, $8 minimum bedrooms,
 * $9 exact bedrooms, $10 amenities.
 */
export function buildSmartPropertyMatchScoreSql(): string {
  const budgetScore = `case
    when $3::numeric is null and $4::numeric is null then 0
    when price is null then 0
    when $3::numeric is not null and price < $3::numeric
      then ${SMART_MATCH_WEIGHTS.budget}.0 * greatest(0.0, 1.0 - (($3::numeric - price) / nullif($3::numeric, 0)))
    when $4::numeric is not null and price > $4::numeric
      then ${SMART_MATCH_WEIGHTS.budget}.0 * greatest(0.0, 1.0 - ((price - $4::numeric) / nullif($4::numeric, 0)))
    else ${SMART_MATCH_WEIGHTS.budget}.0
  end`;
  const neighborhoodScore = `case
    when cardinality($5::text[]) = 0 then 0
    when neighborhood = any($5::text[]) then ${SMART_MATCH_WEIGHTS.neighborhoods}.0
    else 0.0
  end`;
  const areaScore = `case
    when $6::int is null and $7::int is null then 0
    when area_m2 is null then 0
    when $6::int is not null and area_m2 < $6::int
      then ${SMART_MATCH_WEIGHTS.area}.0 * greatest(0, area_m2) / nullif($6::int, 0)
    when $7::int is not null and area_m2 > $7::int
      then ${SMART_MATCH_WEIGHTS.area}.0 * greatest(0, $7::int) / nullif(area_m2, 0)
    else ${SMART_MATCH_WEIGHTS.area}.0
  end`;
  const bedroomScore = `case
    when $9::int is not null then case when bedrooms = $9::int then ${SMART_MATCH_WEIGHTS.bedrooms}.0 else 0.0 end
    when $8::int is null then 0
    when bedrooms is null then 0
    when bedrooms >= $8::int then ${SMART_MATCH_WEIGHTS.bedrooms}.0
    else ${SMART_MATCH_WEIGHTS.bedrooms}.0 * greatest(0, bedrooms) / greatest($8::int, 1)
  end`;
  const amenitiesScore = `case
    when cardinality($10::text[]) = 0 then 0
    else ${SMART_MATCH_WEIGHTS.amenities}.0 * (
      (case when 'parking' = any($10::text[]) and parking then 1 else 0 end) +
      (case when 'elevator' = any($10::text[]) and elevator then 1 else 0 end) +
      (case when 'storage' = any($10::text[]) and storage then 1 else 0 end)
    ) / cardinality($10::text[])
  end`;
  const activeWeight = `
    (case when $3::numeric is not null or $4::numeric is not null then ${SMART_MATCH_WEIGHTS.budget} else 0 end) +
    (case when cardinality($5::text[]) > 0 then ${SMART_MATCH_WEIGHTS.neighborhoods} else 0 end) +
    (case when $6::int is not null or $7::int is not null then ${SMART_MATCH_WEIGHTS.area} else 0 end) +
    (case when $8::int is not null or $9::int is not null then ${SMART_MATCH_WEIGHTS.bedrooms} else 0 end) +
    (case when cardinality($10::text[]) > 0 then ${SMART_MATCH_WEIGHTS.amenities} else 0 end)`;

  return `round(100.0 * (${budgetScore} + ${neighborhoodScore} + ${areaScore} + ${bedroomScore} + ${amenitiesScore}) / nullif(${activeWeight}, 0))::int`;
}
