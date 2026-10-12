import { getSql, dbSource } from "@/lib/db";
import { isValidTrackingCode, normalizeTrackingCode } from "./partner-codes";
import {
  generatePartnerCode,
  generatePartnerPin,
  generateTrackingCode,
  hashPartnerPin,
  normalizePartnerCode,
  normalizeDigits,
  normalizePhone,
  verifyPartnerPin,
} from "@/lib/partner-session.server";

export type PartnerStatus = "active" | "suspended";
export type PartnerContractStatus = "pending" | "approved" | "rejected";
export type PartnerTransaction = "buy" | "sell" | "rent" | "mortgage";

export const PARTNER_TX_LABEL: Record<PartnerTransaction, string> = {
  buy: "درخواست خرید",
  sell: "فروش",
  rent: "اجاره",
  mortgage: "رهن",
};

export const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = {
  active: "فعال",
  suspended: "غیرفعال",
};

export const PARTNER_CONTRACT_STATUS_LABEL: Record<PartnerContractStatus, string> = {
  pending: "در انتظار تأیید",
  approved: "تأییدشده",
  rejected: "ردشده",
};

export type PartnerSummary = {
  id: string;
  partnerCode: string;
  agencyName: string;
  contactName: string;
  phone: string;
  status: PartnerStatus;
  cardNumber: number;
  cardStamps: number;
  contractCount: number;
  availableRewards: number;
  claimedRewards: number;
  pendingContracts: number;
  createdAt: string;
  lastLoginAt: string | null;
};

export type PartnerContract = {
  id: string;
  trackingCode: string;
  contractReference: string;
  clientName: string;
  transactionType: PartnerTransaction;
  status: PartnerContractStatus;
  note: string;
  decisionNote: string;
  createdAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  agencyName?: string;
};

export type PartnerOverview = PartnerSummary & {
  rewardsEarned: number;
  nextRewardIn: number;
  cardComplete: boolean;
  contracts: PartnerContract[];
};

function iso(value: unknown) {
  return value ? new Date(String(value)).toISOString() : null;
}

function mapSummary(row: Record<string, unknown>): PartnerSummary {
  return {
    id: String(row.id),
    partnerCode: String(row.partner_code),
    agencyName: String(row.agency_name),
    contactName: String(row.contact_name),
    phone: String(row.phone),
    status: String(row.status) as PartnerStatus,
    cardNumber: Number(row.card_number) || 1,
    cardStamps: Math.min(12, Math.max(0, Number(row.card_stamps) || 0)),
    contractCount: Number(row.contract_count) || 0,
    availableRewards: Number(row.available_rewards) || 0,
    claimedRewards: Number(row.claimed_rewards) || 0,
    pendingContracts: Number(row.pending_contracts) || 0,
    createdAt: new Date(String(row.created_at)).toISOString(),
    lastLoginAt: iso(row.last_login_at),
  };
}

function mapContract(row: Record<string, unknown>): PartnerContract {
  return {
    id: String(row.id),
    trackingCode: String(row.tracking_code),
    contractReference: String(row.contract_reference ?? ""),
    clientName: String(row.client_name ?? ""),
    transactionType: String(row.transaction_type) as PartnerTransaction,
    status: String(row.status) as PartnerContractStatus,
    note: String(row.note ?? ""),
    decisionNote: String(row.decision_note ?? ""),
    createdAt: new Date(String(row.created_at)).toISOString(),
    approvedAt: iso(row.approved_at),
    rejectedAt: iso(row.rejected_at),
    ...(row.agency_name ? { agencyName: String(row.agency_name) } : {}),
  };
}

async function ensureConfigured() {
  if (dbSource === "unconfigured") {
    throw new Error("DATABASE_URL تنظیم نشده است.");
  }
  return getSql();
}

export async function recordPartnerAudit(input: {
  partnerId: string;
  action: string;
  targetId?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}) {
  if (dbSource === "unconfigured") return;
  const sql = await getSql();
  try {
    await sql.query(
      `
        insert into partner_audit_logs
          (id, partner_id, action, actor, target_id, note, metadata)
        values ($1, $2, $3, 'admin', $4, $5, $6::jsonb)
      `,
      [
        crypto.randomUUID(),
        input.partnerId,
        input.action.slice(0, 80),
        input.targetId ?? null,
        (input.note ?? "").trim().slice(0, 500),
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  } catch (error) {
    // Audit logging must never turn a completed business operation into an error.
    console.error("[partner-audit] write failed", error);
  }
}

export async function listPartnerAuditLogs(partnerId: string) {
  const sql = await ensureConfigured();
  const rows = await sql.query<Record<string, unknown>>(
    `
      select id, action, actor, target_id, note, metadata, created_at
      from partner_audit_logs
      where partner_id = $1
      order by created_at desc
      limit 80
    `,
    [partnerId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    action: String(row.action),
    actor: String(row.actor),
    targetId: row.target_id ? String(row.target_id) : null,
    note: String(row.note ?? ""),
    metadata: (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>,
    createdAt: new Date(String(row.created_at)).toISOString(),
  }));
}

export async function getPartnerSummary(partnerId: string) {
  const sql = await ensureConfigured();
  const rows = await sql.query<Record<string, unknown>>(
    `
      select
        a.*,
        (select count(*)::int from partner_rewards r where r.partner_id = a.id and r.status = 'available') as available_rewards,
        (select count(*)::int from partner_rewards r where r.partner_id = a.id and r.status = 'claimed') as claimed_rewards,
        (select count(*)::int from partner_contracts c where c.partner_id = a.id and c.status = 'pending') as pending_contracts
      from partner_accounts a
      where a.id = $1
      limit 1
    `,
    [partnerId],
  );
  return rows[0] ? mapSummary(rows[0]) : null;
}

export async function getPartnerOverview(partnerId: string) {
  const summary = await getPartnerSummary(partnerId);
  if (!summary) return null;
  const sql = await ensureConfigured();

  const rows = await sql.query<Record<string, unknown>>(
    `
      select id, tracking_code, contract_reference, client_name, transaction_type,
             status, note, decision_note, created_at, approved_at, rejected_at
      from partner_contracts
      where partner_id = $1
      order by created_at desc
      limit 30
    `,
    [partnerId],
  );

  return {
    ...summary,
    rewardsEarned: summary.availableRewards + summary.claimedRewards,
    nextRewardIn: summary.contractCount % 3 === 0 ? 0 : 3 - (summary.contractCount % 3),
    cardComplete: summary.cardStamps >= 12,
    contracts: rows.map(mapContract),
  } satisfies PartnerOverview;
}

export async function touchPartnerLogin(partnerId: string) {
  if (dbSource === "unconfigured") return;
  const sql = await getSql();
  await sql.query(
    `update partner_accounts set last_login_at = current_timestamp, updated_at = current_timestamp where id = $1`,
    [partnerId],
  );
}

export async function authenticatePartner(partnerCode: string, pin: string) {
  const sql = await ensureConfigured();
  const code = normalizePartnerCode(partnerCode);
  const rows = await sql.query<Record<string, unknown>>(
    `
      select id, pin_hash, pin_salt, status, failed_login_count, locked_until
      from partner_accounts
      where partner_code = $1
      limit 1
    `,
    [code],
  );
  const row = rows[0];
  if (!row || String(row.status) !== "active") return null;

  const lockedUntil = row.locked_until ? new Date(String(row.locked_until)).getTime() : 0;
  if (lockedUntil && lockedUntil > Date.now()) return null;

  const valid = verifyPartnerPin(
    normalizeDigits(pin),
    String(row.pin_hash),
    String(row.pin_salt),
  );

  if (!valid) {
    // Let PostgreSQL serialize concurrent failures. A read/increment/write in
    // application code let parallel requests overwrite each other and bypass
    // the five-attempt lock.
    await sql.query(
      `
        update partner_accounts
        set failed_login_count = failed_login_count + 1,
            locked_until = case
              when failed_login_count + 1 >= 5 then current_timestamp + interval '15 minutes'
              else null
            end,
            updated_at = current_timestamp
        where id = $1
      `,
      [String(row.id)],
    );
    return null;
  }

  await sql.query(
    `
      update partner_accounts
      set failed_login_count = 0,
          locked_until = null,
          last_login_at = current_timestamp,
          updated_at = current_timestamp
      where id = $1
    `,
    [String(row.id)],
  );

  return String(row.id);
}

export async function createPartnerAccount(input: {
  agencyName: string;
  contactName: string;
  phone: string;
}) {
  const sql = await ensureConfigured();
  const agencyName = input.agencyName.trim().slice(0, 120);
  const contactName = input.contactName.trim().slice(0, 100);
  const phone = normalizePhone(input.phone);

  if (!agencyName || !contactName || phone.length < 7) {
    throw new Error("نام املاک، نام مسئول و شماره تماس را کامل کنید.");
  }

  let code = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = generatePartnerCode();
    const exists = await sql.query<{ id: string }>(
      `select id from partner_accounts where partner_code = $1 limit 1`,
      [candidate],
    );
    if (!exists[0]) {
      code = candidate;
      break;
    }
  }
  if (!code) throw new Error("ساخت کد همکاری انجام نشد.");

  const pin = generatePartnerPin();
  const { hash, salt } = hashPartnerPin(pin);
  const id = crypto.randomUUID();

  await sql.query(
    `
      insert into partner_accounts
        (id, partner_code, agency_name, contact_name, phone, pin_hash, pin_salt)
      values ($1, $2, $3, $4, $5, $6, $7)
    `,
    [id, code, agencyName, contactName, phone, hash, salt],
  );

  const summary = await getPartnerSummary(id);
  if (!summary) throw new Error("حساب همکار ایجاد نشد.");
  await recordPartnerAudit({
    partnerId: id,
    action: "account_created",
    note: "حساب همکاری ایجاد شد.",
    metadata: { agencyName, contactName, phone },
  });
  return { summary, partnerCode: code, pin };
}

export async function listAdminPartners() {
  const sql = await ensureConfigured();
  const rows = await sql.query<Record<string, unknown>>(
    `
      select
        a.*,
        (select count(*)::int from partner_rewards r where r.partner_id = a.id and r.status = 'available') as available_rewards,
        (select count(*)::int from partner_rewards r where r.partner_id = a.id and r.status = 'claimed') as claimed_rewards,
        (select count(*)::int from partner_contracts c where c.partner_id = a.id and c.status = 'pending') as pending_contracts
      from partner_accounts a
      order by
        case when a.status = 'active' then 0 else 1 end,
        a.created_at desc
    `,
  );
  return rows.map(mapSummary);
}

export async function listPendingPartnerContracts() {
  const sql = await ensureConfigured();
  const rows = await sql.query<Record<string, unknown>>(
    `
      select
        c.id, c.tracking_code, c.contract_reference, c.client_name, c.transaction_type,
        c.status, c.note, c.decision_note, c.created_at, c.approved_at, c.rejected_at,
        a.agency_name
      from partner_contracts c
      join partner_accounts a on a.id = c.partner_id
      where c.status = 'pending'
      order by c.created_at asc
      limit 100
    `,
  );
  return rows.map(mapContract);
}

export async function listPartnerContractsForAdmin(partnerId: string) {
  const sql = await ensureConfigured();
  const rows = await sql.query<Record<string, unknown>>(
    `
      select id, tracking_code, contract_reference, client_name, transaction_type,
             status, note, decision_note, created_at, approved_at, rejected_at
      from partner_contracts
      where partner_id = $1
      order by created_at desc
      limit 100
    `,
    [partnerId],
  );
  return rows.map(mapContract);
}

export async function submitPartnerContract(input: {
  partnerId: string;
  contractReference?: string;
  clientName?: string;
  transactionType: PartnerTransaction;
  note?: string;
}) {
  const sql = await ensureConfigured();
  const reference = normalizeDigits(input.contractReference ?? "").trim().slice(0, 80);
  const clientName = (input.clientName ?? "").trim().slice(0, 120);
  const note = (input.note ?? "").trim().slice(0, 500);
  if (!["buy", "sell", "rent", "mortgage"].includes(input.transactionType)) {
    throw new Error("نوع قرارداد نامعتبر است.");
  }

  const partner = await getPartnerSummary(input.partnerId);
  if (!partner || partner.status !== "active") throw new Error("حساب همکاری فعال نیست.");
  if (partner.cardStamps >= 12) {
    throw new Error("کارت ۱۲ مهره شده است. برای ادامه، مدیر هیرمند باید کارت جدید صادر کند.");
  }

  const id = crypto.randomUUID();
  let trackingCode = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = generateTrackingCode();
    const exists = await sql.query<{ id: string }>(
      `select id from partner_contracts where tracking_code = $1 limit 1`,
      [candidate],
    );
    if (!exists[0]) {
      trackingCode = candidate;
      break;
    }
  }
  if (!trackingCode) throw new Error("ساخت کد رهگیری انجام نشد.");

  try {
    await sql.query(
      `
        insert into partner_contracts
          (id, partner_id, tracking_code, contract_reference, client_name, transaction_type, note)
        values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [id, input.partnerId, trackingCode, reference, clientName, input.transactionType, note],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.toLowerCase().includes("partner_contracts_reference_unique_idx") || message.toLowerCase().includes("duplicate key")) {
      throw new Error("این شماره/شناسه قرارداد قبلاً برای این املاک ثبت شده است.");
    }
    throw error;
  }

  const rows = await sql.query<Record<string, unknown>>(
    `select id, tracking_code, contract_reference, client_name, transaction_type, status, note, decision_note, created_at, approved_at, rejected_at from partner_contracts where id = $1 limit 1`,
    [id],
  );
  return rows[0] ? mapContract(rows[0]) : null;
}

export async function lookupPartnerContract(trackingCode: string) {
  const sql = await ensureConfigured();
  const code = normalizeTrackingCode(trackingCode);
  if (!isValidTrackingCode(code)) return null;
  const rows = await sql.query<Record<string, unknown>>(
    `
      select c.tracking_code, c.transaction_type, c.status, c.created_at, c.approved_at,
             a.agency_name
      from partner_contracts c
      join partner_accounts a on a.id = c.partner_id
      where c.tracking_code = $1
      limit 1
    `,
    [code],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    trackingCode: String(row.tracking_code),
    transactionType: String(row.transaction_type) as PartnerTransaction,
    status: String(row.status) as PartnerContractStatus,
    statusLabel: PARTNER_CONTRACT_STATUS_LABEL[String(row.status) as PartnerContractStatus] ?? String(row.status),
    transactionLabel: PARTNER_TX_LABEL[String(row.transaction_type) as PartnerTransaction] ?? String(row.transaction_type),
    agencyName: String(row.agency_name),
    createdAt: new Date(String(row.created_at)).toISOString(),
    approvedAt: iso(row.approved_at),
  };
}

export async function approvePartnerContract(contractId: string) {
  const sql = await ensureConfigured();
  const rows = await sql.query<Record<string, unknown>>(
    `
      with target as (
        select id, partner_id
        from partner_contracts
        where id = $1 and status = 'pending'
        limit 1
      ),
      acct as (
        update partner_accounts a
        set
          card_stamps = a.card_stamps + 1,
          contract_count = a.contract_count + 1,
          updated_at = current_timestamp
        where a.id = (select partner_id from target)
          and a.status = 'active'
          and a.card_stamps < 12
        returning a.id, a.contract_count
      ),
      contract as (
        update partner_contracts c
        set
          status = 'approved',
          approved_at = current_timestamp,
          decision_note = '',
          updated_at = current_timestamp
        where c.id = (select id from target)
          and exists (select 1 from acct)
        returning c.id, c.partner_id
      ),
      reward as (
        insert into partner_rewards (id, partner_id, reward_number, status, source_contract_id)
        select
          md5((select partner_id from contract) || ':' || (select contract_count::text from acct)),
          (select partner_id from contract),
          floor((select contract_count from acct)::numeric / 3)::int,
          'available',
          (select id from contract)
        where exists (select 1 from contract)
          and mod((select contract_count from acct), 3) = 0
        on conflict (partner_id, reward_number) do nothing
        returning id
      )
      select
        (select id from contract) as contract_id,
        (select partner_id from contract) as partner_id,
        (select contract_count from acct) as contract_count,
        (select card_stamps from partner_accounts where id = (select partner_id from contract)) as card_stamps
    `,
    [contractId],
  );

  const result = rows[0];
  if (!result?.contract_id) {
    const state = await sql.query<Record<string, unknown>>(
      `
        select c.status, a.status as partner_status, a.card_stamps
        from partner_contracts c
        join partner_accounts a on a.id = c.partner_id
        where c.id = $1
        limit 1
      `,
      [contractId],
    );
    const row = state[0];
    if (!row) throw new Error("قرارداد پیدا نشد.");
    if (String(row.status) !== "pending") throw new Error("این قرارداد قبلاً تعیین تکلیف شده است.");
    if (String(row.partner_status) !== "active") throw new Error("حساب همکار فعال نیست.");
    if (Number(row.card_stamps) >= 12) throw new Error("کارت فعلی ۱۲ مهر دارد؛ ابتدا کارت جدید صادر کنید.");
    throw new Error("تأیید قرارداد انجام نشد.");
  }

  await recordPartnerAudit({
    partnerId: String(result.partner_id),
    action: "contract_approved",
    targetId: String(result.contract_id),
    metadata: {
      contractCount: Number(result.contract_count) || 0,
      cardStamps: Number(result.card_stamps) || 0,
    },
  });
  const overview = await getPartnerOverview(String(result.partner_id));
  return {
    contractId: String(result.contract_id),
    contractCount: Number(result.contract_count) || 0,
    cardStamps: Number(result.card_stamps) || 0,
    partner: overview,
  };
}

export async function rejectPartnerContract(contractId: string, note: string) {
  const sql = await ensureConfigured();
  const result = await sql.query<Record<string, unknown>>(
    `
      update partner_contracts
      set status = 'rejected',
          rejected_at = current_timestamp,
          decision_note = $2,
          updated_at = current_timestamp
      where id = $1 and status = 'pending'
      returning id
    `,
    [contractId, note.trim().slice(0, 500)],
  );
  if (!result[0]) throw new Error("قرارداد پیدا نشد یا قبلاً تعیین تکلیف شده است.");
  const contractRows = await sql.query<{ partner_id: string }>(
    `select partner_id from partner_contracts where id = $1 limit 1`,
    [contractId],
  );
  if (contractRows[0]) {
    await recordPartnerAudit({
      partnerId: String(contractRows[0].partner_id),
      action: "contract_rejected",
      targetId: contractId,
      note,
    });
  }
  return true;
}

export async function issueNewPartnerCard(partnerId: string) {
  const sql = await ensureConfigured();
  const rows = await sql.query<Record<string, unknown>>(
    `
      update partner_accounts
      set card_number = card_number + 1,
          card_stamps = 0,
          updated_at = current_timestamp
      where id = $1 and status = 'active' and card_stamps >= 12
      returning card_number, card_stamps
    `,
    [partnerId],
  );
  if (!rows[0]) throw new Error("کارت فعلی هنوز ۱۲ مهر نشده یا حساب فعال نیست.");
  await recordPartnerAudit({
    partnerId,
    action: "card_issued",
    metadata: { cardNumber: Number(rows[0].card_number) || 1 },
  });
  return getPartnerOverview(partnerId);
}

export async function claimPartnerReward(partnerId: string, note: string) {
  const sql = await ensureConfigured();
  const rows = await sql.query<Record<string, unknown>>(
    `
      update partner_rewards
      set status = 'claimed',
          claimed_at = current_timestamp,
          claim_note = $2
      where id = (
        select id from partner_rewards
        where partner_id = $1 and status = 'available'
        order by created_at asc
        limit 1
      )
      returning id, reward_number, claimed_at
    `,
    [partnerId, note.trim().slice(0, 500)],
  );
  if (!rows[0]) throw new Error("پاداش آماده‌ای برای مصرف وجود ندارد.");
  await recordPartnerAudit({
    partnerId,
    action: "reward_claimed",
    targetId: String(rows[0].id),
    note,
    metadata: { rewardNumber: Number(rows[0].reward_number) || 0 },
  });
  return getPartnerOverview(partnerId);
}

export async function updatePartnerStatus(partnerId: string, status: PartnerStatus) {
  const sql = await ensureConfigured();
  if (!["active", "suspended"].includes(status)) throw new Error("وضعیت همکار نامعتبر است.");
  const rows = await sql.query<Record<string, unknown>>(
    `update partner_accounts set status = $2, updated_at = current_timestamp where id = $1 returning id`,
    [partnerId, status],
  );
  if (!rows[0]) throw new Error("حساب همکار پیدا نشد.");
  await recordPartnerAudit({
    partnerId,
    action: status === "active" ? "account_activated" : "account_suspended",
  });
  return getPartnerOverview(partnerId);
}
