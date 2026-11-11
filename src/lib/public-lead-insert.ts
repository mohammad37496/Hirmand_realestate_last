import type { Sql } from "./db";

export type PublicBudgetLeadInsertInput = {
  id: string;
  name: string;
  phone: string;
  peopleCount: number | null;
  job: string;
  deal: string;
  propertyType: string;
  neighborhood: string;
  consultantName: string;
  note: string;
  source: string;
  consultantId: string | null;
  acquisition: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    referrer: string | null;
    landingPath: string | null;
  };
  leaseDeadline: string | null;
  budgetDeposit: number | null;
  budgetRent: number | null;
  budgetPurchase: number | null;
  budgetSale: number | null;
  budgetRate: number | null;
  budgetEquivalent: number | null;
  budgetBedrooms: number | null;
  floorPreference: string;
  matchedProperties: unknown[];
  budgetDepositMin: number | null;
  budgetDepositMax: number | null;
  budgetRentMin: number | null;
  budgetRentMax: number | null;
  budgetPurchaseMin: number | null;
  budgetPurchaseMax: number | null;
  budgetSaleMin: number | null;
  budgetSaleMax: number | null;
  requestedAmenities: unknown[];
  requestedBedrooms: number | null;
  trackingToken: string;
};

/** Keep the positional SQL contract beside its values so consultant_id cannot drift into note/source. */
export async function insertPublicBudgetLead(
  sql: Pick<Sql, "query">,
  input: PublicBudgetLeadInsertInput,
): Promise<string | null> {
  const rows = await sql.query<{ id: string }>(
    `insert into leads (
      id, name, phone, people_count, job, deal, property_type, neighborhood, consultant, note, source, consultant_id,
      acquisition_source, acquisition_medium, acquisition_campaign, acquisition_referrer, acquisition_landing_path,
      follow_up_at, lease_deadline, budget_deposit, budget_rent, budget_purchase, budget_sale, budget_rate, budget_equivalent, budget_bedrooms,
      floor_preference, matched_properties, match_count,
      budget_deposit_min, budget_deposit_max, budget_rent_min, budget_rent_max,
      budget_purchase_min, budget_purchase_max, budget_sale_min, budget_sale_max,
      requested_amenities, requested_bedrooms, public_tracking_token
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,current_timestamp + interval '24 hours',$18,$19,$20,$21,$22,$23,$24,$25,$26,$27::jsonb,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37::jsonb,$38,$39)
    returning id`,
    [
      input.id,
      input.name,
      input.phone,
      input.peopleCount,
      input.job,
      input.deal,
      input.propertyType,
      input.neighborhood,
      input.consultantName,
      input.note,
      input.source,
      input.consultantId,
      input.acquisition.source,
      input.acquisition.medium,
      input.acquisition.campaign,
      input.acquisition.referrer,
      input.acquisition.landingPath,
      input.leaseDeadline,
      input.budgetDeposit,
      input.budgetRent,
      input.budgetPurchase,
      input.budgetSale,
      input.budgetRate,
      input.budgetEquivalent,
      input.budgetBedrooms,
      input.floorPreference,
      JSON.stringify(input.matchedProperties),
      input.matchedProperties.length,
      input.budgetDepositMin,
      input.budgetDepositMax,
      input.budgetRentMin,
      input.budgetRentMax,
      input.budgetPurchaseMin,
      input.budgetPurchaseMax,
      input.budgetSaleMin,
      input.budgetSaleMax,
      JSON.stringify(input.requestedAmenities),
      input.requestedBedrooms,
      input.trackingToken,
    ],
  );
  return rows[0]?.id ?? null;
}
