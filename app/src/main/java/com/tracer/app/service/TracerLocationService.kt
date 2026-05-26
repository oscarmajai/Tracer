package com.tracer.app.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.telephony.PhoneStateListener
import android.telephony.SignalStrength
import android.telephony.SubscriptionManager
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*
import com.tracer.app.MainActivity
import com.tracer.app.TracerApp
import com.tracer.app.data.CommandResultPayload
import com.tracer.app.data.LocationTelemetry
import androidx.core.content.ContextCompat
import com.tracer.app.camera.PhotoCapture
import com.tracer.app.data.AlertPayload
import com.tracer.app.network.TracerApiService
import com.tracer.app.sim.SimManager
import com.tracer.app.sms.CommandHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import kotlin.coroutines.resume
import java.time.Instant
import java.time.format.DateTimeFormatter

class TracerLocationService : Service() {

    companion object {
        private const val TAG = "SysSync"
        private const val NOTIFICATION_ID = 1

        private const val INTERVAL_NORMAL_MS    = 5 * 60 * 1000L
        private const val INTERVAL_ALERT_MS     = 10 * 1000L
        private const val FASTEST_INTERVAL_MS   = 5 * 1000L
        private const val COMMAND_POLL_INTERVAL = 15 * 1000L

        const val ACTION_SET_ALERT_MODE = "com.tracer.app.SET_ALERT_MODE"
        const val EXTRA_ALERT_MODE      = "alert_mode"
        const val ACTION_TAKE_PHOTO     = "com.tracer.app.TAKE_PHOTO"
        const val EXTRA_REPLY_TO        = "reply_to"
        const val EXTRA_CMD_ID          = "cmd_id"
        const val ACTION_FORCE_LOCATE   = "com.tracer.app.FORCE_LOCATE"
        const val ACTION_PIN_FAIL_PHOTO = "com.tracer.app.PIN_FAIL_PHOTO"
        const val EXTRA_ATTEMPT_NUM     = "attempt_num"

        const val PREFS_STATUS    = "tracer_status"
        const val KEY_LAST_LAT    = "last_lat"
        const val KEY_LAST_LON    = "last_lon"
        const val KEY_LAST_TS     = "last_ts"
        const val KEY_LAST_RESULT = "last_result"
        const val KEY_LAST_POLL   = "last_poll"
        const val KEY_LAST_CMD    = "last_cmd"
    }

    private val serviceJob   = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private lateinit var apiService: TracerApiService
    private lateinit var simManager: SimManager
    private var subscriptionMgr: SubscriptionManager? = null

    private var isAlertMode = false

    // ── Señal de red ──────────────────────────────────────────────────────────

    @Volatile private var lastSignalLevel: Int? = null  // 0-4 (None→Great)

    @Suppress("DEPRECATION")
    private val legacySignalListener = object : PhoneStateListener() {
        override fun onSignalStrengthsChanged(signalStrength: SignalStrength) {
            lastSignalLevel = signalStrength.level
        }
    }

    private fun setupSignalMonitoring() {
        val tm = getSystemService(TelephonyManager::class.java) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            tm.registerTelephonyCallback(mainExecutor,
                object : TelephonyCallback(), TelephonyCallback.SignalStrengthsListener {
                    override fun onSignalStrengthsChanged(signalStrength: SignalStrength) {
                        lastSignalLevel = signalStrength.level
                    }
                }
            )
        } else {
            @Suppress("DEPRECATION")
            tm.listen(legacySignalListener, PhoneStateListener.LISTEN_SIGNAL_STRENGTHS)
        }
    }

    // ── SIM ───────────────────────────────────────────────────────────────────

    private val simChangeListener = object : SubscriptionManager.OnSubscriptionsChangedListener() {
        override fun onSubscriptionsChanged() {
            if (simManager.hasSimChanged()) {
                Log.w(TAG, "SIM change detected")
                simManager.saveCurrentFingerprint()
                sendSimAlert()
            }
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        apiService  = TracerApiService.create()
        simManager  = SimManager(this)
        buildLocationCallback()
        startForeground(NOTIFICATION_ID, buildNotification())
        requestLocationUpdates(isAlertMode)
        setupSignalMonitoring()
        setupSimMonitoring()
        startCommandPoller()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SET_ALERT_MODE -> {
                val alertMode = intent.getBooleanExtra(EXTRA_ALERT_MODE, false)
                if (alertMode != isAlertMode) {
                    isAlertMode = alertMode
                    restartLocationUpdates()
                    Log.d(TAG, "Alert mode -> $isAlertMode")
                }
            }
            ACTION_TAKE_PHOTO -> {
                val replyTo = intent.getStringExtra(EXTRA_REPLY_TO) ?: return START_STICKY
                val cmdId   = intent.getLongExtra(EXTRA_CMD_ID, -1L).takeIf { it >= 0 }
                serviceScope.launch { captureAndUploadPhoto(replyTo, cmdId) }
            }
            ACTION_FORCE_LOCATE -> {
                serviceScope.launch { forceLocateAndPost() }
            }
            ACTION_PIN_FAIL_PHOTO -> {
                val attemptNum = intent.getIntExtra(EXTRA_ATTEMPT_NUM, 1)
                serviceScope.launch {
                    captureAndUploadPhoto("remote", null)
                    val statusPrefs = getSharedPreferences(PREFS_STATUS, MODE_PRIVATE)
                    val lat = statusPrefs.getString(KEY_LAST_LAT, null)?.toDoubleOrNull()
                    val lon = statusPrefs.getString(KEY_LAST_LON, null)?.toDoubleOrNull()
                    runCatching {
                        apiService.postAlert(
                            TracerApiService.AUTH_TOKEN,
                            AlertPayload(
                                type = "pin_fail",
                                message = "Intento #$attemptNum de desbloqueo fallido",
                                lat = lat,
                                lon = lon,
                                battery = getBatteryLevel(),
                                signal = lastSignalLevel,
                                device_id = readAndroidId(),
                                attempt_num = attemptNum,
                            )
                        )
                    }
                }
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        fusedLocationClient.removeLocationUpdates(locationCallback)
        subscriptionMgr?.removeOnSubscriptionsChangedListener(simChangeListener)
        serviceJob.cancel()
    }

    // ── Ubicación ─────────────────────────────────────────────────────────────

    private fun buildLocationCallback() {
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val location = result.lastLocation ?: return
                sendTelemetry(buildTelemetry(location.latitude, location.longitude))
            }
        }
    }

    private fun buildTelemetry(lat: Double, lon: Double): LocationTelemetry {
        val batteryStatus = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level  = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale  = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val bat    = if (level >= 0 && scale > 0) (level * 100 / scale) else -1
        val status = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                         status == BatteryManager.BATTERY_STATUS_FULL

        val prefs      = getSharedPreferences("tracer_config", MODE_PRIVATE)
        val deviceName = prefs.getString("device_name", "") ?: ""

        return LocationTelemetry(
            deviceId     = readAndroidId(),
            latitude     = lat,
            longitude    = lon,
            batteryLevel = bat,
            timestamp    = DateTimeFormatter.ISO_INSTANT.format(Instant.now()),
            signalLevel  = lastSignalLevel,
            deviceName   = deviceName.ifEmpty { null },
            isCharging   = isCharging,
        )
    }

    private fun requestLocationUpdates(alertMode: Boolean) {
        val request = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            if (alertMode) INTERVAL_ALERT_MS else INTERVAL_NORMAL_MS
        ).apply {
            setMinUpdateIntervalMillis(FASTEST_INTERVAL_MS)
            setWaitForAccurateLocation(false)
        }.build()

        try {
            fusedLocationClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
        } catch (e: SecurityException) {
            Log.e(TAG, "Missing location permission: ${e.message}")
        }
    }

    private fun restartLocationUpdates() {
        fusedLocationClient.removeLocationUpdates(locationCallback)
        requestLocationUpdates(isAlertMode)
    }

    // ── Red ───────────────────────────────────────────────────────────────────

    private fun sendTelemetry(telemetry: LocationTelemetry) {
        serviceScope.launch {
            try {
                val response = apiService.postLocation(TracerApiService.AUTH_TOKEN, telemetry)
                val result = if (response.isSuccessful) "✓ OK" else "✗ HTTP ${response.code()}"
                saveLocationStatus(telemetry.latitude, telemetry.longitude, telemetry.timestamp, result)
                if (!response.isSuccessful) Log.w(TAG, "Server responded ${response.code()}")
            } catch (e: Exception) {
                saveLocationStatus(telemetry.latitude, telemetry.longitude, telemetry.timestamp, "✗ ${e.message}")
                Log.e(TAG, "Network error: ${e.message}")
            }
        }
    }

    private fun saveLocationStatus(lat: Double, lon: Double, ts: String, result: String) {
        getSharedPreferences(PREFS_STATUS, MODE_PRIVATE).edit()
            .putString(KEY_LAST_LAT, "%.5f".format(lat))
            .putString(KEY_LAST_LON, "%.5f".format(lon))
            .putString(KEY_LAST_TS, ts)
            .putString(KEY_LAST_RESULT, result)
            .apply()
    }

    // ── Foto ──────────────────────────────────────────────────────────────────

    private suspend fun captureAndUploadPhoto(replyTo: String, cmdId: Long? = null) {
        val file: File? = withContext(Dispatchers.Main) {
            suspendCancellableCoroutine { cont ->
                PhotoCapture(this@TracerLocationService).capture { f -> cont.resume(f) }
            }
        }

        var resultMsg: String
        if (file == null) {
            resultMsg = "Tracer PHOTO: error al capturar"
        } else {
            try {
                val deviceId    = readAndroidId()
                val photoPart   = MultipartBody.Part.createFormData(
                    "photo", file.name, file.asRequestBody("image/jpeg".toMediaType())
                )
                val deviceIdBody = deviceId.toRequestBody("text/plain".toMediaType())
                apiService.uploadPhoto(TracerApiService.AUTH_TOKEN, deviceIdBody, photoPart)
                resultMsg = "Tracer PHOTO: foto subida al servidor"
                Log.d(TAG, "Photo uploaded: ${file.name}")
            } catch (e: Exception) {
                resultMsg = "Tracer PHOTO: error al subir"
                Log.e(TAG, "Photo upload failed: ${e.message}")
            } finally {
                file.delete()
            }
        }

        if (cmdId != null) {
            runCatching { apiService.postCommandResult(TracerApiService.AUTH_TOKEN, cmdId, CommandResultPayload(resultMsg)) }
        } else {
            CommandHandler.sendSms(this, replyTo, resultMsg)
        }
    }

    // ── Command poller ────────────────────────────────────────────────────────

    private fun startCommandPoller() {
        serviceScope.launch {
            while (isActive) {
                runCatching {
                    val response = apiService.getPendingCommands(TracerApiService.AUTH_TOKEN)
                    if (response.isSuccessful) {
                        getSharedPreferences(PREFS_STATUS, MODE_PRIVATE).edit()
                            .putLong(KEY_LAST_POLL, System.currentTimeMillis())
                            .apply()

                        response.body()?.forEach { cmd ->
                            Log.d(TAG, "Remote command: ${cmd.command} args:${cmd.args}")
                            getSharedPreferences(PREFS_STATUS, MODE_PRIVATE).edit()
                                .putString(KEY_LAST_CMD, cmd.command)
                                .apply()

                            when (cmd.command.uppercase()) {
                                "LOCATE" -> {
                                    // forceLocateAndPost envía la telemetría; reportamos resultado por separado
                                    forceLocateAndPost()
                                    runCatching {
                                        apiService.postCommandResult(
                                            TracerApiService.AUTH_TOKEN, cmd.id,
                                            CommandResultPayload("Tracer LOCATE: ubicacion enviada")
                                        )
                                    }
                                }
                                "PHOTO" -> {
                                    // La foto maneja su propio resultado con cmdId
                                    val intent = Intent(this@TracerLocationService, TracerLocationService::class.java).apply {
                                        action = ACTION_TAKE_PHOTO
                                        putExtra(EXTRA_REPLY_TO, "remote")
                                        putExtra(EXTRA_CMD_ID, cmd.id)
                                    }
                                    startService(intent)
                                }
                                else -> {
                                    // Comandos síncronos: CommandHandler llama onRemoteResult con el texto
                                    val fullMessage = "${tracerPin()} ${cmd.command} ${cmd.args}".trim()
                                    CommandHandler(
                                        context = this@TracerLocationService,
                                        onRemoteResult = { result ->
                                            serviceScope.launch {
                                                runCatching {
                                                    apiService.postCommandResult(
                                                        TracerApiService.AUTH_TOKEN, cmd.id,
                                                        CommandResultPayload(result)
                                                    )
                                                }
                                            }
                                        }
                                    ).handle("remote", fullMessage)
                                }
                            }
                        }
                    }
                }.onFailure { Log.w(TAG, "Command poll error: ${it.message}") }
                delay(COMMAND_POLL_INTERVAL)
            }
        }
    }

    private suspend fun forceLocateAndPost() {
        val location = withContext(Dispatchers.Main) {
            suspendCancellableCoroutine<android.location.Location?> { cont ->
                try {
                    val request = CurrentLocationRequest.Builder()
                        .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
                        .setMaxUpdateAgeMillis(2 * 60 * 1000L)
                        .setDurationMillis(15_000L)
                        .build()
                    fusedLocationClient.getCurrentLocation(request, null)
                        .addOnSuccessListener { cont.resume(it) }
                        .addOnFailureListener { cont.resume(null) }
                } catch (e: SecurityException) {
                    cont.resume(null)
                }
            }
        } ?: return
        sendTelemetry(buildTelemetry(location.latitude, location.longitude))
    }

    private fun tracerPin(): String {
        val prefs = getSharedPreferences("tracer_config", MODE_PRIVATE)
        return prefs.getString("command_pin", "1234") ?: "1234"
    }

    // ── SIM ───────────────────────────────────────────────────────────────────

    private fun setupSimMonitoring() {
        subscriptionMgr = getSystemService(SubscriptionManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            subscriptionMgr?.addOnSubscriptionsChangedListener(mainExecutor, simChangeListener)
        } else {
            @Suppress("DEPRECATION")
            subscriptionMgr?.addOnSubscriptionsChangedListener(simChangeListener)
        }
    }

    private fun sendSimAlert() {
        serviceScope.launch {
            runCatching {
                apiService.postAlert(
                    TracerApiService.AUTH_TOKEN,
                    AlertPayload("sim_change", "SIM cambiada. Bat:${getBatteryLevel()}%")
                )
            }
        }

        val trustedNumber = simManager.getTrustedNumber()
        if (trustedNumber.isEmpty()) {
            Log.w(TAG, "No trusted number configured, skipping SIM SMS alert")
            return
        }
        try {
            fusedLocationClient.lastLocation.addOnSuccessListener { location ->
                val msg = if (location != null) {
                    val url = "maps.google.com/?q=${location.latitude},${location.longitude}"
                    "Tracer: SIM cambiada. Ubicacion: $url Bat:${getBatteryLevel()}%"
                } else {
                    "Tracer: SIM cambiada en tu dispositivo."
                }
                CommandHandler.sendSms(this, trustedNumber, msg)
                if (!isAlertMode) {
                    isAlertMode = true
                    restartLocationUpdates()
                }
            }
        } catch (e: SecurityException) {
            CommandHandler.sendSms(this, trustedNumber, "Tracer: SIM cambiada.")
        }
    }

    // ── Utilidades ────────────────────────────────────────────────────────────

    private fun getBatteryLevel(): Int {
        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryStatus = registerReceiver(null, filter)
        val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        return if (level >= 0 && scale > 0) (level * 100 / scale) else -1
    }

    private fun readAndroidId(): String =
        Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"

    private fun buildNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, TracerApp.NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Sincronización del sistema")
            .setContentText("Servicio de sincronización activo")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }
}
