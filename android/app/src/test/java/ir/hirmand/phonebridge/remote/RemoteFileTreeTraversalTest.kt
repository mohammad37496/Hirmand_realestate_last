package ir.hirmand.phonebridge.remote

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteFileTreeTraversalTest {
    @Test
    fun `reads no more than the requested number of provider rows and detects more`() {
        val rows = (1..10_000).toList()
        var cursor = -1
        var reads = 0

        val result = RemoteFileTreeTraversal.readAtMost(12, {
            cursor += 1
            cursor < rows.size
        }) {
            reads += 1
            rows[cursor]
        }

        assertEquals((1..12).toList(), result.values)
        assertEquals(12, reads)
        assertTrue(result.hasMore)
    }

    @Test
    fun `does not report more rows when the provider ends at the bound`() {
        val rows = (1..3).toList()
        var cursor = -1

        val result = RemoteFileTreeTraversal.readAtMost(3, {
            cursor += 1
            cursor < rows.size
        }) { rows[cursor] }

        assertEquals(rows, result.values)
        assertFalse(result.hasMore)
    }

    @Test
    fun `walks nested folders using each folder document id`() {
        val queries = mutableListOf<String>()
        val result = RemoteFileTreeTraversal.enumerate(
            rootDocumentId = "root",
            childrenOf = { parent, _ ->
                queries += parent
                when (parent) {
                    "root" -> listOf(
                        RemoteTreeDocument("folder", "Documents", "vnd.android.document/directory", 0, 1),
                        RemoteTreeDocument("top-file", "readme.txt", "text/plain", 12, 2),
                    )
                    "folder" -> listOf(RemoteTreeDocument("nested-file", "notes.txt", "text/plain", 20, 3))
                    else -> emptyList()
                }
            },
        )

        assertEquals(listOf("root", "folder"), queries)
        assertEquals(listOf("Documents", "Documents/notes.txt", "readme.txt"), result.entries.map { it.relativePath })
        assertEquals(listOf("root", "folder", "root"), listOf(
            result.entries[0].parentDocumentId,
            result.entries[1].parentDocumentId,
            result.entries[2].parentDocumentId,
        ))
        assertFalse(result.truncated)
    }

    @Test
    fun `does not revisit duplicate document ids and marks a capped tree as truncated`() {
        val result = RemoteFileTreeTraversal.enumerate("root", childrenOf = { parent, _ ->
            if (parent == "root") listOf(
                RemoteTreeDocument("same", "one.txt", "text/plain", 1, 1),
                RemoteTreeDocument("same", "duplicate.txt", "text/plain", 1, 1),
                RemoteTreeDocument("two", "two.txt", "text/plain", 1, 1),
            ) else emptyList()
        }, maxEntries = 1)

        assertEquals(listOf("one.txt"), result.entries.map { it.relativePath })
        assertTrue(result.truncated)
    }

    @Test
    fun `bounds each provider query to remaining capacity plus one sentinel`() {
        val requestedLimits = mutableListOf<Int>()
        val result = RemoteFileTreeTraversal.enumerate(
            rootDocumentId = "root",
            childrenOf = { parent, limit ->
                requestedLimits += limit
                if (parent == "root") (1..10).take(limit).map { index ->
                    RemoteTreeDocument("file-$index", "file-$index.txt", "text/plain", 1, 1)
                } else emptyList()
            },
            maxEntries = 2,
        )

        assertEquals(listOf(3), requestedLimits)
        assertEquals(2, result.entries.size)
        assertTrue(result.truncated)
    }
}
