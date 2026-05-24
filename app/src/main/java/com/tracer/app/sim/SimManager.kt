package com.tracer.app.sim

import android.content.Context
import android.telephony.SubscriptionManager
import android.util.Log

class SimManager(private val context: Context) {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getTrustedNumber(): String = prefs.getString(KEY_TRUSTED_NUMBER, "") ?: ""
    fun setTrustedNumber(number: String) = prefs.edit().putString(KEY_TRUSTED_NUMBER, number).apply()

    fun hasSimChanged(): Boolean {
        val stored = prefs.getString(KEY_FINGERPRINT, "") ?: ""
        if (stored.isEmpty()) {
            saveCurrentFingerprint()
            return false
        }
        val current = getFingerprint()
        return current.isNotEmpty() && current != stored
    }

    fun saveCurrentFingerprint() {
        val fp = getFingerprint()
        if (fp.isNotEmpty()) {
            prefs.edit().putString(KEY_FINGERPRINT, fp).apply()
            Log.d(TAG, "SIM fingerprint saved: $fp")
        }
    }

    private fun getFingerprint(): String {
        return try {
            val sm = context.getSystemService(SubscriptionManager::class.java)
            val infos = sm.activeSubscriptionInfoList ?: return ""
            if (infos.isEmpty()) return ""
            infos.sortedBy { it.simSlotIndex }.joinToString("|") { info ->
                val iccId = info.iccId ?: ""
                // iccId puede ser vacío en Android 10+ sin privilegios; usar mcc+mnc+nombre como fallback
                if (iccId.isNotEmpty()) iccId
                else "${info.mcc}${info.mnc}${info.displayName}"
            }
        } catch (e: Exception) {
            Log.e(TAG, "Fingerprint error: ${e.message}")
            ""
        }
    }

    companion object {
        private const val PREFS_NAME = "tracer_config"
        private const val KEY_TRUSTED_NUMBER = "trusted_number"
        private const val KEY_FINGERPRINT = "sim_fingerprint"
        private const val TAG = "TracerSim"
    }
}
