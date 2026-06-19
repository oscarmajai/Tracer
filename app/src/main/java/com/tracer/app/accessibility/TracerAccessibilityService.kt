package com.tracer.app.accessibility

import android.accessibilityservice.AccessibilityService
import android.graphics.Bitmap
import android.os.Build
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import java.lang.ref.WeakReference

class TracerAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        instance = WeakReference(this)
        Log.d(TAG, "AccessibilityService conectado")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    override fun onInterrupt() {}

    override fun onDestroy() {
        super.onDestroy()
        if (instance?.get() === this) instance = null
    }

    companion object {
        private const val TAG = "TracerA11y"
        private var instance: WeakReference<TracerAccessibilityService>? = null

        fun isConnected(): Boolean = instance?.get() != null

        fun requestScreenshot(callback: (Bitmap?) -> Unit) {
            val svc = instance?.get()
            if (svc == null) {
                callback(null)
                return
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                svc.takeScreenshot(
                    android.view.Display.DEFAULT_DISPLAY,
                    svc.mainExecutor,
                    object : TakeScreenshotCallback {
                        override fun onSuccess(result: ScreenshotResult) {
                            val hardBuffer = result.hardwareBuffer
                            val bitmap = if (hardBuffer != null) {
                                Bitmap.wrapHardwareBuffer(hardBuffer, null)
                                    ?.copy(Bitmap.Config.ARGB_8888, false)
                            } else null
                            hardBuffer?.close()
                            callback(bitmap)
                        }
                        override fun onFailure(errorCode: Int) {
                            Log.w(TAG, "Screenshot failed: $errorCode")
                            callback(null)
                        }
                    }
                )
            } else {
                callback(null)
            }
        }
    }
}
