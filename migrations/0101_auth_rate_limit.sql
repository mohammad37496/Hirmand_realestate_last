-- Persistent Better Auth rate-limit counters for password recovery.
-- Column names/types match Better Auth 1.6.x's built-in `rateLimit` model.
create table if not exists "rateLimit" (
  "id" text not null primary key,
  "key" text not null unique,
  "count" integer not null,
  -- Store millisecond epoch values as float8 so node-postgres returns a number
  -- (rather than an int8 string) to Better Auth's rate-limit arithmetic.
  "lastRequest" double precision not null
);

create index if not exists "rateLimit_lastRequest_idx"
  on "rateLimit" ("lastRequest");
