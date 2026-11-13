package ir.hirmand.phonebridge.remote

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteFileTreeTraversalTest {
    @Test
    fun `walks nested folders using each folder document id`() {
        val queries = mutableListOf<String>()
        val result = RemoteFileTreeTraversal.enumerate(
            rootDocumentId = "root",
            childrenOf = { parent ->
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
        val result = RemoteFileTreeTraversal.enumerate("root", childrenOf = { parent ->
            if (parent == "root") listOf(
                RemoteTreeDocument("same", "one.txt", "text/plain", 1, 1),
                RemoteTreeDocument("same", "duplicate.txt", "text/plain", 1, 1),
                RemoteTreeDocument("two", "two.txt", "text/plain", 1, 1),
            ) else emptyList()
        }, maxEntries = 1)

        assertEquals(listOf("one.txt"), result.entries.map { it.relativePath })
        assertTrue(result.truncated)
    }
}
