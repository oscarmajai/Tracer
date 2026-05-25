package com.tracer.app.sms

import android.app.NotificationManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.telephony.SmsManager
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.tracer.app.TracerApp
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
            "LOCATE"      -> handleLocate(sender)
            "ALERT"       -> handleAlert(sender, args)
            "RING"        -> handleRing(sender, args)
            "BATTERY"     -> handleBattery(sender)
            "STATUS"      -> handleStatus(sender)
            "LOCK"        -> handleLock(sender, args)
            "PHOTO"       -> handlePhoto(sender)
            "WIPE"        -> handleWipe(sender, args)
            "CALLBACK"    -> handleCallback(sender)
            "ENABLE_WIFI" -> handleEnableWifi(sender)
            "ENABLE_DATA" -> handleEnableData(sender)
            "GEO_BREACH"  -> handleGeoBreach(sender)
            else          -> if (sender != "remote") reply(sender, "Tracer: comando desconocido")
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
        val level = getBatteryLevel()
        val charging = getIsCharging()
        reply(sender, "Tracer BATTERY: $level%${if (charging) " (cargando)" else ""}")
    }

    private fun handleStatus(sender: String) {
        val battery = getBatteryLevel()
        val charging = getIsCharging()
        val ring = if (RingManager.isRinging()) "SI" else "NO"

        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        val adminComponent = ComponentName(context, TracerDeviceAdminReceiver::class.java)
        val admin = if (dpm.isAdminActive(adminComponent)) "SI" else "NO"

        val networkInfo = getNetworkInfo()

        reply(sender, "Tracer STATUS bat:$battery%${if (charging) "⚡" else ""} red:$networkInfo ring:$ring admin:$admin")
    }

    private fun handleLock(sender: String, args: List<String>) {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        val adminComponent = ComponentName(context, TracerDeviceAdminReceiver::class.java)
        if (!dpm.isAdminActive(adminComponent)) {
            reply(sender, "Tracer LOCK: admin no activado")
            return
        }

        val message = args.joinToString(" ").trim()
        if (message.isNotEmpty()) {
            showLockScreenMessage(message)
        }
        reply(sender, "Tracer LOCK: bloqueando${if (message.isNotEmpty()) " con mensaje" else ""}...")
        dpm.lockNow()
    }

    private fun showLockScreenMessage(message: String) {
        val nm = context.getSystemService(NotificationManager::class.java)
        val notification = NotificationCompat.Builder(context, TracerApp.NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Mensaje del dispositivo")
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .build()
        nm.notify(LOCK_MSG_NOTIF_ID, notification)
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
    }

    private fun handleCallback(sender: String) {
        val trustedNumber = SimManager(context).getTrustedNumber()
        if (trustedNumber.isEmpty()) {
            reply(sender, "Tracer CALLBACK: sin numero de confianza configurado")
            return
        }
        try {
            val callIntent = Intent(Intent.ACTION_CALL).apply {
                data = Uri.parse("tel:${trustedNumber}")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(callIntent)
            reply(sender, "Tracer CALLBACK: llamando a $trustedNumber")
        } catch (e: SecurityException) {
            reply(sender, "Tracer CALLBACK: sin permiso CALL_PHONE")
        } catch (e: Exception) {
            reply(sender, "Tracer CALLBACK: error ${e.message}")
        }
    }

    @Suppress("DEPRECATION")
    private fun handleEnableWifi(sender: String) {
        return try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                val ok = wm.setWifiEnabled(true)
                reply(sender, if (ok) "Tracer ENABLE_WIFI: WiFi activado" else "Tracer ENABLE_WIFI: fallo al activar WiFi")
            } else {
                reply(sender, "Tracer ENABLE_WIFI: Android 10+ no permite activacion remota de WiFi")
            }
        } catch (e: Exception) {
            reply(sender, "Tracer ENABLE_WIFI: error ${e.message}")
        }
    }

    private fun handleEnableData(sender: String) {
        return try {
            val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            @Suppress("UNCHECKED_CAST")
            val method = tm.javaClass.getDeclaredMethod("setDataEnabled", Boolean::class.java)
            method.isAccessible = true
            method.invoke(tm, true)
            reply(sender, "Tracer ENABLE_DATA: datos moviles activados")
        } catch (e: Exception) {
            reply(sender, "Tracer ENABLE_DATA: sin privilegios suficientes (${e.javaClass.simpleName})")
        }
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
                reply(sender, "Tracer WIPE: ejecutando borrado de fabrica...")
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

    private fun getIsCharging(): Boolean {
        val status = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val s = status?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        return s == BatteryManager.BATTERY_STATUS_CHARGING || s == BatteryManager.BATTERY_STATUS_FULL
    }

    private fun getNetworkInfo(): String {
        return try {
            val cm = context.getSystemService(ConnectivityManager::class.java)
            val caps = cm.getNetworkCapabilities(cm.activeNetwork)
            when {
                caps == null -> "sin red"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> {
                    @Suppress("DEPRECATION")
                    val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                    @Suppress("DEPRECATION")
                    val ssid = wm.connectionInfo?.ssid?.replace("\"", "") ?: "WiFi"
                    "WiFi:$ssid"
                }
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> {
                    val tm = context.getSystemService(TelephonyManager::class.java)
                    "Datos:${tm.networkOperatorName.ifEmpty { "movil" }}"
                }
                else -> "conectado"
            }
        } catch (e: Exception) {
            "red:?"
        }
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
        private const val LOCK_MSG_NOTIF_ID = 9001
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
