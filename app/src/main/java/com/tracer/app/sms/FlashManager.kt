package com.tracer.app.sms

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.os.Handler
import android.os.Looper
import android.util.Log

object FlashManager {

    private const val TAG = "TracerFlash"
    private const val FLASH_DURATION_MS = 60_000L

    private var activeCameraId: String? = null
    private var activeCameraManager: CameraManager? = null
    private val handler = Handler(Looper.getMainLooper())
    private val stopRunnable = Runnable { stop() }

    fun start(context: Context): Boolean {
        stop()
        return try {
            val cm = context.getSystemService(CameraManager::class.java)
            val cameraId = cm.cameraIdList.firstOrNull { id ->
                cm.getCameraCharacteristics(id)
                    .get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            } ?: return false

            cm.setTorchMode(cameraId, true)
            activeCameraId = cameraId
            activeCameraManager = cm
            handler.postDelayed(stopRunnable, FLASH_DURATION_MS)
            Log.d(TAG, "Flash started on camera $cameraId")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Flash failed: ${e.message}")
            false
        }
    }

    fun stop() {
        handler.removeCallbacks(stopRunnable)
        val id = activeCameraId ?: return
        val cm = activeCameraManager ?: return
        runCatching { cm.setTorchMode(id, false) }
        activeCameraId = null
        activeCameraManager = null
        Log.d(TAG, "Flash stopped")
    }

    fun isOn(): Boolean = activeCameraId != null
}
