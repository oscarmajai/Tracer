package com.tracer.app.sms

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.telephony.SmsManager
import android.util.Log
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.tracer.app.admin.TracerDeviceAdminReceiver
import com.tracer.app.service.TracerLocationService
import com.tracer.app.sim.SimManager

/**
 * @param onRemoteResult  Callback invocado cuando sender == "remote".
 *                        Recibe el texto de respuesta para enviarlo al servidor.
 */
class CommandHandler(
    private val context: Context,
    private val onRemoteResult: ((String) -> Unit)? = null,
) {

    private val pin = PinManager(context).getPin()

    fun handle(sender: String, message: String) {
        val parts = message.trim().split("\\s+".toRegex())
        if (parts.size < 2) return
        if (parts[0] != pin) return

        val command = parts[1].uppercase()
        val args = parts.drop(2)

        Log.d(TAG, "Command $command from $sender")

        when (command) {
            "LOCATE"     -> handleLocate(sender)
            "ALERT"      -> handleAlert(sender, args)
            "RING"       -> handleRing(sender, args)
            "BATTERY"    -> handleBattery(sender)
            "STATUS"     -> handleStatus(sender)
            "LOCK"       -> handleLock(sender)
            "PHOTO"      -> handlePhoto(sender)
            "WIPE"       -> handleWipe(sender, args)
            "GEO_BREACH" -> handleGeoBreach(sender)
            else         -> if (sender != "remote") reply(sender, "Tracer: comando desconocido")
        }
    }

    private fun handleLocate(sender: String) {
        val client = LocationServices.getFusedLocationProviderClient(context)
        try {
            val request = CurrentLocationRequest.Builder()
                .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
                .setMaxUpdateAgeMillis(2 * 60 * 1000L)
                .setDurationMillis(10_000L)
                .build()

            client.getCurrentLocation(request, null)
                .addOnSuccessListener { location ->
                    if (location != null) {
                        val battery = getBatteryLevel()
                        val mapsUrl = "maps.google.com/?q=${location.latitude},${location.longitude}"
                        reply(sender, "LOCATE ${location.latitude},${location.longitude} bat:$battery% $mapsUrl")
                    } else {
                        setAlertMode(true)
                        reply(sender, "Tracer: sin ubicacion reciente, modo ALERT activado")
                    }
                }
                .addOnFailureListener {
                    reply(sender, "Tracer: error obteniendo ubicacion")
                }
        } catch (e: SecurityException) {
            reply(sender, "Tracer: sin permiso de ubicacion")
        }
    }

    private fun handleAlert(sender: String, args: List<String>) {
        val enable = args.firstOrNull()?.uppercase() == "ON"
        setAlertMode(enable)
        reply(sender, "Tracer ALERT: ${if (enable) "ON (10s)" else "OFF (5min)"}")
    }

    private fun handleRing(sender: String, args: List<String>) {
        if (args.firstOrNull()?.uppercase() == "STOP") {
            RingManager.stop()
            reply(sender, "Tracer RING: detenida")
        } else {
            RingManager.start(context)
            reply(sender, "Tracer RING: activada 30s")
        }
    }

    private fun handleBattery(sender: String) {
        reply(sender, "Tracer BATTERY: ${getBatteryLevel()}%")
    }

    private fun handleStatus(sender: String) {
        val battery = getBatteryLevel()
        val ring = if (RingManager.isRinging()) "SI" else "NO"
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        val adminComponent = ComponentName(context, TracerDeviceAdminReceiver::class.java)
        val admin = if (dpm.isAdminActive(adminComponent)) "SI" else "NO"
        reply(sender, "Tracer STATUS bat:$battery% ring:$ring admin:$admin")
    }

    private fun handleLock(sender: String) {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        val adminComponent = ComponentName(context, TracerDeviceAdminReceiver::class.java)
        if (dpm.isAdminActive(adminComponent)) {
            reply(sender, "Tracer LOCK: bloqueando...")
            dpm.lockNow()
        } else {
            reply(sender, "Tracer LOCK: admin no activado")
        }
    }

    private fun handlePhoto(sender: String) {
        val intent = Intent(context, TracerLocationService::class.java).apply {
            action = TracerLocationService.ACTION_TAKE_PHOTO
            putExtra(TracerLocationService.EXTRA_REPLY_TO, sender)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
        // PHOTO no llama reply() aquí; el resultado lo reporta captureAndUploadPhoto()
    }

    private fun handleGeoBreach(sender: String) {
        setAlertMode(true)
        val trustedNumber = SimManager(context).getTrustedNumber()
        if (trustedNumber.length >= 7) {
            sendSms(context, trustedNumber, "Tracer ALERTA: dispositivo fuera de zona segura")
        }
        reply(sender, "Tracer GEO_BREACH: modo alerta activado, zona segura abandonada")
    }

    private fun handleWipe(sender: String, args: List<String>) {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        val adminComponent = ComponentName(context, TracerDeviceAdminReceiver::class.java)

        if (!dpm.isAdminActive(adminComponent)) {
            if (sender != "remote") reply(sender, "Tracer WIPE: admin no activado")
            return
        }

        val isConfirm = args.firstOrNull()?.uppercase() == "CONFIRM"

        if (sender == "remote") {
            if (isConfirm) {
                reply(sender, "Tracer WIPE: ejecutando borrado de fábrica...")
                dpm.wipeData(0)
            }
            return
        }

        if (isConfirm) {
            val pending = pendingWipe
            val elapsed = System.currentTimeMillis() - (pending?.timestamp ?: 0L)
            if (pending != null && pending.sender == sender && elapsed < WIPE_TIMEOUT_MS) {
                pendingWipe = null
                reply(sender, "Tracer WIPE: borrando datos del dispositivo...")
                dpm.wipeData(0)
            } else {
                reply(sender, "Tracer WIPE: confirmacion expirada o no iniciada")
            }
        } else {
            pendingWipe = PendingWipe(sender, System.currentTimeMillis())
            reply(sender, "Tracer WIPE: envia PIN WIPE CONFIRM en 60s para confirmar borrado total")
        }
    }

    private fun setAlertMode(enable: Boolean) {
        val intent = Intent(context, TracerLocationService::class.java).apply {
            action = TracerLocationService.ACTION_SET_ALERT_MODE
            putExtra(TracerLocationService.EXTRA_ALERT_MODE, enable)
        }
        context.startService(intent)
    }

    private fun getBatteryLevel(): Int {
        val status = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = status?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = status?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        return if (level >= 0 && scale > 0) (level * 100 / scale) else -1
    }

    private fun reply(to: String, message: String) {
        if (to == "remote") {
            onRemoteResult?.invoke(message)
            return
        }
        sendSms(context, to, message)
    }

    private data class PendingWipe(val sender: String, val timestamp: Long)

    companion object {
        private const val TAG = "TracerCmd"
        private const val WIPE_TIMEOUT_MS = 60_000L
        private var pendingWipe: PendingWipe? = null

        fun sendSms(context: Context, to: String, message: String) {
            if (to == "remote") return
            try {
                val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    context.getSystemService(SmsManager::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    SmsManager.getDefault()
                }
                val parts = smsManager.divideMessage(message)
                if (parts.size == 1) {
                    smsManager.sendTextMessage(to, null, message, null, null)
                } else {
                    smsManager.sendMultipartTextMessage(to, null, parts, null, null)
                }
            } catch (e: Exception) {
                Log.e(TAG, "SMS failed: ${e.message}")
            }
        }
    }
}
