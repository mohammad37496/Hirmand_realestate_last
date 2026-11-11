import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { insertPublicBudgetLead } from "./public-lead-insert.ts";

test("public budget lead insert keeps consultant ID, note and source aligned", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table consultants (id text primary key);
      insert into consultants(id) values ('consultant-1');
      create table leads (
        id text primary key,
        name text not null,
        phone text not null,
        people_count integer,
        job text not null,
        deal text not null,
        property_type text not null,
        neighborhood text not null,
        consultant text not null,
        note text not null,
        source text not null,
        consultant_id text references consultants(id),
        acquisition_source text not null,
        acquisition_medium text not null,
        acquisition_campaign text not null,
        acquisition_referrer text not null,
        acquisition_landing_path text not null,
        follow_up_at timestamptz not null,
        lease_deadline date,
        budget_deposit numeric,
        budget_rent numeric,
        budget_purchase numeric,
        budget_sale numeric,
        budget_rate numeric,
        budget_equivalent numeric,
        budget_bedrooms integer,
        floor_preference text not null,
        matched_properties jsonb not null,
        match_count integer not null,
        budget_deposit_min numeric,
        budget_deposit_max numeric,
        budget_rent_min numeric,
        budget_rent_max numeric,
        budget_purchase_min numeric,
        budget_purchase_max numeric,
        budget_sale_min numeric,
        budget_sale_max numeric,
        requested_amenities jsonb not null,
        requested_bedrooms integer,
        public_tracking_token text not null
      );
    `);

    const sql = {
      query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
        (await pg.query<T>(text, params)).rows,
    } as unknown as Pick<Sql, "query">;
    const id = await insertPublicBudgetLead(sql, {
      id: "lead-1",
      name: "مشتری",
      phone: "09120000000",
      peopleCount: 2,
      job: "کارمند",
      deal: "خرید",
      propertyType: "آپارتمان",
      neighborhood: "مرداویج",
      consultantName: "مشاور اول",
      note: "یادداشت مشتری",
      source: "budget_match",
      consultantId: "consultant-1",
      acquisition: {
        source: "website",
        medium: "organic",
        campaign: "winter",
        referrer: "https://example.test/",
        landingPath: "/budget-match",
      },
      leaseDeadline: null,
      budgetDeposit: null,
      budgetRent: null,
      budgetPurchase: 5_000_000_000,
      budgetSale: null,
      budgetRate: null,
      budgetEquivalent: null,
      budgetBedrooms: 2,
      floorPreference: "middle",
      matchedProperties: [{ id: "property-1" }],
      budgetDepositMin: null,
      budgetDepositMax: null,
      budgetRentMin: null,
      budgetRentMax: null,
      budgetPurchaseMin: 4_000_000_000,
      budgetPurchaseMax: 5_000_000_000,
      budgetSaleMin: null,
      budgetSaleMax: null,
      requestedAmenities: ["parking"],
      requestedBedrooms: 2,
      trackingToken: "tracking-token",
    });

    assert.equal(id, "lead-1");
    const rows = await pg.query<{
      consultant: string;
      consultant_id: string;
      note: string;
      source: string;
      acquisition_source: string;
      public_tracking_token: string;
    }>("select consultant,consultant_id,note,source,acquisition_source,public_tracking_token from leads where id='lead-1'");
    assert.deepEqual(rows.rows[0], {
      consultant: "مشاور اول",
      consultant_id: "consultant-1",
      note: "یادداشت مشتری",
      source: "budget_match",
      acquisition_source: "website",
      public_tracking_token: "tracking-token",
    });
  } finally {
    await pg.close();
  }
});
