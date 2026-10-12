package ir.hirmand.staff

import android.content.Context
import android.os.Build
import android.os.SystemClock
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.UUID
import java.util.concurrent.TimeUnit

private const val STAFF_PREFS = "hirmand_staff"
private const val PREF_DEVICE_TOKEN = "device_auth_token"
private const val PREF_TELEMETRY_QUEUE = "telemetry_queue"

object StaffTelemetryStore {
    fun token(context: Context): String =
        prefs(context).getString(PREF_DEVICE_TOKEN, "").orEmpty()

    fun saveToken(context: Context, token: String) {
        prefs(context).edit().putString(PREF_DEVICE_TOKEN, token.trim()).apply()
    }

    @Synchronized
    fun enqueue(
        context: Context,
        eventType: String,
        payload: JSONObject,
        observedAt: String = Instant.now().toString(),
    ) {
        val items = readQueue(context)
        items.put(
            JSONObject()
                .put("clientEventId", UUID.randomUUID().toString())
                .put("eventType", eventType)
                .put("payload", payload)
                .put("observedAt", observedAt)
        )

        while (items.length() > 500) {
            items.remove(0)
        }

        prefs(context).edit()
            .putString(PREF_TELEMETRY_QUEUE, items.toString())
            .apply()
    }

    @Synchronized
    fun takeBatch(context: Context, limit: Int): JSONArray {
        val all = readQueue(context)
        val batch = JSONArray()
        for (i in 0 until all.length()) {
            if (batch.length() >= limit) break
            all.optJSONObject(i)?.let(batch::put)
        }
        return batch
    }

    @Synchronized
    fun removeBatch(context: Context, batch: JSONArray) {
        if (batch.length() == 0) return

        val ids = buildSet {
            for (i in 0 until batch.length()) {
                batch.optJSONObject(i)
                    ?.optString("clientEventId")
                    ?.takeIf { it.isNotBlank() }
                    ?.let(::add)
            }
        }
        if (ids.isEmpty()) return

        val all = readQueue(context)
        val remaining = JSONArray()
        for (i in 0 until all.length()) {
            val item = all.optJSONObject(i) ?: continue
            if (!ids.contains(item.optString("clientEventId"))) {
                remaining.put(item)
            }
        }

        prefs(context).edit()
            .putString(PREF_TELEMETRY_QUEUE, remaining.toString())
            .apply()
    }

    fun queueSize(context: Context): Int = readQueue(context).length()

    private fun readQueue(context: Context): JSONArray {
        val raw = prefs(context).getString(PREF_TELEMETRY_QUEUE, null) ?: return JSONArray()
        return runCatching { JSONArray(raw) }.getOrDefault(JSONArray())
    }

    private fun prefs(context: Context) =
        context.getSharedPreferences(STAFF_PREFS, Context.MODE_PRIVATE)
}

object StaffTelemetry {
    private val telemetryUrl: String
        get() = BuildConfig.STAFF_TELEMETRY_URL

    fun schedulePeriodicSync(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = PeriodicWorkRequestBuilder<StaffTelemetryWorker>(
            15,
            TimeUnit.MINUTES,
        )
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            "hirmand-staff-telemetry",
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }

    fun enqueueHeartbeat(context: Context) {
        StaffTelemetryStore.enqueue(
            context,
            "app_heartbeat",
            JSONObject()
                .put("appVersionName", BuildConfig.VERSION_NAME)
                .put("appVersionCode", BuildConfig.VERSION_CODE)
                .put("manufacturer", Build.MANUFACTURER.take(80))
                .put("model", Build.MODEL.take(120))
                .put("androidVersion", Build.VERSION.RELEASE.orEmpty().take(40))
                .put("sdkInt", Build.VERSION.SDK_INT)
                .put("managementMode", DeviceOwnerManager.state(context).mode.name.lowercase())
                .put("queueSize", StaffTelemetryStore.queueSize(context))
                .put("elapsedRealtimeMs", SystemClock.elapsedRealtime()),
        )
    }

    fun enqueuePermissionState(context: Context, states: JSONObject) {
        StaffTelemetryStore.enqueue(context, "permission_state", states)
    }

    fun sendBatch(
        context: Context,
        url: String,
        batch: JSONArray,
        fieldName: String,
    ): Boolean {
        val token = StaffTelemetryStore.token(context)
        if (token.isBlank() || batch.length() == 0) return false

        val deviceId = context
            .getSharedPreferences(STAFF_PREFS, Context.MODE_PRIVATE)
            .getString("device_id", "")
            .orEmpty()
        if (deviceId.isBlank()) return false

        val body = JSONObject().put(fieldName, batch).toString()
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 8_000
            readTimeout = 15_000
            doOutput = true
            useCaches = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Authorization", "Bearer " + token)
            setRequestProperty("X-Hirmand-Device-Id", deviceId)
        }

        return try {
            connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body) }
            connection.responseCode in 200..299
        } finally {
            connection.disconnect()
        }
    }

    fun flush(context: Context): Boolean {
        val batch = StaffTelemetryStore.takeBatch(context, 50)
        if (batch.length() == 0) return true

        val ok = sendBatch(context, telemetryUrl, batch, "events")
        if (ok) {
            StaffTelemetryStore.removeBatch(context, batch)
        }
        return ok
    }
}
