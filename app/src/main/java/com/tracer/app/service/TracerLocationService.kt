package com.tracer.app.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
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
import android.graphics.Bitmap
import com.tracer.app.accessibility.TracerAccessibilityService
import com.tracer.app.camera.AudioRecorder
import com.tracer.app.camera.PhotoCapture
import java.io.FileOutputStream
import com.tracer.app.data.AlertPayload
import com.tracer.app.network.TracerApiService
import com.tracer.app.sim.SimManager
import com.tracer.app.sms.CommandHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
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
        const val ACTION_FORCE_LOCATE    = "com.tracer.app.FORCE_LOCATE"
        const val ACTION_PIN_FAIL_PHOTO  = "com.tracer.app.PIN_FAIL_PHOTO"
        const val EXTRA_ATTEMPT_NUM      = "attempt_num"
        const val ACTION_RECORD_AUDIO    = "com.tracer.app.RECORD_AUDIO"
        const val ACTION_TAKE_SCREENSHOT = "com.tracer.app.TAKE_SCREENSHOT"
        const val EXTRA_DURATION_SEC     = "duration_sec"

        const val PREFS_STATUS    = "tracer_status"
        const val KEY_LAST_LAT    = "last_lat"
        const val KEY_LAST_LON    = "last_lon"
        const val KEY_LAST_TS     = "last_ts"
        const val KEY_LAST_RESULT = "last_result"
        const val KEY_LAST_POLL   = "last_poll"
        const val KEY_LAST_CMD    = "last_cmd"

        // Cola de resultados pendientes de subir (3B)
        private const val PREFS_QUEUE         = "tracer_queue"
        private const val KEY_PENDING_RESULTS = "pending_results"
    }

    private val serviceJob   = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private lateinit var apiService: TracerApiService
    private lateinit var simManager: SimManager
    private var subscriptionMgr: SubscriptionManager? = null

    private var isAlertMode = false

    // 3A: canal para despertar el poller cuando vuelve la red
    private val wakeChannel = Channel<Unit>(Channel.CONFLATED)
    // 3A: referencia al NetworkCallback para poder desregistrarlo
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

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
        setupNetworkCallback()
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
            ACTION_RECORD_AUDIO -> {
                val replyTo    = intent.getStringExtra(EXTRA_REPLY_TO) ?: return START_STICKY
                val cmdId      = intent.getLongExtra(EXTRA_CMD_ID, -1L).takeIf { it >= 0 }
                val durationSec = intent.getIntExtra(EXTRA_DURATION_SEC, 60)
                serviceScope.launch { recordAndUploadAudio(replyTo, cmdId, durationSec) }
            }
            ACTION_TAKE_SCREENSHOT -> {
                val replyTo = intent.getStringExtra(EXTRA_REPLY_TO) ?: return START_STICKY
                val cmdId   = intent.getLongExtra(EXTRA_CMD_ID, -1L).takeIf { it >= 0 }
                serviceScope.launch { captureAndUploadScreenshot(replyTo, cmdId) }
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
        networkCallback?.let {
            getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(it)
        }
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

    // ── Audio ─────────────────────────────────────────────────────────────────

    private suspend fun recordAndUploadAudio(replyTo: String, cmdId: Long?, durationSec: Int) {
        val file: File? = withContext(Dispatchers.Main) {
            suspendCancellableCoroutine { cont ->
                AudioRecorder(this@TracerLocationService).record(durationSec) { f -> cont.resume(f) }
            }
        }

        val resultMsg: String
        if (file == null) {
            resultMsg = "Tracer AUDIO: error al grabar (sin permiso o hardware)"
        } else {
            resultMsg = try {
                val deviceId   = readAndroidId()
                val audioPart  = MultipartBody.Part.createFormData(
                    "audio", file.name, file.asRequestBody("audio/mp4".toMediaType())
                )
                val deviceIdBody = deviceId.toRequestBody("text/plain".toMediaType())
                apiService.uploadAudio(TracerApiService.AUTH_TOKEN, deviceIdBody, audioPart)
                Log.d(TAG, "Audio uploaded: ${file.name}")
                "Tracer AUDIO: grabación subida (${durationSec}s)"
            } catch (e: Exception) {
                Log.e(TAG, "Audio upload failed: ${e.message}")
                "Tracer AUDIO: error al subir"
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

    // ── Screenshot ────────────────────────────────────────────────────────────

    private suspend fun captureAndUploadScreenshot(replyTo: String, cmdId: Long?) {
        if (!TracerAccessibilityService.isConnected()) {
            val msg = "Tracer SCREENSHOT: activar en Ajustes > Accesibilidad > System Services"
            if (cmdId != null) {
                runCatching { apiService.postCommandResult(TracerApiService.AUTH_TOKEN, cmdId, CommandResultPayload(msg)) }
            } else {
                CommandHandler.sendSms(this, replyTo, msg)
            }
            return
        }

        val bitmap: Bitmap? = withContext(Dispatchers.Main) {
            suspendCancellableCoroutine { cont ->
                TracerAccessibilityService.requestScreenshot { bmp -> cont.resume(bmp) }
            }
        }

        val resultMsg: String
        if (bitmap == null) {
            resultMsg = "Tracer SCREENSHOT: captura fallida (requiere Android 11+)"
        } else {
            val file = File(cacheDir, "tracer_screen_${System.currentTimeMillis()}.jpg")
            withContext(Dispatchers.IO) {
                FileOutputStream(file).use { out ->
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 90, out)
                }
                bitmap.recycle()
            }
            resultMsg = try {
                val deviceId   = readAndroidId()
                val photoPart  = MultipartBody.Part.createFormData(
                    "photo", file.name, file.asRequestBody("image/jpeg".toMediaType())
                )
                val deviceIdBody = deviceId.toRequestBody("text/plain".toMediaType())
                apiService.uploadPhoto(TracerApiService.AUTH_TOKEN, deviceIdBody, photoPart)
                Log.d(TAG, "Screenshot uploaded: ${file.name}")
                "Tracer SCREENSHOT: captura subida al servidor"
            } catch (e: Exception) {
                Log.e(TAG, "Screenshot upload failed: ${e.message}")
                "Tracer SCREENSHOT: error al subir"
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

    // ── NetworkCallback (3A) ──────────────────────────────────────────────────

    private fun setupNetworkCallback() {
        val cm = getSystemService(ConnectivityManager::class.java) ?: return
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                Log.d(TAG, "Red disponible — activando poll inmediato")
                wakeChannel.trySend(Unit)
            }
        }
        cm.registerNetworkCallback(request, networkCallback!!)
    }

    // ── Cola de resultados offline (3B) ───────────────────────────────────────

    private fun enqueueResult(cmdId: Long, result: String) {
        val prefs = getSharedPreferences(PREFS_QUEUE, MODE_PRIVATE)
        val existing = prefs.getString(KEY_PENDING_RESULTS, "") ?: ""
        val entry = "$cmdId||${result.replace("\n", " ")}"
        val updated = if (existing.isEmpty()) entry else "$existing\n$entry"
        prefs.edit().putString(KEY_PENDING_RESULTS, updated).apply()
        Log.d(TAG, "Resultado encolado offline: cmdId=$cmdId")
    }

    private suspend fun flushResultQueue() {
        val prefs = getSharedPreferences(PREFS_QUEUE, MODE_PRIVATE)
        val pending = prefs.getString(KEY_PENDING_RESULTS, "") ?: ""
        if (pending.isEmpty()) return

        val lines = pending.lines().filter { it.isNotEmpty() }
        val failed = mutableListOf<String>()

        for (line in lines) {
            val idx = line.indexOf("||")
            if (idx < 0) continue
            val cmdId = line.substring(0, idx).toLongOrNull() ?: continue
            val result = line.substring(idx + 2)
            runCatching {
                apiService.postCommandResult(
                    TracerApiService.AUTH_TOKEN, cmdId, CommandResultPayload(result)
                )
                Log.d(TAG, "Resultado pendiente subido: cmdId=$cmdId")
            }.onFailure { failed.add(line) }
        }

        prefs.edit().putString(KEY_PENDING_RESULTS, failed.joinToString("\n")).apply()
    }

    // Intenta subir el resultado; si falla por red, lo encola para el próximo ciclo
    private fun postResultSafe(cmdId: Long, result: String) {
        serviceScope.launch {
            runCatching {
                apiService.postCommandResult(
                    TracerApiService.AUTH_TOKEN, cmdId, CommandResultPayload(result)
                )
            }.onFailure {
                Log.w(TAG, "Resultado no subido, encolando: ${it.message}")
                enqueueResult(cmdId, result)
            }
        }
    }

    // ── Command poller (3A + 3B) ──────────────────────────────────────────────

    private fun startCommandPoller() {
        serviceScope.launch {
            while (isActive) {
                pollCommandsOnce()
                // Espera hasta COMMAND_POLL_INTERVAL, pero puede despertar antes
                // si la red se restaura (wakeChannel recibe señal del NetworkCallback)
                val woke = withTimeoutOrNull(COMMAND_POLL_INTERVAL) {
                    wakeChannel.receive()
                }
                if (woke != null) Log.d(TAG, "Poll adelantado por reconexión de red")
            }
        }
    }

    private suspend fun pollCommandsOnce() {
        flushResultQueue() // Intentar subir resultados pendientes primero
        runCatching {
            val response = apiService.getPendingCommands(TracerApiService.AUTH_TOKEN)
            if (!response.isSuccessful) return@runCatching

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
                        forceLocateAndPost()
                        postResultSafe(cmd.id, "Tracer LOCATE: ubicacion enviada")
                    }
                    "PHOTO" -> {
                        val intent = Intent(this@TracerLocationService, TracerLocationService::class.java).apply {
                            action = ACTION_TAKE_PHOTO
                            putExtra(EXTRA_REPLY_TO, "remote")
                            putExtra(EXTRA_CMD_ID, cmd.id)
                        }
                        startService(intent)
                    }
                    "AUDIO", "SILENT_CALL" -> {
                        val duration = if (cmd.command.uppercase() == "SILENT_CALL") 60
                                       else cmd.args.trim().toIntOrNull()?.coerceIn(10, 300) ?: 60
                        val intent = Intent(this@TracerLocationService, TracerLocationService::class.java).apply {
                            action = ACTION_RECORD_AUDIO
                            putExtra(EXTRA_REPLY_TO, "remote")
                            putExtra(EXTRA_CMD_ID, cmd.id)
                            putExtra(EXTRA_DURATION_SEC, duration)
                        }
                        startService(intent)
                    }
                    "SCREENSHOT" -> {
                        val intent = Intent(this@TracerLocationService, TracerLocationService::class.java).apply {
                            action = ACTION_TAKE_SCREENSHOT
                            putExtra(EXTRA_REPLY_TO, "remote")
                            putExtra(EXTRA_CMD_ID, cmd.id)
                        }
                        startService(intent)
                    }
                    else -> {
                        val fullMessage = "${tracerPin()} ${cmd.command} ${cmd.args}".trim()
                        CommandHandler(
                            context = this@TracerLocationService,
                            onRemoteResult = { result -> postResultSafe(cmd.id, result) }
                        ).handle("remote", fullMessage)
                    }
                }
            }
        }.onFailure { Log.w(TAG, "Command poll error: ${it.message}") }
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
