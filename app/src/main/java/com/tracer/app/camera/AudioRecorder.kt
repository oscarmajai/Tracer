package com.tracer.app.camera

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.io.File

class AudioRecorder(private val context: Context) {

    fun record(durationSec: Int, onResult: (File?) -> Unit) {
        val file = File(context.cacheDir, "tracer_audio_${System.currentTimeMillis()}.m4a")
        val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }

        try {
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            recorder.setAudioSamplingRate(44100)
            recorder.setAudioEncodingBitRate(128_000)
            recorder.setOutputFile(file.absolutePath)
            recorder.prepare()
            recorder.start()
            Log.d(TAG, "Grabando ${durationSec}s → ${file.name}")

            Handler(Looper.getMainLooper()).postDelayed({
                try {
                    recorder.stop()
                } catch (e: Exception) {
                    Log.w(TAG, "Stop error: ${e.message}")
                } finally {
                    recorder.release()
                }
                onResult(if (file.exists() && file.length() > 0) file else null)
            }, durationSec * 1000L)
        } catch (e: Exception) {
            Log.e(TAG, "Record error: ${e.message}")
            recorder.release()
            onResult(null)
        }
    }

    companion object {
        private const val TAG = "TracerAudio"
    }
}
