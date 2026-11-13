package ir.hirmand.phonebridge.remote

import java.net.URI

internal object RemoteFileUriGuard {
    fun isAllowed(
        rootTreeUri: String,
        rootDocumentId: String,
        requestedUri: String,
        persistedReadTreeUris: Set<String>,
        requestedDocumentId: String,
        resolvedDocumentPath: List<String>?,
    ): Boolean {
        if (rootTreeUri.isBlank() || rootDocumentId.isBlank() || requestedUri.isBlank() || requestedDocumentId.isBlank()) return false
        if (rootTreeUri !in persistedReadTreeUris) return false

        val root = parseContentUri(rootTreeUri) ?: return false
        val child = parseContentUri(requestedUri) ?: return false
        val authority = root.rawAuthority?.takeIf { it.isNotBlank() } ?: return false
        if (child.rawAuthority != authority) return false

        val path = resolvedDocumentPath ?: return false
        return rootDocumentId in path && path.lastOrNull() == requestedDocumentId
    }

    private fun parseContentUri(value: String): URI? {
        val parsed = runCatching { URI(value) }.getOrNull() ?: return null
        return parsed.takeIf { it.scheme.equals("content", ignoreCase = true) }
    }
}
