package ir.hirmand.phonebridge.remote

import java.io.ByteArrayOutputStream
import java.io.InputStream

internal object RemoteFileReader {
    /** Read at most maxBytes plus one byte, so oversized files never exhaust app memory. */
    fun readLimited(input: InputStream, maxBytes: Long): ByteArray? {
        require(maxBytes >= 0) { "Maximum file size must not be negative." }

        val output = ByteArrayOutputStream(minOf(maxBytes, 8192L).toInt())
        val buffer = ByteArray(8192)
        var totalBytes = 0L

        while (true) {
            val remaining = maxBytes - totalBytes
            val requestedBytes = minOf(buffer.size.toLong(), remaining + 1).toInt()
            val read = input.read(buffer, 0, requestedBytes)
            if (read < 0) return output.toByteArray()
            if (read == 0) continue
            if (read.toLong() > remaining) return null

            output.write(buffer, 0, read)
            totalBytes += read
        }
    }
}
