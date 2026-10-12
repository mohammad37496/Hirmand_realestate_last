-- Hot-path indexes for public property reads.
-- The normal detail route already has a unique slug index and primary-key id
-- index; these extra partial indexes specifically accelerate the legacy 8-hex
-- URL fragments still accepted by the public resolver.
create index if not exists properties_published_id_left_fragment_idx
  on properties ((lower(left(id::text, 8))))
  where status = 'published';

create index if not exists properties_published_id_right_fragment_idx
  on properties ((lower(right(id::text, 8))))
  where status = 'published';

-- Favor the common "newest" public feed path without indexing drafts.
create index if not exists properties_published_newest_idx
  on properties (published_at desc nulls last, created_at desc)
  where status = 'published';

analyze properties;
