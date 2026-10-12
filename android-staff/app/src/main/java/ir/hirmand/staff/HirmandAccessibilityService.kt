package ir.hirmand.staff

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent

class HirmandAccessibilityService : AccessibilityService() {
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // The current release only exposes the Android-controlled service switch.
        // No accessibility event data is collected or transmitted yet.
    }

    override fun onInterrupt() = Unit
}
