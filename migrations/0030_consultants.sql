create table if not exists consultants (
  id text primary key,
  name text not null,
  role text not null default 'مشاور املاک',
  phone text not null,
  phone_display text not null,
  icon text not null default 'handshake',
  bio text not null default '',
  whatsapp text not null default '',
  telegram text not null default '',
  eitaa text not null default '',
  instagram text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consultants_active_sort_idx
  on consultants (is_active, sort_order, name);

insert into consultants (
  id, name, role, phone, phone_display, icon, bio, whatsapp, telegram, eitaa, instagram, sort_order, is_active
)
values
  (
    'sheikh',
    'آقای شیخ',
    'مدیر',
    '09131056029',
    '0913 105 6029',
    'briefcase',
    'مدیریت و مشاوره مستقیم در مسیر خرید، فروش، رهن و اجاره ملک در اصفهان.',
    'https://wa.me/989131056029',
    'https://t.me/Hirmand_realestate',
    'https://eitaa.com/Hirmand_realestate',
    'https://ig.me/m/hirmand.realestate',
    10,
    true
  ),
  (
    'moradi',
    'آقای مرادی',
    'مشاور ارشد',
    '09183576883',
    '0918 357 6883',
    'handshake',
    'مشاوره تخصصی و پیگیری فایل‌ها و درخواست‌های ملکی هیرمند.',
    'https://wa.me/989183576883',
    'https://t.me/Hirmand_realestate',
    'https://eitaa.com/Hirmand_realestate',
    'https://ig.me/m/hirmand.realestate',
    20,
    true
  )
on conflict (id) do update set
  name = excluded.name,
  role = excluded.role,
  phone = excluded.phone,
  phone_display = excluded.phone_display,
  icon = excluded.icon,
  bio = excluded.bio,
  whatsapp = excluded.whatsapp,
  telegram = excluded.telegram,
  eitaa = excluded.eitaa,
  instagram = excluded.instagram,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = current_timestamp;
