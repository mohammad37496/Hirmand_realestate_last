// TEMPORARY verification harness (Phase 3/5 evidence). Run: node scripts/verify-db-flows.mjs
// Applies the real migrations to an in-memory Postgres (PGlite) and replays the
// exact SQL of the suspect flows: property save, Persian slug lookup, card list,
// bulk publish, and lead insert.
import { PGlite, MemoryFS } from "@electric-sql/pglite";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pendingMigrations } from "./migration-plan.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationsDir = join(root, "migrations");
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

const parsers = { 20: Number, 1082: (v) => v, 1186: (v) => v };
const pg = new PGlite({ fs: new MemoryFS(), parsers });
await pg.waitReady;
await pg.exec("create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())");

for (const name of pendingMigrations(files, [])) {
  const source = readFileSync(join(migrationsDir, name.name), "utf8");
  await pg.transaction(async (tx) => {
    await tx.exec(source);
    await tx.query("insert into _migrations (name) values ($1)", [name.name]);
  });
}
console.log("MIGRATIONS OK:", files.length, "applied");

const q = (text, params = []) => pg.query(text, params).then((r) => r.rows);
let failures = 0;
function check(label, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${extra ? " | " + extra : ""}`);
  if (!ok) failures += 1;
}

// ---------- EXP 1: saveProperty INSERT (the $28 zone) ----------
const INSERT_SQL = `insert into properties (
  id, slug, status, featured, title, transaction_type, property_type, city,
  neighborhood, address, area_m2, bedrooms, bathrooms, floor, total_floors,
  built_year, parking, elevator, storage, cabinet_type, flooring_type, cooling_system,
  heating_system, wall_closet_type, other_amenities, price, deposit, rent, description,
  features, images, contact_name, contact_phone, published_at, featured_until
) values (
  $1, $2, $3, $4, $5, $6, $7, 'اصفهان',
  $8, $9, $10::integer, $11::smallint, $12::smallint, $13::smallint, $14::smallint,
  $15::smallint, $16::boolean, $17::boolean, $18::boolean, $19::text, $20::text, $21::text,
  $22::text, $23::text, $24::jsonb, $25::numeric, $26::numeric, $27::numeric, $28::text,
  $29::jsonb, $30::jsonb, $31::text, $32::text, $33::timestamptz, $34::timestamptz
)
on conflict (id) do update set
  slug = excluded.slug, status = excluded.status, featured = excluded.featured,
  featured_until = excluded.featured_until, title = excluded.title,
  transaction_type = excluded.transaction_type, property_type = excluded.property_type,
  neighborhood = excluded.neighborhood, address = excluded.address,
  area_m2 = excluded.area_m2, bedrooms = excluded.bedrooms, bathrooms = excluded.bathrooms,
  floor = excluded.floor, total_floors = excluded.total_floors, built_year = excluded.built_year,
  parking = excluded.parking, elevator = excluded.elevator, storage = excluded.storage,
  cabinet_type = excluded.cabinet_type, flooring_type = excluded.flooring_type,
  cooling_system = excluded.cooling_system, heating_system = excluded.heating_system,
  wall_closet_type = excluded.wall_closet_type, other_amenities = excluded.other_amenities,
  price = excluded.price, deposit = excluded.deposit, rent = excluded.rent,
  previous_price = properties.price, previous_deposit = properties.deposit, previous_rent = properties.rent,
  price_changed_at = case
    when (case when properties.transaction_type = 'rent' then coalesce(properties.rent, properties.deposit)
               when properties.transaction_type = 'mortgage' then properties.deposit
               else properties.price end) is not null
     and (case when excluded.transaction_type = 'rent' then coalesce(excluded.rent, excluded.deposit)
               when excluded.transaction_type = 'mortgage' then excluded.deposit
               else excluded.price end) is not null
     and (case when properties.transaction_type = 'rent' then coalesce(properties.rent, properties.deposit)
               when properties.transaction_type = 'mortgage' then properties.deposit
               else properties.price end) > 0
     and (case when excluded.transaction_type = 'rent' then coalesce(excluded.rent, excluded.deposit)
               when excluded.transaction_type = 'mortgage' then excluded.deposit
               else excluded.price end)
         < (case when properties.transaction_type = 'rent' then coalesce(properties.rent, properties.deposit)
                 when properties.transaction_type = 'mortgage' then properties.deposit
                 else properties.price end)
    then current_timestamp else properties.price_changed_at end,
  price_drop_percent = case
    when (case when properties.transaction_type = 'rent' then coalesce(properties.rent, properties.deposit)
               when properties.transaction_type = 'mortgage' then properties.deposit
               else properties.price end) > 0
     and (case when excluded.transaction_type = 'rent' then coalesce(excluded.rent, excluded.deposit)
               when excluded.transaction_type = 'mortgage' then excluded.deposit
               else excluded.price end)
         < (case when properties.transaction_type = 'rent' then coalesce(properties.rent, properties.deposit)
                 when properties.transaction_type = 'mortgage' then properties.deposit
                 else properties.price end)
    then round(((case when properties.transaction_type = 'rent' then coalesce(properties.rent, properties.deposit)
                      when properties.transaction_type = 'mortgage' then properties.deposit
                      else properties.price end)
              - (case when excluded.transaction_type = 'rent' then coalesce(excluded.rent, excluded.deposit)
                      when excluded.transaction_type = 'mortgage' then excluded.deposit
                      else excluded.price end))
             / nullif((case when properties.transaction_type = 'rent' then coalesce(properties.rent, properties.deposit)
                            when properties.transaction_type = 'mortgage' then properties.deposit
                            else properties.price end), 0) * 100, 2)
    else null end,
  description = excluded.description, features = excluded.features, images = excluded.images,
  contact_name = excluded.contact_name, contact_phone = excluded.contact_phone,
  published_at = case
    when excluded.status = 'published' and properties.published_at is null then excluded.published_at
    when excluded.status <> 'published' then null
    else properties.published_at end,
  updated_at = current_timestamp`;

function savePropertyParams(over = {}) {
  return [
    over.id ?? crypto.randomUUID(),
    over.slug ?? "آپارتمان-نمونه-aaaa1111",
    over.status ?? "published",
    over.featured ?? false,
    over.title ?? "آپارتمان نمونه در محله سعادت‌آباد",
    over.transactionType ?? "sell",
    over.propertyType ?? "apartment",
    over.neighborhood ?? "سعادت‌آباد",
    over.address ?? null,
    over.areaM2 ?? 120,
    over.bedrooms ?? 2,
    over.bathrooms ?? 1,
    over.floor ?? 3,
    over.totalFloors ?? 5,
    over.builtYear ?? 1398,
    over.parking ?? true,
    over.elevator ?? true,
    over.storage ?? false,
    over.cabinetType ?? null,
    over.flooringType ?? null,
    over.coolingSystem ?? null,
    over.heatingSystem ?? null,
    over.wallClosetType ?? null,
    over.otherAmenities ?? JSON.stringify([]),
    over.price ?? "4500000000",
    over.deposit ?? null,
    over.rent ?? null,
    over.description ?? "این یک توضیح نمونه با بیش از ده کاراکتر است.",
    over.features ?? JSON.stringify(["آسانسور"]),
    over.images ?? JSON.stringify(["/api/media/test-id"]),
    over.contactName ?? "مشاور نمونه",
    over.contactPhone ?? "09131056029",
    over.publishedAt ?? new Date().toISOString(),
    over.featuredUntil ?? null,
  ];
}

try {
  const id1 = crypto.randomUUID();
  await q(INSERT_SQL, savePropertyParams({ id: id1 }));
  await q(INSERT_SQL, savePropertyParams({ id: id1, price: "4000000000" })); // update path
  check("EXP1 saveProperty insert+update (price as string) incl. $28 zone", true);
} catch (e) {
  check("EXP1 saveProperty insert+update (price as string) incl. $28 zone", false, e.message);
}

try {
  await q(INSERT_SQL, savePropertyParams({ id: crypto.randomUUID(), slug: "rental-نمونه-" + crypto.randomUUID().slice(0, 8), price: null, deposit: null, rent: null, transactionType: "rent" }));
  check("EXP1b insert with all-null money fields (typed $25..$27)", true);
} catch (e) {
  check("EXP1b insert with all-null money fields (typed $25..$27)", false, e.message);
}

// Legacy pipeline: empty string / "null" reaching an untyped param.
// These document the failure mode older untyped inserts would hit; the current
// pipeline normalizes both to null BEFORE the query (see EXP1e), so a rejection
// here is expected evidence, not a regression.
const legacyEvidence = [];
try {
  await q(`insert into properties (id, slug, status, title, transaction_type, property_type, neighborhood, description, contact_name, contact_phone, price)
           values ($1,$2,'published','t','sell','apartment','n','d','c','09131056029', $3)`,
    [crypto.randomUUID(), "legacy-x", ""]);
  legacyEvidence.push("UNEXPECTED: empty-string price accepted");
} catch (e) {
  legacyEvidence.push("empty-string price rejected by PG: " + e.message.split("\n")[0]);
}
try {
  await q(`insert into properties (id, slug, status, title, transaction_type, property_type, neighborhood, description, contact_name, contact_phone, price)
           values ($1,$2,'published','t','sell','apartment','n','d','c','09131056029', $3)`,
    [crypto.randomUUID(), "legacy-y", "null"]);
  legacyEvidence.push("UNEXPECTED: literal-'null' price accepted");
} catch (e) {
  legacyEvidence.push("literal-'null' price rejected by PG: " + e.message.split("\n")[0]);
}
console.log("EVIDENCE (legacy failure mode): " + legacyEvidence.join(" ; "));

// normalizeMoneyText behaviour from src/lib/properties.ts
function normalizeMoneyText(value) {
  if (value == null) return "";
  const raw = String(value).trim();
  if (!raw || /^(null|undefined)$/i.test(raw)) return "";
  return raw.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[,_٬\s]/g, "");
}
const samples = ["null", "NULL", "", "۴۵۰۰۰۰۰۰۰۰", "1,500,000", undefined];
for (const s of samples) {
  try {
    const out = normalizeMoneyText(s);
    check(`EXP1e normalizeMoneyText(${JSON.stringify(String(s))}) -> ${JSON.stringify(out)}`, out === "" || /^\d+$/.test(out));
  } catch (e) {
    check(`EXP1e normalizeMoneyText(${JSON.stringify(String(s))})`, false, e.constructor.name + ": " + e.message);
  }
}

// ---------- EXP 2: Persian slug lookup ----------
const DETAIL_COLUMNS = `id, slug, status, featured, featured_until, title, transaction_type, property_type, city,
  neighborhood, address, area_m2, bedrooms, bathrooms, floor, total_floors,
  built_year, parking, elevator, storage, cabinet_type, flooring_type, cooling_system,
  heating_system, wall_closet_type, other_amenities, price, deposit, rent, description,
  features, images, contact_name, contact_phone, published_at, created_at, updated_at,
  latitude, longitude, price_drop_percent`;
const LOOKUP_SQL = `select ${DETAIL_COLUMNS} from properties
  where status = 'published'
    and (slug = any($1::text[]) or id::text = any($1::text[])
         or lower(left(id::text, 8)) = any($4::text[])
         or lower(right(id::text, 8)) = any($4::text[]))
  order by case when slug = $2 then 0 when slug = $3 then 1
    when id::text = any($1::text[]) then 2
    when lower(left(id::text, 8)) = any($4::text[]) then 3
    when lower(right(id::text, 8)) = any($4::text[]) then 4 else 5 end
  limit 1`;

const slugId = crypto.randomUUID();
const persianSlug = "آپارتمان-۱۲۰ متری سعادت‌آباد-" + slugId.slice(0, 8);
await q(INSERT_SQL, savePropertyParams({ id: slugId, slug: persianSlug }));

// single-encoded arrival
{
  const rows = await q(LOOKUP_SQL, [[persianSlug], persianSlug, persianSlug, [slugId.slice(0, 8)]]);
  check("EXP2a Persian slug (single-encoded) resolves detail row", rows.length === 1 && rows[0].id === slugId);
}
// double-encoded arrival: candidate list after two decodeURIComponent passes
{
  const once = decodeURIComponent(encodeURIComponent(encodeURIComponent(persianSlug)));
  const twice = decodeURIComponent(once);
  check("EXP2b decodeURIComponent chain recovers the original slug", twice === persianSlug);
  const candidates = [once, twice].filter((v, i, a) => a.indexOf(v) === i);
  const rows = await q(LOOKUP_SQL, [candidates, candidates[0], candidates[1] ?? candidates[0], [slugId.slice(0, 8)]]);
  check("EXP2b double-encoded Persian slug still resolves via candidate list", rows.length === 1 && rows[0].id === slugId);
}
// legacy /file/:id redirect source: full id lookup
{
  const rows = await q(`select ${DETAIL_COLUMNS} from properties where status='published' and id::text = $1 limit 1`, [slugId]);
  check("EXP2c getPublishedPropertyById finds row for /file/$id redirect", rows.length === 1);
}

// ---------- EXP 2c2: /file/:id with an 8-hex fragment (legacy short link) ----------
try {
  const fragment = slugId.slice(0, 8);
  const rowsFrag = await q(
    `select ${DETAIL_COLUMNS} from properties
     where status = 'published'
       and (id::text = $1
            or ($2 <> '' and lower(left(id::text, 8)) = $2)
            or ($2 <> '' and lower(right(id::text, 8)) = $2))
     order by case when id::text = $1 then 0 else 1 end
     limit 1`,
    [fragment, fragment],
  );
  check("EXP2c2 /file/<8-hex-fragment> resolves via new id lookup (legacy short link)", rowsFrag.length === 1 && rowsFrag[0].id === slugId);
  const rowsExact = await q(
    `select ${DETAIL_COLUMNS} from properties
     where status = 'published'
       and (id::text = $1
            or ($2 <> '' and lower(left(id::text, 8)) = $2)
            or ($2 <> '' and lower(right(id::text, 8)) = $2))
     order by case when id::text = $1 then 0 else 1 end
     limit 1`,
    [slugId, ""],
  );
  check("EXP2c3 full-id lookup unchanged (empty fragment arm disabled)", rowsExact.length === 1 && rowsExact[0].id === slugId);
} catch (e) {
  check("EXP2c2/c3 /file fragment lookups", false, e.message.split("\n")[0]);
}

// ---------- EXP 3: card list SQL ($27 sort, $22 jsonb ?) ----------
const CARD_COLUMNS = `id, slug, status, featured, featured_until, title, transaction_type, property_type,
  neighborhood, area_m2, bedrooms, parking, elevator, price, deposit, rent,
  nullif(images->>0, '') as image, price_drop_percent, latitude, longitude`;
const PRICE_EXPR = "case when transaction_type = 'rent' then coalesce(rent, deposit) when transaction_type = 'mortgage' then deposit else price end";
const WHERE = [
  "status = 'published'",
  "and ($1::text is null or transaction_type = $1)",
  "and ($2::text is null or property_type = $2)",
  "and ($3::text is null or ($5::boolean is true and neighborhood = $3) or ($5::boolean is false and neighborhood ilike '%' || $3 || '%'))",
  "and ($4::boolean is false or (featured = true and (featured_until is null or featured_until >= current_timestamp)))",
  "and ($6::text is null or title ilike '%' || $6 || '%' or neighborhood ilike '%' || $6 || '%' or address ilike '%' || $6 || '%')",
  "and ($7::int is null or area_m2 >= $7)",
  "and ($8::int is null or area_m2 <= $8)",
  "and ($9::numeric is null or " + PRICE_EXPR + " >= $9)",
  "and ($10::numeric is null or " + PRICE_EXPR + " <= $10)",
  "and ($11::int is null or bedrooms >= $11)",
  "and ($12::int is null or bathrooms >= $12)",
  "and ($13::int is null or floor >= $13)",
  "and ($14::int is null or floor <= $14)",
  "and ($15::int is null or total_floors >= $15)",
  "and ($16::int is null or total_floors <= $16)",
  "and ($17::int is null or built_year >= $17)",
  "and ($18::int is null or built_year <= $18)",
  "and ($19::boolean is false or parking = true)",
  "and ($20::boolean is false or elevator = true)",
  "and ($21::boolean is false or storage = true)",
  "and ($22::text[] is null or cardinality($22::text[]) = 0 or exists (select 1 from unnest($22::text[]) as selected(value) where (selected.value like 'cabinet:%' and cabinet_type = substring(selected.value from 9)) or (selected.value like 'flooring:%' and flooring_type = substring(selected.value from 10)) or (selected.value like 'cooling:%' and cooling_system = substring(selected.value from 9)) or (selected.value like 'heating:%' and heating_system = substring(selected.value from 9)) or (selected.value like 'closet:%' and wall_closet_type = substring(selected.value from 8)) or coalesce(other_amenities, '[]'::jsonb) ? selected.value))",
  "and ($23::text is null or exists (select 1 from jsonb_array_elements_text(coalesce(features, '[]'::jsonb)) as feature(value) where feature.value ilike '%' || $23 || '%'))",
  "and ($24::boolean is false or (jsonb_typeof(coalesce(images, '[]'::jsonb)) = 'array' and jsonb_array_length(coalesce(images, '[]'::jsonb)) > 0))",
  "and ($25::boolean is false or (latitude is not null and longitude is not null))",
].join(" ");
const params = [null, null, null, false, false, null, null, null, null, null, null, null, null, null, null, null, null, null, false, false, false, null, null, false, false];
try {
  const rows = await q(`select ${CARD_COLUMNS} from properties where ${WHERE} order by case when $27::text = 'newest' then case when featured and (featured_until is null or featured_until >= current_timestamp) then 0 else 1 end else 0 end, case when $27::text = 'price_asc' then ${PRICE_EXPR} end asc nulls last, case when $27::text = 'price_desc' then ${PRICE_EXPR} end desc nulls last, case when $27::text = 'area_asc' then area_m2 end asc nulls last, case when $27::text = 'area_desc' then area_m2 end desc nulls last, published_at desc nulls last, created_at desc limit 48 offset $26`,
    [...params, 0, "newest"]);
  check("EXP3 listPublishedPropertyCards SQL executes on real PG", rows.length >= 3);
} catch (e) {
  writeFileSync("/tmp/exp3-error.log", String(e && e.stack ? e.stack : e));
  check("EXP3 listPublishedPropertyCards SQL executes on real PG", false, String(e && e.message ? e.message : e).replace(/[\r\n]+/g, " | ").slice(0, 300));
}

// ---------- EXP 4: admin bulk publish ----------
try {
  const rows = await q(`update properties set status = $1,
      published_at = case when $1 = 'published' then coalesce(published_at, current_timestamp) else null end,
      updated_at = current_timestamp
    where id = any($2::text[]) returning id`, ["draft", [slugId]]);
  check("EXP4 bulkUpdatePropertyStatus SQL", rows.length === 1);
  await q(`update properties set status = 'published', published_at = coalesce(published_at, current_timestamp), updated_at = current_timestamp where id = any($1::text[])`, [[slugId]]);
} catch (e) {
  check("EXP4 bulkUpdatePropertyStatus SQL", false, e.message.split("\n")[0]);
}

// ---------- EXP 5: leads insert (both sources) ----------
const LEAD_SQL = `insert into leads (
  id, name, phone, people_count, job, deal, property_type, neighborhood, consultant, note, source,
  acquisition_source, acquisition_medium, acquisition_campaign, acquisition_referrer, acquisition_landing_path,
  follow_up_at, budget_deposit, budget_rent, budget_rate, budget_equivalent, budget_bedrooms,
  matched_properties, match_count
) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,current_timestamp + interval '24 hours',$17,$18,$19,$20,$21,$22::jsonb,$23)
returning id`;
try {
  await q(LEAD_SQL, [crypto.randomUUID(), "کاربر نمونه", "09121112233", null, "", "خرید", "آپارتمان", "سعادت‌آباد", "", "یادداشت", "website", null, null, null, null, null, null, null, null, null, null, JSON.stringify([]), 0]);
  const id2 = crypto.randomUUID();
  await q(LEAD_SQL, [id2, "کاربر بودجه", "09121112244", null, "", "رهن", "", "", "", "note", "budget_match", null, null, null, null, null, 500000000, 2000000, 100000, 520000000, 2, JSON.stringify([{ slug: "x", title: "y" }]), 1]);
  check("EXP5 leads insert (website + budget_match, mixed null numerics)", true);
} catch (e) {
  check("EXP5 leads insert (website + budget_match, mixed null numerics)", false, e.message.split("\n")[0]);
}

// ---------- EXP 5b: rental/mortgage lease deadline ----------
try {
  const deadlineLeadId = crypto.randomUUID();
  await q(
    `insert into leads (
       id, name, phone, deal, property_type, neighborhood, consultant, note, source, lease_deadline
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date)
     returning id, deal, lease_deadline`,
    [deadlineLeadId, "کاربر مهلت", "09121112255", "اجاره", "آپارتمان", "سعادت‌آباد", "", "", "website", "2026-10-01"],
  );
  const deadlineRows = await q(
    "select deal, lease_deadline::text as lease_deadline from leads where id=$1",
    [deadlineLeadId],
  );
  check(
    "EXP5b lease deadline persists as a date for rental leads",
    deadlineRows.length === 1 &&
      deadlineRows[0].deal === "اجاره" &&
      deadlineRows[0].lease_deadline === "2026-10-01",
  );
  await q("delete from leads where id=$1", [deadlineLeadId]);
} catch (e) {
  check("EXP5b lease deadline persists as a date for rental leads", false, e.message.split("\n")[0]);
}

// ---------- EXP 5c: private property owner details ----------
try {
  const ownerPropertyId = crypto.randomUUID();
  const ownerRows = await q(
    `insert into properties (
       id, slug, status, title, transaction_type, property_type, neighborhood, description,
       contact_name, contact_phone, owner_name, owner_phone, owner_info
     ) values ($1,$2,'draft','فایل تست مالک','sell','apartment','سعادت‌آباد','توضیحات تستی مالک خصوصی',
       $3,$4,$5,$6,$7)
     returning owner_name, owner_phone, owner_info`,
    [ownerPropertyId,"owner-private-"+ownerPropertyId.slice(0,8),"مشاور تست","09130000000","مالک تست","09131112233","اطلاعات داخلی مالک"],
  );
  check(
    "EXP5c private owner fields persist on properties",
    ownerRows.length === 1 &&
      ownerRows[0].owner_name === "مالک تست" &&
      ownerRows[0].owner_phone === "09131112233" &&
      ownerRows[0].owner_info === "اطلاعات داخلی مالک",
  );
  await q("delete from properties where id=$1",[ownerPropertyId]);
} catch (e) {
  check("EXP5c private owner fields persist on properties",false,e.message.split("\n")[0]);
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
