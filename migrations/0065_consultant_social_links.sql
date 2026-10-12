alter table consultants
  add column if not exists rubika text not null default '',
  add column if not exists bale text not null default '',
  add column if not exists igap text not null default '',
  add column if not exists soroush text not null default '';
