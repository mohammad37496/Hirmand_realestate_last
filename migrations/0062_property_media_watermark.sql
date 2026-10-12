-- Persisted Hirmand property-media watermark configuration.
create table if not exists property_media_watermark_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  show_logo boolean not null default true,
  show_text boolean not null default true,
  text text not null default 'املاک هیرمند',
  opacity numeric(4,3) not null default 0.82 check (opacity >= 0.20 and opacity <= 1.00),
  size numeric(4,3) not null default 1.00 check (size >= 0.60 and size <= 1.60),
  updated_at timestamptz not null default current_timestamp
);

insert into property_media_watermark_settings (id)
values (1)
on conflict (id) do nothing;
