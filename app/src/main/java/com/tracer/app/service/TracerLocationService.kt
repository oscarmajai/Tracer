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
import android.telephony.SubscriptionManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*
import com.tracer.app.MainActivity
import com.tracer.app.TracerApp
import com.tracer.app.data.LocationTelemetry
import androidx.core.content.ContextCompat
import com.tracer.app.camera.PhotoCapture
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
        private const val COMMAND_POLL_INTERVAL = 60 * 1000L

        const val ACTION_SET_ALERT_MODE = "com.tracer.app.SET_ALERT_MODE"
        const val EXTRA_ALERT_MODE      = "alert_mode"
        const val ACTION_TAKE_PHOTO     = "com.tracer.app.TAKE_PHOTO"
        const val EXTRA_REPLY_TO        = "reply_to"
    }

    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private lateinit var apiService: TracerApiService
    private lateinit var simManager: SimManager
    private var subscriptionMgr: SubscriptionManager? = null

    private var isAlertMode = false

    private val simChangeListener = object : SubscriptionManager.OnSubscriptionsChangedListener() {
        override fun onSubscriptionsChanged() {
            if (simManager.hasSimChanged()) {
                Log.w(TAG, "SIM change detected")
                simManager.saveCurrentFingerprint()
                sendSimAlert()
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        apiService = TracerApiService.create()
        simManager = SimManager(this)
        buildLocationCallback()
        startForeground(NOTIFICATION_ID, buildNotification())
        requestLocationUpdates(isAlertMode)
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
                serviceScope.launch { captureAndUploadPhoto(replyTo) }
            }
        }
        return START_STICKY   // El sistema reiniciará el servicio si es destruido
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        fusedLocationClient.removeLocationUpdates(locationCallback)
        subscriptionMgr?.removeOnSubscriptionsChangedListener(simChangeListener)
        serviceJob.cancel()
    }

    // --- Ubicación ---

    private fun buildLocationCallback() {
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val location = result.lastLocation ?: return
                val telemetry = LocationTelemetry(
                    deviceId      = readAndroidId(),
                    latitude      = location.latitude,
                    longitude     = location.longitude,
                    batteryLevel  = getBatteryLevel(),
                    timestamp     = DateTimeFormatter.ISO_INSTANT.format(Instant.now())
                )
                sendTelemetry(telemetry)
            }
        }
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

    // --- Red ---

    private fun sendTelemetry(telemetry: LocationTelemetry) {
        serviceScope.launch {
            try {
                val response = apiService.postLocation(TracerApiService.AUTH_TOKEN, telemetry)
                if (!response.isSuccessful) {
                    Log.w(TAG, "Server responded ${response.code()}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Network error: ${e.message}")
            }
        }
    }

    // --- Foto ---

    private suspend fun captureAndUploadPhoto(replyTo: String) {
        // CameraX requiere el hilo principal para lifecycle y binding
        val file: File? = withContext(Dispatchers.Main) {
            suspendCancellableCoroutine { cont ->
                PhotoCapture(this@TracerLocationService).capture { f -> cont.resume(f) }
            }
        }

        if (file == null) {
            CommandHandler.sendSms(this, replyTo, "Tracer PHOTO: error al capturar")
            return
        }

        try {
            val deviceId    = readAndroidId()
            val photoPart   = MultipartBody.Part.createFormData(
                "photo", file.name, file.asRequestBody("image/jpeg".toMediaType())
            )
            val deviceIdBody = deviceId.toRequestBody("text/plain".toMediaType())
            apiService.uploadPhoto(TracerApiService.AUTH_TOKEN, deviceIdBody, photoPart)
            CommandHandler.sendSms(this, replyTo, "Tracer PHOTO: foto subida al servidor")
            Log.d(TAG, "Photo uploaded: ${file.name}")
        } catch (e: Exception) {
            Log.e(TAG, "Photo upload failed: ${e.message}")
            CommandHandler.sendSms(this, replyTo, "Tracer PHOTO: error al subir")
        } finally {
            file.delete()
        }
    }

    // --- Command polling ---

    private fun startCommandPoller() {
        serviceScope.launch {
            while (isActive) {
                delay(COMMAND_POLL_INTERVAL)
                runCatching {
                    val response = apiService.getPendingCommands(TracerApiService.AUTH_TOKEN)
                    if (response.isSuccessful) {
                        response.body()?.forEach { cmd ->
                            Log.d(TAG, "Remote command: ${cmd.command} args:${cmd.args}")
                            val fullMessage = "${tracerPin()} ${cmd.command} ${cmd.args}".trim()
                            CommandHandler(this@TracerLocationService).handle("remote", fullMessage)
                            apiService.ackCommand(TracerApiService.AUTH_TOKEN, cmd.id)
                        }
                    }
                }.onFailure { Log.w(TAG, "Command poll error: ${it.message}") }
            }
        }
    }

    private fun tracerPin(): String {
        val prefs = getSharedPreferences("tracer_config", MODE_PRIVATE)
        return prefs.getString("command_pin", "1234") ?: "1234"
    }

    // --- SIM ---

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
        val trustedNumber = simManager.getTrustedNumber()
        if (trustedNumber.isEmpty()) {
            Log.w(TAG, "No trusted number configured, skipping SIM alert")
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

    // --- Utilidades ---

    private fun getBatteryLevel(): Int {
        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryStatus = registerReceiver(null, filter)
        val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        return if (level >= 0 && scale > 0) (level * 100 / scale) else -1
    }

    private fun readAndroidId(): String =
        Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"

    // --- Notificación discreta ---

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
            .setPriority(NotificationCompat.PRIORITY_MIN)   // Mínima prioridad = sin sonido ni cabecera
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)  // Oculta en pantalla de bloqueo
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }
}
