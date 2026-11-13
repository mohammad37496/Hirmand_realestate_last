package ir.hirmand.phonebridge.remote

import java.io.ByteArrayInputStream
import java.io.FilterInputStream
import java.io.InputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class RemoteFileReaderTest {
    @Test
    fun `reads a file exactly at the configured limit`() {
        val source = byteArrayOf(1, 2, 3, 4)

        assertArrayEquals(source, RemoteFileReader.readLimited(ByteArrayInputStream(source), 4))
    }

    @Test
    fun `stops after reading only one byte beyond the configured limit`() {
        var bytesRead = 0
        val source = object : FilterInputStream(ByteArrayInputStream(ByteArray(100))) {
            override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                val count = super.read(buffer, offset, length)
                if (count > 0) bytesRead += count
                return count
            }
        }

        assertNull(RemoteFileReader.readLimited(source, 8))
        assertEquals(9, bytesRead)
    }

    @Test
    fun `rejects a negative size limit`() {
        assertThrows(IllegalArgumentException::class.java) {
            RemoteFileReader.readLimited(InputStream.nullInputStream(), -1)
        }
    }
}
