package ir.hirmand.phonebridge.remote

import java.net.URI

internal object RemoteFileUriGuard {
    fun isAllowed(
        rootTreeUri: String,
        rootDocumentUri: String,
        requestedUri: String,
        persistedReadTreeUris: Set<String>,
        isChildDocument: (parentDocumentUri: String, childDocumentUri: String) -> Boolean,
    ): Boolean {
        if (rootTreeUri.isBlank() || rootDocumentUri.isBlank() || requestedUri.isBlank()) return false
        if (rootTreeUri !in persistedReadTreeUris) return false

        val root = parseContentUri(rootTreeUri) ?: return false
        val parent = parseContentUri(rootDocumentUri) ?: return false
        val child = parseContentUri(requestedUri) ?: return false
        val authority = root.rawAuthority?.takeIf { it.isNotBlank() } ?: return false
        if (parent.rawAuthority != authority || child.rawAuthority != authority) return false

        return runCatching { isChildDocument(rootDocumentUri, requestedUri) }.getOrDefault(false)
    }

    private fun parseContentUri(value: String): URI? {
        val parsed = runCatching { URI(value) }.getOrNull() ?: return null
        return parsed.takeIf { it.scheme.equals("content", ignoreCase = true) }
    }
}
