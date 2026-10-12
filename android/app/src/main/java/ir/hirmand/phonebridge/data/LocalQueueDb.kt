package ir.hirmand.phonebridge.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteFullException
import android.database.sqlite.SQLiteOpenHelper
import java.security.MessageDigest

/**
 * Durable outbound queue for sync packets.
 *
 * The original design was read-then-send: [peek] returned rows and the caller
 * deleted them after a successful upload. That is not safe here, because
 * `SyncScheduler` registers the *same* worker under two different unique work
 * names ("manual-sync" and "periodic-sync"), so a user-triggered sync and the
 * periodic sync really can run at the same time. Two workers would read the same
 * rows and both upload them, producing duplicate packets the server would then
 * have to deduplicate — or would accept, for location and files.
 *
 * The queue is therefore claim-based:
 *
 *   queued ──claim──> processing ──complete──> (deleted)
 *                         │
 *                         ├──fail─────────> queued (exponential backoff)
 *                         └──attempts>max──> dead_letters
 *
 * [claim] flips rows inside a single transaction with a `WHERE state = 'queued'`
 * guard, so of two racing claimers only the transaction that actually changed a
 * row gets it back. A worker that dies mid-upload does not strand the packet: the
 * lease expires and the next claim picks it up again.
 */
class LocalQueueDb(context: Context) : SQLiteOpenHelper(context, "phone_bridge_queue.db", null, 3) {

    data class QueueItem(
        val id: Long,
        val payload: String,
        val attempts: Int,
        val module: String,
        val priority: Int,
    )

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE queue (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                "payload TEXT NOT NULL, " +
                "created_at INTEGER NOT NULL, " +
                "attempts INTEGER NOT NULL DEFAULT 0, " +
                "next_attempt_at INTEGER NOT NULL DEFAULT 0, " +
                "last_error TEXT, " +
                "state TEXT NOT NULL DEFAULT 'queued', " +
                "claimed_at INTEGER, " +
                "lease_expires_at INTEGER, " +
                "priority INTEGER NOT NULL DEFAULT 100, " +
                "module TEXT NOT NULL DEFAULT 'snapshot', " +
                "checksum TEXT NOT NULL DEFAULT ''" +
                ")"
        )
        createIndexes(db)
        createDeadLetterTable(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // v1 -> v2 added retry bookkeeping.
        if (oldVersion < 2) {
            if (!hasColumn(db, "queue", "attempts")) db.execSQL("ALTER TABLE queue ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0")
            if (!hasColumn(db, "queue", "next_attempt_at")) db.execSQL("ALTER TABLE queue ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0")
            if (!hasColumn(db, "queue", "last_error")) db.execSQL("ALTER TABLE queue ADD COLUMN last_error TEXT")
            createIndexes(db)
            createDeadLetterTable(db)
        }
        // v2 -> v3 added claim/lease plus module, priority and checksum.
        if (oldVersion < 3) {
            if (!hasColumn(db, "queue", "state")) db.execSQL("ALTER TABLE queue ADD COLUMN state TEXT NOT NULL DEFAULT 'queued'")
            if (!hasColumn(db, "queue", "claimed_at")) db.execSQL("ALTER TABLE queue ADD COLUMN claimed_at INTEGER")
            if (!hasColumn(db, "queue", "lease_expires_at")) db.execSQL("ALTER TABLE queue ADD COLUMN lease_expires_at INTEGER")
            if (!hasColumn(db, "queue", "priority")) db.execSQL("ALTER TABLE queue ADD COLUMN priority INTEGER NOT NULL DEFAULT 100")
            if (!hasColumn(db, "queue", "module")) db.execSQL("ALTER TABLE queue ADD COLUMN module TEXT NOT NULL DEFAULT 'snapshot'")
            if (!hasColumn(db, "queue", "checksum")) db.execSQL("ALTER TABLE queue ADD COLUMN checksum TEXT NOT NULL DEFAULT ''")
            // Any packet left mid-flight by the upgrade is re-queued rather than
            // stranded in a 'processing' state nobody will ever look at.
            db.execSQL("UPDATE queue SET state = 'queued', lease_expires_at = NULL WHERE state = 'processing'")
            createIndexes(db)
        }
    }

    private fun hasColumn(db: SQLiteDatabase, table: String, column: String): Boolean =
        db.rawQuery("PRAGMA table_info($table)", null).use { c ->
            val nameIndex = c.getColumnIndexOrThrow("name")
            while (c.moveToNext()) {
                if (c.getString(nameIndex) == column) return true
            }
            false
        }

    /**
     * Adds a packet to the queue.
     *
     * [dedupeKey] makes enqueueing idempotent for content that identifies itself
     * (a snapshot hash, a location clientPointId). A retry after a dropped
     * connection then reuses the row instead of creating a second one.
     */
    @JvmOverloads
    fun enqueue(
        payload: String,
        module: String = "snapshot",
        priority: Int = 100,
        dedupeKey: String = "",
    ): Long {
        val checksum = if (dedupeKey.isBlank()) "" else sha256(dedupeKey)
        if (checksum.isNotEmpty()) {
            val existing = readableDatabase.rawQuery(
                "SELECT id FROM queue WHERE checksum = ? AND state != 'dead' LIMIT 1",
                arrayOf(checksum),
            ).use { if (it.moveToFirst()) it.getLong(0) else -1L }
            if (existing != -1L) return existing
        }

        return try {
            writableDatabase.insert(
                "queue",
                null,
                ContentValues().apply {
                    put("payload", payload)
                    put("created_at", System.currentTimeMillis())
                    put("attempts", 0)
                    put("next_attempt_at", 0)
                    put("state", "queued")
                    put("priority", priority.coerceIn(0, 1000))
                    put("module", module.take(40))
                    put("checksum", checksum)
                },
            )
        } catch (_: SQLiteFullException) {
            // Storage exhaustion must not take the sync worker down; the packet is
            // simply dropped and the next run will try again.
            -1L
        }
    }

    /**
     * Atomically takes ownership of up to [limit] ready packets.
     *
     * Returns only the rows this caller actually flipped, so two concurrent
     * claimers never receive the same packet.
     */
    @JvmOverloads
    fun claim(
        limit: Int = 20,
        now: Long = System.currentTimeMillis(),
        leaseMs: Long = DEFAULT_LEASE_MS,
    ): List<QueueItem> {
        val bounded = limit.coerceIn(1, 100)
        val leaseExpires = now + leaseMs
        val claimedIds = mutableListOf<Long>()
        val db = writableDatabase

        db.beginTransaction()
        try {
            db.execSQL(
                "UPDATE queue SET state = 'queued', claimed_at = NULL, lease_expires_at = NULL " +
                    "WHERE state = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?",
                arrayOf<Any>(now),
            )

            db.rawQuery(
                // `bounded` is an Int already clamped to 1..100 a few lines above,
                // so interpolating it is safe and avoids binding LIMIT as text.
                "SELECT id FROM queue WHERE state = 'queued' AND next_attempt_at <= ? " +
                    "ORDER BY priority ASC, id ASC LIMIT $bounded",
                arrayOf(now.toString()),
            ).use { c ->
                while (c.moveToNext()) claimedIds += c.getLong(0)
            }

            if (claimedIds.isNotEmpty()) {
                // `state = 'queued'` is the guard: a concurrent claimer has already
                // moved these rows to 'processing', so it updates zero rows and
                // gets them back below via the `lease_expires_at = ?` filter.
                val placeholders = claimedIds.joinToString(",") { "?" }
                val args = arrayOf<Any>(now, leaseExpires, *claimedIds.toTypedArray())
                db.execSQL(
                    "UPDATE queue SET state = 'processing', claimed_at = ?, lease_expires_at = ? " +
                        "WHERE id IN ($placeholders) AND state = 'queued'",
                    args,
                )
            }

            db.setTransactionSuccessful()
        } catch (_: Exception) {
            // Roll back and report "nothing claimed" rather than propagating:
            // a transient SQL error must look like an empty queue, not a crash.
        } finally {
            db.endTransaction()
        }

        if (claimedIds.isEmpty()) return emptyList()

        val out = mutableListOf<QueueItem>()
        val placeholders = claimedIds.joinToString(",") { "?" }
        // `state = 'processing'` alone is the winner test: `beginTransaction()` is
        // EXCLUSIVE, so the claim transaction above is serialized against any
        // other claimer, and only the transaction that actually flipped these rows
        // can still see them as 'processing' with our lease value.
        readableDatabase.rawQuery(
            "SELECT id, payload, attempts, module, priority FROM queue " +
                "WHERE id IN ($placeholders) AND state = 'processing' AND lease_expires_at = ?",
            (claimedIds.map { it.toString() } + leaseExpires.toString()).toTypedArray(),
        ).use { c ->
            val idIx = c.getColumnIndexOrThrow("id")
            val payloadIx = c.getColumnIndexOrThrow("payload")
            val attemptsIx = c.getColumnIndexOrThrow("attempts")
            val moduleIx = c.getColumnIndexOrThrow("module")
            val priorityIx = c.getColumnIndexOrThrow("priority")
            while (c.moveToNext()) {
                out += QueueItem(
                    id = c.getLong(idIx),
                    payload = c.getString(payloadIx),
                    attempts = c.getInt(attemptsIx),
                    module = c.getString(moduleIx) ?: "snapshot",
                    priority = c.getInt(priorityIx),
                )
            }
        }
        return out
    }

    /** Removes a packet after a confirmed upload. */
    fun complete(id: Long) {
        writableDatabase.delete("queue", "id = ?", arrayOf(id.toString()))
    }

    /**
     * Records a transient failure and releases the lease back to the queue with an
     * exponential backoff. Returns true once the item is moved to dead_letters.
     */
    @JvmOverloads
    fun markFailure(id: Long, error: String, maxAttempts: Int = 5): Boolean {
        val db = writableDatabase
        var deadLettered = false
        db.beginTransaction()
        try {
            val current = db.query(
                "queue",
                arrayOf("attempts", "payload", "created_at"),
                "id = ?",
                arrayOf(id.toString()),
                null,
                null,
                null,
                "1",
            ).use { c ->
                if (!c.moveToFirst()) return false
                Triple(c.getInt(0), c.getString(1), c.getLong(2))
            }

            val nextAttempts = current.first + 1
            if (nextAttempts >= maxAttempts.coerceAtLeast(1)) {
                val now = System.currentTimeMillis()
                db.insert(
                    "dead_letters",
                    null,
                    ContentValues().apply {
                        put("original_queue_id", id)
                        put("payload", current.second)
                        put("created_at", current.third)
                        put("failed_at", now)
                        put("attempts", nextAttempts)
                        put("last_error", error.take(500))
                    },
                )
                db.delete("queue", "id = ?", arrayOf(id.toString()))
                deadLettered = true
            } else {
                db.update(
                    "queue",
                    ContentValues().apply {
                        put("attempts", nextAttempts)
                        put("next_attempt_at", System.currentTimeMillis() + backoffMillis(nextAttempts))
                        put("last_error", error.take(500))
                        put("state", "queued")
                        // ContentValues has no generic put(String, Any?), so a null
                        // has to go through putNull rather than a cast.
                        putNull("claimed_at")
                        putNull("lease_expires_at")
                    },
                    "id = ?",
                    arrayOf(id.toString()),
                )
            }

            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        return deadLettered
    }

    /**
     * Returns a claimed packet to the queue without counting an attempt.
     *
     * Used when the worker is cancelled before it got an answer — the packet is
     * still good, it just never reached the network.
     */
    fun release(id: Long) {
        writableDatabase.update(
            "queue",
            ContentValues().apply {
                put("state", "queued")
                putNull("claimed_at")
                putNull("lease_expires_at")
            },
            "id = ? AND state = 'processing'",
            arrayOf(id.toString()),
        )
    }

    /** Moves every in-flight packet back to the queue. Call after a hard stop. */
    fun releaseAllClaims() {
        writableDatabase.execSQL(
            "UPDATE queue SET state = 'queued', claimed_at = NULL, lease_expires_at = NULL " +
                "WHERE state = 'processing'",
        )
    }

    fun retryDeadLetters(limit: Int = 100): Int {
        val db = writableDatabase
        var restored = 0
        db.beginTransaction()
        try {
            val ids = mutableListOf<Long>()
            db.query(
                "dead_letters",
                arrayOf("id"),
                null,
                null,
                null,
                null,
                "failed_at ASC",
                limit.coerceIn(1, 500).toString(),
            ).use { c ->
                while (c.moveToNext()) ids += c.getLong(0)
            }

            for (id in ids) {
                db.query(
                    "dead_letters",
                    arrayOf("payload", "created_at"),
                    "id = ?",
                    arrayOf(id.toString()),
                    null,
                    null,
                    null,
                    "1",
                ).use { c ->
                    if (!c.moveToFirst()) return@use
                    val queued = db.insert(
                        "queue",
                        null,
                        ContentValues().apply {
                            put("payload", c.getString(0))
                            put("created_at", c.getLong(1))
                            put("attempts", 0)
                            put("next_attempt_at", 0)
                            put("state", "queued")
                        },
                    )
                    if (queued != -1L) {
                        db.delete("dead_letters", "id = ?", arrayOf(id.toString()))
                        restored++
                    }
                }
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        return restored
    }

    fun count(): Int =
        readableDatabase.rawQuery("SELECT COUNT(*) FROM queue", null).use { c ->
            if (c.moveToFirst()) c.getInt(0) else 0
        }

    fun countDeadLetters(): Int =
        readableDatabase.rawQuery("SELECT COUNT(*) FROM dead_letters", null).use { c ->
            if (c.moveToFirst()) c.getInt(0) else 0
        }

    fun hasDelayedItems(now: Long = System.currentTimeMillis()): Boolean =
        readableDatabase.rawQuery(
            "SELECT 1 FROM queue WHERE state = 'queued' AND next_attempt_at > ? LIMIT 1",
            arrayOf(now.toString()),
        ).use { it.moveToFirst() }

    fun clear() {
        writableDatabase.delete("queue", null, null)
    }

    fun clearDeadLetters() {
        writableDatabase.delete("dead_letters", null, null)
    }

    private fun createIndexes(db: SQLiteDatabase) {
        db.execSQL("CREATE INDEX IF NOT EXISTS queue_ready_idx ON queue(state,next_attempt_at,priority,id)")
    }

    private fun createDeadLetterTable(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS dead_letters (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                "original_queue_id INTEGER NOT NULL, " +
                "payload TEXT NOT NULL, " +
                "created_at INTEGER NOT NULL, " +
                "failed_at INTEGER NOT NULL, " +
                "attempts INTEGER NOT NULL, " +
                "last_error TEXT" +
                ")"
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS dead_letters_failed_idx ON dead_letters(failed_at,id)")
    }

    private fun backoffMillis(attempt: Int): Long =
        (30_000L * (1L shl (attempt - 1).coerceIn(0, 4))).coerceAtMost(15 * 60_000L)

    private fun sha256(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }

    companion object {
        /**
         * How long a claim is held before another worker may take the packet.
         *
         * Comfortably longer than the OkHttp timeouts in `SyncWorker`
         * (10s connect + 20s read + 20s write), so a live upload is never stolen
         * mid-flight.
         */
        const val DEFAULT_LEASE_MS = 2 * 60 * 1000L
    }
}