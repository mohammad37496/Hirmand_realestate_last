-- Publicly editable Hirmand site settings.
create table if not exists site_settings (
  id smallint primary key default 1 check (id = 1),
  site_title text not null default 'املاک هیرمند | خرید، فروش، رهن و اجاره ملک در اصفهان',
  site_description text not null default 'گروه مشاورین املاک هیرمند؛ فایل‌های خرید، فروش، رهن و اجاره ملک در اصفهان با مشاوره تخصصی.',
  seo_keywords text not null default 'املاک اصفهان, املاک هیرمند, خرید خانه اصفهان, فروش آپارتمان اصفهان, رهن و اجاره اصفهان',
  google_site_verification text not null default '',
  noindex boolean not null default false,
  announcement_enabled boolean not null default false,
  announcement_text text not null default '',
  phone_mobile text not null default '09131056029',
  phone_office text not null default '03137850615',
  whatsapp_url text not null default 'https://wa.me/989131056029',
  instagram_url text not null default 'https://www.instagram.com/hirmand.realestate/',
  telegram_url text not null default 'https://t.me/Hirmand_realestate',
  eitaa_url text not null default 'https://eitaa.com/Hirmand_realestate',
  address text not null default 'اصفهان، سه راه سیمین، خیابان جانبازان، بلوار شهید بخشی',
  office_hours text not null default 'پاسخگویی با هماهنگی قبلی',
  footer_tagline text not null default 'همراه شما برای انتخاب خانه‌ای بهتر',
  updated_at timestamptz not null default current_timestamp
);

insert into site_settings (id)
values (1)
on conflict (id) do nothing;
