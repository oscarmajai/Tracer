package com.tracer.app.sms

import android.content.Context

class PinManager(context: Context) {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getPin(): String = prefs.getString(KEY_PIN, DEFAULT_PIN) ?: DEFAULT_PIN

    fun setPin(newPin: String) {
        prefs.edit().putString(KEY_PIN, newPin).apply()
    }

    companion object {
        private const val PREFS_NAME = "tracer_config"
        private const val KEY_PIN = "command_pin"
        const val DEFAULT_PIN = "1234"
    }
}
