-- Identify automated overdue-follow-up tasks separately from other lead tasks.
alter table admin_tasks add column if not exists dedupe_key text;

-- Tag legacy auto-generated tasks. The prefix is UTF-8 hex to keep this migration
-- independent of the client shell's source-file encoding.
update admin_tasks
set dedupe_key = 'overdue_follow_up'
where entity_type = 'lead'
  and status = 'open'
  and title like convert_from(decode('d9bedb8cdaafdb8cd8b1db8c20d981d988d8b1db8c20d984db8cd8af3a', 'hex'), 'UTF8') || '%';

-- Preserve history while cancelling older duplicates before enforcing uniqueness.
update admin_tasks older
set status = 'cancelled', updated_at = current_timestamp
from admin_tasks newer
where older.entity_type = 'lead'
  and newer.entity_type = 'lead'
  and older.status = 'open'
  and newer.status = 'open'
  and older.dedupe_key = 'overdue_follow_up'
  and newer.dedupe_key = 'overdue_follow_up'
  and older.entity_id is not null
  and older.entity_id = newer.entity_id
  and (older.created_at, older.id) < (newer.created_at, newer.id);

create unique index if not exists admin_tasks_one_open_lead_overdue_followup_idx
  on admin_tasks (entity_type, entity_id, dedupe_key)
  where status = 'open'
    and dedupe_key = 'overdue_follow_up';
