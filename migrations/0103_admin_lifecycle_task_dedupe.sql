-- Concurrent lifecycle-task creation can race after both requests observe no open task.
-- Keep the newest auto-generated task for each property before enforcing uniqueness.
delete from admin_tasks older
using admin_tasks newer
where older.entity_type = 'property'
  and newer.entity_type = 'property'
  and older.status = 'open'
  and newer.status = 'open'
  and older.title like 'تازه‌سازی فایل:%'
  and newer.title like 'تازه‌سازی فایل:%'
  and older.entity_id is not null
  and older.entity_id = newer.entity_id
  and (older.created_at, older.id) < (newer.created_at, newer.id);

create unique index if not exists admin_tasks_one_open_property_refresh_idx
  on admin_tasks (entity_type, entity_id)
  where status = 'open'
    and entity_type = 'property'
    and title like 'تازه‌سازی فایل:%';
