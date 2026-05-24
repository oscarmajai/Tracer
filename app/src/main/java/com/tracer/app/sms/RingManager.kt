package com.tracer.app.sms

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Handler
import android.os.Looper
import android.util.Log

object RingManager {

    private const val TAG = "TracerRing"
    private const val RING_DURATION_MS = 30_000L

    private var mediaPlayer: MediaPlayer? = null
    private val handler = Handler(Looper.getMainLooper())
    private val stopRunnable = Runnable { stop() }

    fun start(context: Context) {
        stop()
        try {
            val audioManager = context.getSystemService(AudioManager::class.java)
            audioManager.setStreamVolume(
                AudioManager.STREAM_ALARM,
                audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM),
                0
            )

            val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                setDataSource(context, alarmUri)
                isLooping = true
                prepare()
                start()
            }

            handler.postDelayed(stopRunnable, RING_DURATION_MS)
            Log.d(TAG, "Ring started")
        } catch (e: Exception) {
            Log.e(TAG, "Ring failed: ${e.message}")
        }
    }

    fun stop() {
        handler.removeCallbacks(stopRunnable)
        mediaPlayer?.runCatching { stop(); release() }
        mediaPlayer = null
        Log.d(TAG, "Ring stopped")
    }

    fun isRinging(): Boolean = mediaPlayer != null
}
