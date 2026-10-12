-- Track the real-world availability state separately from publication state.
alter table properties
  add column if not exists availability_status text not null default 'available';

update properties
set availability_status = 'available'
where availability_status is null or availability_status = '';

alter table properties
  drop constraint if exists properties_availability_status_check;

alter table properties
  add constraint properties_availability_status_check
  check (availability_status in ('available','reserved','sold','rented','unavailable'));

create index if not exists properties_availability_status_idx
  on properties (availability_status, status, published_at desc nulls last);
