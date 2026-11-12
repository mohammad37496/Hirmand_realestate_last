import type { Sql } from "./db.ts";

/**
 * Serialize public lead submissions for one normalized phone number. The
 * callback and any nested helper transactions share the same DB transaction,
 * so its dedupe read and lead/CRM writes cannot race another request.
 */
export async function withPublicLeadPhoneDedupeLock<T>(
  sql: Sql,
  phone: string,
  callback: (transactionSql: Sql) => Promise<T>,
): Promise<T> {
  if (typeof sql.transaction !== "function") {
    throw new Error("Database transaction support is required for public lead deduplication.");
  }

  return sql.transaction(async (transactionSql) => {
    await transactionSql.query(
      "select pg_advisory_xact_lock(hashtextextended($1, 0))",
      ["public-lead-phone:" + phone.trim()],
    );

    const scopedSql = (async <R = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<R[]> => {
      let text = strings[0];
      for (let index = 0; index < values.length; index += 1) {
        text += "$" + String(index + 1) + strings[index + 1];
      }
      return transactionSql.query<R>(text, values);
    }) as unknown as Sql;

    scopedSql.query = <R = Record<string, unknown>>(
      text: string,
      params: unknown[] = [],
    ) => transactionSql.query<R>(text, params);
    scopedSql.transaction = async <R>(nestedCallback: (nestedSql: Sql) => Promise<R>) =>
      nestedCallback(scopedSql);

    return callback(scopedSql);
  });
}

export async function findRecentPublicCallbackLead(
  sql: Sql,
  phone: string,
  callbackAt: Date,
): Promise<{ id: string; public_tracking_token: string | null } | null> {
  const rows = await sql.query<{ id: string; public_tracking_token: string | null }>(
    "select id, public_tracking_token from leads where phone=$1 and callback_preferred_at=$2::timestamptz and created_at > clock_timestamp() - interval '10 minutes' order by created_at desc limit 1",
    [phone, callbackAt.toISOString()],
  );
  return rows[0] ?? null;
}
