package ir.hirmand.phonebridge.remote

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteFileUriGuardTest {
    private val rootTree = "content://com.android.externalstorage.documents/tree/primary%3ADocuments"
    private val rootDocument = "content://com.android.externalstorage.documents/tree/primary%3ADocuments/document/primary%3ADocuments"
    private val childFile = "content://com.android.externalstorage.documents/tree/primary%3ADocuments/document/primary%3ADocuments%2Fsub%2Freport.pdf"

    @Test
    fun allowsOnlyAChildDocumentUnderPersistedReadTreeGrant() {
        val allowed = RemoteFileUriGuard.isAllowed(
            rootTree,
            rootDocument,
            childFile,
            setOf(rootTree),
        ) { parent, child -> parent == rootDocument && child == childFile }

        assertTrue(allowed)
    }

    @Test
    fun rejectsTreeWithoutPersistedReadGrant() {
        val allowed = RemoteFileUriGuard.isAllowed(
            rootTree,
            rootDocument,
            childFile,
            emptySet(),
        ) { _, _ -> true }

        assertFalse(allowed)
    }

    @Test
    fun rejectsUriFromDifferentDocumentProvider() {
        var checkedChild = false
        val allowed = RemoteFileUriGuard.isAllowed(
            rootTree,
            rootDocument,
            "content://com.android.providers.downloads.documents/document/42",
            setOf(rootTree),
        ) { _, _ ->
            checkedChild = true
            true
        }

        assertFalse(allowed)
        assertFalse(checkedChild)
    }

    @Test
    fun rejectsNonContentAndMalformedUris() {
        assertFalse(RemoteFileUriGuard.isAllowed(rootTree, rootDocument, "file:///sdcard/private.txt", setOf(rootTree)) { _, _ -> true })
        assertFalse(RemoteFileUriGuard.isAllowed("not a uri", rootDocument, childFile, setOf("not a uri")) { _, _ -> true })
    }

    @Test
    fun failsClosedWhenProviderDeniesChildVerification() {
        assertFalse(RemoteFileUriGuard.isAllowed(rootTree, rootDocument, childFile, setOf(rootTree)) { _, _ -> false })
        assertFalse(RemoteFileUriGuard.isAllowed(rootTree, rootDocument, childFile, setOf(rootTree)) { _, _ -> error("provider failure") })
    }
}
