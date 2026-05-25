package com.tracer.app.admin

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.tracer.app.service.TracerLocationService

class TracerDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        Log.d(TAG, "Device admin enabled")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        Log.d(TAG, "Device admin disabled")
    }

    override fun onPasswordFailed(context: Context, intent: Intent) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val count = prefs.getInt(KEY_FAIL_COUNT, 0) + 1
        prefs.edit().putInt(KEY_FAIL_COUNT, count).apply()
        Log.w(TAG, "Password failed: attempt $count")

        if (count >= PIN_FAIL_THRESHOLD) {
            prefs.edit().putInt(KEY_FAIL_COUNT, 0).apply()
            triggerPinFailPhoto(context)
        }
    }

    override fun onPasswordSucceeded(context: Context, intent: Intent) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putInt(KEY_FAIL_COUNT, 0).apply()
    }

    private fun triggerPinFailPhoto(context: Context) {
        val intent = Intent(context, TracerLocationService::class.java).apply {
            action = TracerLocationService.ACTION_PIN_FAIL_PHOTO
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
        Log.w(TAG, "PIN fail threshold reached, triggering photo")
    }

    companion object {
        private const val TAG = "TracerAdmin"
        private const val PREFS_NAME = "tracer_config"
        private const val KEY_FAIL_COUNT = "pin_fail_count"
        private const val PIN_FAIL_THRESHOLD = 3
    }
}
