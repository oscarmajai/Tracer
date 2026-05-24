package com.tracer.app.camera

import android.content.Context
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import java.io.File

/**
 * Captura una foto con la cámara frontal sin mostrar ninguna UI.
 * Implementa LifecycleOwner para satisfacer el requisito de CameraX.
 * Debe llamarse desde el hilo principal.
 */
class PhotoCapture(private val context: Context) : LifecycleOwner {

    private val registry = LifecycleRegistry(this)
    override val lifecycle: Lifecycle get() = registry

    fun capture(onResult: (File?) -> Unit) {
        val executor = ContextCompat.getMainExecutor(context)

        registry.handleLifecycleEvent(Lifecycle.Event.ON_CREATE)
        registry.handleLifecycleEvent(Lifecycle.Event.ON_START)
        registry.handleLifecycleEvent(Lifecycle.Event.ON_RESUME)

        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            val provider = future.get()
            val imageCapture = ImageCapture.Builder()
                .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                .build()

            try {
                provider.unbindAll()
                provider.bindToLifecycle(this, CameraSelector.DEFAULT_FRONT_CAMERA, imageCapture)

                val outFile = File(context.cacheDir, "tracer_${System.currentTimeMillis()}.jpg")
                imageCapture.takePicture(
                    ImageCapture.OutputFileOptions.Builder(outFile).build(),
                    executor,
                    object : ImageCapture.OnImageSavedCallback {
                        override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                            teardown(provider)
                            onResult(outFile)
                        }
                        override fun onError(e: ImageCaptureException) {
                            Log.e(TAG, "Capture error: ${e.message}")
                            teardown(provider)
                            onResult(null)
                        }
                    }
                )
            } catch (e: Exception) {
                Log.e(TAG, "Camera bind error: ${e.message}")
                teardown(provider)
                onResult(null)
            }
        }, executor)
    }

    private fun teardown(provider: ProcessCameraProvider) {
        provider.unbindAll()
        registry.handleLifecycleEvent(Lifecycle.Event.ON_PAUSE)
        registry.handleLifecycleEvent(Lifecycle.Event.ON_STOP)
        registry.handleLifecycleEvent(Lifecycle.Event.ON_DESTROY)
    }

    companion object {
        private const val TAG = "TracerCamera"
    }
}
