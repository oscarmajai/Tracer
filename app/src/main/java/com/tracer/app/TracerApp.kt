package com.tracer.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class TracerApp : Application() {

    companion object {
        const val NOTIFICATION_CHANNEL_ID = "sys_sync_channel"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "System Synchronization",
                NotificationManager.IMPORTANCE_MIN  // IMPORTANCE_MIN oculta el icono del status bar
            ).apply {
                description = "Comprobación de estado del sistema"
                setShowBadge(false)
                enableVibration(false)
                enableLights(false)
                setSound(null, null)
            }

            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }
}
