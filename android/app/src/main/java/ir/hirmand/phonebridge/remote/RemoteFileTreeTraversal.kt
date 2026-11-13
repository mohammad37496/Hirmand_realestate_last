package ir.hirmand.phonebridge.remote

internal data class RemoteTreeDocument(
    val documentId: String,
    val name: String,
    val mimeType: String,
    val sizeBytes: Long,
    val modifiedAt: Long,
)

internal data class RemoteTreeEntry(
    val document: RemoteTreeDocument,
    val parentDocumentId: String,
    val relativePath: String,
    val isDirectory: Boolean,
)

internal data class RemoteTreeResult(
    val entries: List<RemoteTreeEntry>,
    val truncated: Boolean,
)

/** Walk children by their document IDs; a tree URI always points at the selected root. */
internal object RemoteFileTreeTraversal {
    fun enumerate(
        rootDocumentId: String,
        childrenOf: (String, Int) -> List<RemoteTreeDocument>,
        maxEntries: Int = 1800,
        maxDepth: Int = 30,
    ): RemoteTreeResult {
        val entries = ArrayList<RemoteTreeEntry>()
        val visited = mutableSetOf(rootDocumentId)
        var truncated = false

        fun walk(parentDocumentId: String, parentPath: String, depth: Int) {
            if (depth > maxDepth || entries.size >= maxEntries) {
                truncated = true
                return
            }

            for (document in childrenOf(parentDocumentId, (maxEntries - entries.size + 1).coerceAtLeast(1))) {
                if (entries.size >= maxEntries) {
                    truncated = true
                    return
                }
                if (document.documentId.isBlank() || !visited.add(document.documentId)) continue

                val path = if (parentPath.isBlank()) document.name else "$parentPath/${document.name}"
                val isDirectory = document.mimeType == "vnd.android.document/directory"
                entries += RemoteTreeEntry(document, parentDocumentId, path, isDirectory)
                if (isDirectory) walk(document.documentId, path, depth + 1)
            }
        }

        walk(rootDocumentId, "", 0)
        return RemoteTreeResult(entries, truncated)
    }
}
