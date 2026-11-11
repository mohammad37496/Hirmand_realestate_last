import type { Sql } from "./db";

type OverdueLead = {
  id: string;
  name: string | null;
  deal: string | null;
  neighborhood: string | null;
};

export async function createOverdueLeadTasks(sql: Sql): Promise<number> {
  if (typeof sql.transaction !== "function") {
    throw new Error("Database transaction support is required to create overdue lead tasks.");
  }

  return sql.transaction(async (transactionSql) => {
    const overdue = await transactionSql.query<OverdueLead>(
      `select id, name, deal, neighborhood
       from leads
       where status not in ('closed','spam')
         and follow_up_at is not null
         and follow_up_at <= current_timestamp
       order by id asc
       limit 500`,
    );
    let created = 0;

    for (const row of overdue) {
      const entityId = String(row.id);
      await transactionSql.query(
        "select pg_advisory_xact_lock(hashtext($1))",
        [`admin-overdue-lead-task:${entityId}`],
      );
      const exists = await transactionSql.query<{ id: string }>(
        "select id from admin_tasks where entity_type='lead' and entity_id=$1 and status='open' limit 1",
        [entityId],
      );
      if (exists.length) continue;

      const inserted = await transactionSql.query<{ id: string }>(
        `insert into admin_tasks
          (id,title,description,status,priority,due_at,assignee,entity_type,entity_id)
         values($1,$2,$3,'open','high',current_timestamp,'تیم هیرمند','lead',$4)
         returning id`,
        [
          crypto.randomUUID(),
          "پیگیری فوری لید: " + String(row.name || "مشتری"),
          "لید " + String(row.deal || "درخواست ملکی") + (row.neighborhood ? " · " + String(row.neighborhood) : "") + " از موعد پیگیری عبور کرده است.",
          entityId,
        ],
      );
      if (inserted.length) created += 1;
    }

    return created;
  });
}
