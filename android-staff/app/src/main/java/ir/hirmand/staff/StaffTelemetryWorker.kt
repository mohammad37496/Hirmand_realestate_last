package ir.hirmand.staff

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class StaffTelemetryWorker(
    appContext: Context,
    workerParams: WorkerParameters,
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        if (StaffTelemetryStore.token(applicationContext).isBlank()) {
            return Result.success()
        }

        StaffTelemetry.enqueueHeartbeat(applicationContext)
        val ok = StaffTelemetry.flush(applicationContext)

        return if (ok) Result.success() else Result.retry()
    }
}
