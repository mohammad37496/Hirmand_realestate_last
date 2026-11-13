package ir.hirmand.phonebridge.remote

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteFileUriGuardTest {
    private val rootTree = "content://com.android.externalstorage.documents/tree/primary%3ADocuments"
    private val rootDocumentId = "primary:Documents"
    private val childFile = "content://com.android.externalstorage.documents/tree/primary%3ADocuments/document/primary%3ADocuments%2Fsub%2Freport.pdf"
    private val childDocumentId = "primary:Documents/sub/report.pdf"
    private val validPath = listOf(rootDocumentId, childDocumentId)

    @Test
    fun allowsOnlyAChildDocumentUnderPersistedReadTreeGrant() {
        val allowed = RemoteFileUriGuard.isAllowed(
            rootTree,
            rootDocumentId,
            childFile,
            setOf(rootTree),
            childDocumentId,
            validPath,
        )

        assertTrue(allowed)
    }

    @Test
    fun rejectsTreeWithoutPersistedReadGrant() {
        val allowed = RemoteFileUriGuard.isAllowed(
            rootTree,
            rootDocumentId,
            childFile,
            emptySet(),
            childDocumentId,
            validPath,
        )

        assertFalse(allowed)
    }

    @Test
    fun rejectsUriFromDifferentDocumentProvider() {
        val allowed = RemoteFileUriGuard.isAllowed(
            rootTree,
            rootDocumentId,
            "content://com.android.providers.downloads.documents/document/42",
            setOf(rootTree),
            childDocumentId,
            validPath,
        )

        assertFalse(allowed)
    }

    @Test
    fun rejectsNonContentAndMalformedUris() {
        assertFalse(RemoteFileUriGuard.isAllowed(rootTree, rootDocumentId, "file:///sdcard/private.txt", setOf(rootTree), childDocumentId, validPath))
        assertFalse(RemoteFileUriGuard.isAllowed("not a uri", rootDocumentId, childFile, setOf("not a uri"), childDocumentId, validPath))
    }

    @Test
    fun failsClosedWhenResolvedPathDoesNotContainTheSelectedRootOrTarget() {
        assertFalse(RemoteFileUriGuard.isAllowed(rootTree, rootDocumentId, childFile, setOf(rootTree), childDocumentId, null))
        assertFalse(RemoteFileUriGuard.isAllowed(rootTree, rootDocumentId, childFile, setOf(rootTree), childDocumentId, listOf("another-root", childDocumentId)))
        assertFalse(RemoteFileUriGuard.isAllowed(rootTree, rootDocumentId, childFile, setOf(rootTree), "other-file", validPath))
    }
}
