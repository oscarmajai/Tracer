package com.tracer.app

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.PackageManager.PERMISSION_GRANTED
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.tracer.app.admin.TracerDeviceAdminReceiver
import com.tracer.app.service.TracerLocationService
import com.tracer.app.sim.SimManager
import com.tracer.app.sms.PinManager

class MainActivity : ComponentActivity() {

    private val adminComponent by lazy { ComponentName(this, TracerDeviceAdminReceiver::class.java) }
    private val dpm            by lazy { getSystemService(DevicePolicyManager::class.java) }

    // ── Cadena de permisos ────────────────────────────────────────────────────

    private val locationPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        if (results.values.all { it }) requestBackgroundPermission()
        else Toast.makeText(this, "Permisos de ubicación requeridos", Toast.LENGTH_LONG).show()
    }

    private val backgroundPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { requestSmsPermissions() }

    private val smsPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { requestPhonePermissions() }

    private val phonePermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { requestCallPermissions() }

    private val callPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { requestCameraPermissions() }

    private val cameraPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { startTracerService() }

    private val adminLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { /* estado admin se relee en onResume */ }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { MaterialTheme { SetupScreen() } }
        checkAndRequestPermissions()
    }

    // ── UI ────────────────────────────────────────────────────────────────────

    @Composable
    private fun SetupScreen() {
        val pinManager    = remember { PinManager(this) }
        val simManager    = remember { SimManager(this) }
        val prefs         = remember { getSharedPreferences("tracer_config", MODE_PRIVATE) }

        var pin           by remember { mutableStateOf(pinManager.getPin()) }
        var deviceName    by remember { mutableStateOf(prefs.getString("device_name", "") ?: "") }
        var trustedNumber by remember { mutableStateOf(simManager.getTrustedNumber()) }
        var isAdminActive by remember { mutableStateOf(dpm.isAdminActive(adminComponent)) }
        var showHideDialog by remember { mutableStateOf(false) }

        val lifecycleOwner = LocalLifecycleOwner.current
        DisposableEffect(lifecycleOwner) {
            val obs = LifecycleEventObserver { _, event ->
                if (event == Lifecycle.Event.ON_RESUME)
                    isAdminActive = dpm.isAdminActive(adminComponent)
            }
            lifecycleOwner.lifecycle.addObserver(obs)
            onDispose { lifecycleOwner.lifecycle.removeObserver(obs) }
        }

        if (showHideDialog) {
            AlertDialog(
                onDismissRequest = { showHideDialog = false },
                title   = { Text("Ocultar ícono") },
                text    = { Text("El ícono desaparecerá del launcher.\n\nPara volver a esta pantalla marca *#*#7223#*#* en el teléfono.") },
                confirmButton = {
                    TextButton(onClick = { showHideDialog = false; hideIcon() }) { Text("Ocultar") }
                },
                dismissButton = {
                    TextButton(onClick = { showHideDialog = false }) { Text("Cancelar") }
                }
            )
        }

        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 22.dp)
                    .statusBarsPadding()
                    .navigationBarsPadding()
            ) {
                Spacer(Modifier.height(24.dp))

                Text(
                    "Tracer",
                    style = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.Bold)
                )
                Text(
                    "Configuración",
                    style    = MaterialTheme.typography.bodySmall,
                    color    = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 24.dp)
                )

                // ── Acción rápida ─────────────────────────────────────────
                Button(
                    onClick = {
                        forceLocate()
                        Toast.makeText(this@MainActivity, "Enviando ubicación…", Toast.LENGTH_SHORT).show()
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Enviar ubicación ahora") }

                Spacer(Modifier.height(28.dp))
                HorizontalDivider()
                Spacer(Modifier.height(20.dp))

                // ── PIN ───────────────────────────────────────────────────
                SectionLabel("PIN de comandos SMS")
                OutlinedTextField(
                    value                = pin,
                    onValueChange        = { pin = it },
                    label                = { Text("PIN") },
                    keyboardOptions      = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine           = true,
                    modifier             = Modifier.width(160.dp)
                )
                Spacer(Modifier.height(8.dp))
                Button(onClick = {
                    if (pin.length >= 4) {
                        pinManager.setPin(pin)
                        Toast.makeText(this@MainActivity, "PIN actualizado", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(this@MainActivity, "Mínimo 4 dígitos", Toast.LENGTH_SHORT).show()
                    }
                }) { Text("Guardar PIN") }

                Spacer(Modifier.height(20.dp))

                // ── Nombre del dispositivo ────────────────────────────────
                SectionLabel("Nombre del dispositivo")
                OutlinedTextField(
                    value         = deviceName,
                    onValueChange = { deviceName = it },
                    label         = { Text("Nombre") },
                    placeholder   = { Text("Mi teléfono") },
                    singleLine    = true,
                    modifier      = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                Button(onClick = {
                    prefs.edit().putString("device_name", deviceName.trim()).apply()
                    Toast.makeText(this@MainActivity, "Nombre guardado", Toast.LENGTH_SHORT).show()
                }) { Text("Guardar nombre") }

                Spacer(Modifier.height(20.dp))

                // ── Número de confianza ───────────────────────────────────
                SectionLabel("Número de confianza (alertas SIM)")
                OutlinedTextField(
                    value           = trustedNumber,
                    onValueChange   = { trustedNumber = it },
                    label           = { Text("Teléfono") },
                    placeholder     = { Text("+52 55 1234 5678") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    singleLine      = true,
                    modifier        = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                Button(onClick = {
                    if (trustedNumber.length >= 7) {
                        simManager.setTrustedNumber(trustedNumber)
                        Toast.makeText(this@MainActivity, "Número guardado", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(this@MainActivity, "Número inválido", Toast.LENGTH_SHORT).show()
                    }
                }) { Text("Guardar número") }

                Spacer(Modifier.height(24.dp))
                HorizontalDivider()
                Spacer(Modifier.height(20.dp))

                // ── Bloqueo remoto (admin) ────────────────────────────────
                SectionLabel("Bloqueo remoto (comando LOCK)")
                Text(
                    if (isAdminActive) "● Activo" else "● No activado",
                    color    = if (isAdminActive) Color(0xFF4CAF50) else Color(0xFFF44336),
                    modifier = Modifier.padding(bottom = 8.dp)
                )
                if (!isAdminActive) {
                    Button(onClick = {
                        adminLauncher.launch(
                            Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                                putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
                                putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                                    "Necesario para el comando LOCK")
                            }
                        )
                    }) { Text("Activar permisos de admin") }
                }

                Spacer(Modifier.height(28.dp))
                HorizontalDivider()
                Spacer(Modifier.height(20.dp))

                // ── Ocultar ícono ─────────────────────────────────────────
                OutlinedButton(
                    onClick  = { showHideDialog = true },
                    modifier = Modifier.fillMaxWidth(),
                    colors   = ButtonDefaults.outlinedButtonColors(
                        contentColor = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                ) { Text("Listo — Ocultar ícono del launcher") }

                Spacer(Modifier.height(6.dp))
                Text(
                    "Para volver a esta pantalla: marca *#*#7223#*#*",
                    style    = MaterialTheme.typography.bodySmall,
                    color    = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 36.dp)
                )
            }
        }
    }

    @Composable
    private fun SectionLabel(text: String) {
        Text(
            text,
            style    = MaterialTheme.typography.labelSmall,
            color    = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 8.dp)
        )
    }

    // ── Lógica ────────────────────────────────────────────────────────────────

    private fun hideIcon() {
        packageManager.setComponentEnabledSetting(
            ComponentName(this, "com.tracer.app.MainActivityAlias"),
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP,
        )
        Toast.makeText(this, "Ícono ocultado. Marca *#*#7223#*#* para volver.", Toast.LENGTH_LONG).show()
        finish()
    }

    private fun forceLocate() {
        val intent = Intent(this, TracerLocationService::class.java).apply {
            action = TracerLocationService.ACTION_FORCE_LOCATE
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent)
        else startService(intent)
    }

    // ── Permisos (cadena secuencial) ──────────────────────────────────────────

    private fun checkAndRequestPermissions() {
        val missing = arrayOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        ).filter { ContextCompat.checkSelfPermission(this, it) != PERMISSION_GRANTED }
        if (missing.isEmpty()) requestBackgroundPermission()
        else locationPermLauncher.launch(missing.toTypedArray())
    }

    private fun requestBackgroundPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val granted = ContextCompat.checkSelfPermission(
                this, Manifest.permission.ACCESS_BACKGROUND_LOCATION
            ) == PERMISSION_GRANTED
            if (!granted) {
                backgroundPermLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                return
            }
        }
        requestSmsPermissions()
    }

    private fun requestSmsPermissions() {
        val missing = arrayOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.SEND_SMS)
            .filter { ContextCompat.checkSelfPermission(this, it) != PERMISSION_GRANTED }
        if (missing.isEmpty()) requestPhonePermissions()
        else smsPermLauncher.launch(missing.toTypedArray())
    }

    private fun requestPhonePermissions() {
        val missing = arrayOf(Manifest.permission.READ_PHONE_STATE)
            .filter { ContextCompat.checkSelfPermission(this, it) != PERMISSION_GRANTED }
        if (missing.isEmpty()) requestCallPermissions()
        else phonePermLauncher.launch(missing.toTypedArray())
    }

    private fun requestCallPermissions() {
        val missing = arrayOf(Manifest.permission.CALL_PHONE)
            .filter { ContextCompat.checkSelfPermission(this, it) != PERMISSION_GRANTED }
        if (missing.isEmpty()) requestCameraPermissions()
        else callPermLauncher.launch(missing.toTypedArray())
    }

    private fun requestCameraPermissions() {
        val missing = arrayOf(Manifest.permission.CAMERA)
            .filter { ContextCompat.checkSelfPermission(this, it) != PERMISSION_GRANTED }
        if (missing.isEmpty()) startTracerService()
        else cameraPermLauncher.launch(missing.toTypedArray())
    }

    private fun startTracerService() {
        val intent = Intent(this, TracerLocationService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent)
        else startService(intent)
    }
}
