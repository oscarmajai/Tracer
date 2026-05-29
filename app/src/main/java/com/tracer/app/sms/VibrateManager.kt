package com.tracer.app.sms

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

object VibrateManager {

    private const val TAG = "TracerVibrate"
    private const val VIBRATE_DURATION_MS = 60_000L
    // 500 ms encendido, 500 ms apagado, en bucle
    private val PATTERN = longArrayOf(0, 500, 500)

    private var activeVibrator: Vibrator? = null
    private val handler = Handler(Looper.getMainLooper())
    private val stopRunnable = Runnable { stop() }

    fun start(context: Context): Boolean {
        stop()
        return try {
            val vibrator = getVibrator(context)
            if (!vibrator.hasVibrator()) return false

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(PATTERN, 0))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(PATTERN, 0)
            }
            activeVibrator = vibrator
            handler.postDelayed(stopRunnable, VIBRATE_DURATION_MS)
            Log.d(TAG, "Vibration started")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Vibration failed: ${e.message}")
            false
        }
    }

    fun stop() {
        handler.removeCallbacks(stopRunnable)
        activeVibrator?.cancel()
        activeVibrator = null
        Log.d(TAG, "Vibration stopped")
    }

    fun isVibrating(): Boolean = activeVibrator != null

    private fun getVibrator(context: Context): Vibrator =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(VibratorManager::class.java).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
}
