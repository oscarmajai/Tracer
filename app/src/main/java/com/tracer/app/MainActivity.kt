package com.tracer.app

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.tracer.app.admin.TracerDeviceAdminReceiver
import com.tracer.app.service.TracerLocationService
import com.tracer.app.sim.SimManager
import com.tracer.app.sms.PinManager

class MainActivity : AppCompatActivity() {

    private val adminComponent by lazy { ComponentName(this, TracerDeviceAdminReceiver::class.java) }
    private val dpm by lazy { getSystemService(DevicePolicyManager::class.java) }

    private val adminLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { updateAdminStatus() }

    private val locationPermissions = arrayOf(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
    )

    private val smsPermissions = arrayOf(
        Manifest.permission.RECEIVE_SMS,
        Manifest.permission.SEND_SMS
    )

    private val phonePermissions = arrayOf(
        Manifest.permission.READ_PHONE_STATE
    )

    private val cameraPermissions = arrayOf(
        Manifest.permission.CAMERA
    )

    private val locationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        if (results.values.all { it }) {
            requestBackgroundPermission()
        } else {
            Toast.makeText(this, "Permisos de ubicación requeridos", Toast.LENGTH_LONG).show()
        }
    }

    private val backgroundPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) requestSmsPermissions()
    }

    private val smsPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        if (!results.values.all { it }) {
            Toast.makeText(this, "Sin permisos SMS los comandos no funcionarán", Toast.LENGTH_LONG).show()
        }
        requestPhonePermissions()
    }

    private val phonePermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { _ -> requestCameraPermissions() }

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { _ -> startTracerService() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        setupPinUi()
        setupTrustedNumberUi()
        setupAdminUi()
        checkAndRequestPermissions()
    }

    private fun setupPinUi() {
        val pinManager = PinManager(this)
        val etPin = findViewById<EditText>(R.id.etPin)
        val btnSave = findViewById<Button>(R.id.btnSavePin)

        etPin.setText(pinManager.getPin())

        btnSave.setOnClickListener {
            val newPin = etPin.text.toString().trim()
            if (newPin.length >= 4) {
                pinManager.setPin(newPin)
                Toast.makeText(this, "PIN actualizado", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "El PIN debe tener al menos 4 caracteres", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun checkAndRequestPermissions() {
        val missingLocation = locationPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missingLocation.isEmpty()) {
            requestBackgroundPermission()
        } else {
            locationPermissionLauncher.launch(locationPermissions)
        }
    }

    private fun requestBackgroundPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val bgGranted = ContextCompat.checkSelfPermission(
                this, Manifest.permission.ACCESS_BACKGROUND_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
            if (!bgGranted) {
                backgroundPermissionLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                return
            }
        }
        requestSmsPermissions()
    }

    private fun requestSmsPermissions() {
        val missingSms = smsPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missingSms.isEmpty()) {
            requestPhonePermissions()
        } else {
            smsPermissionLauncher.launch(smsPermissions)
        }
    }

    private fun requestPhonePermissions() {
        val missing = phonePermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) requestCameraPermissions()
        else phonePermissionLauncher.launch(phonePermissions)
    }

    private fun requestCameraPermissions() {
        val missing = cameraPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) startTracerService()
        else cameraPermissionLauncher.launch(cameraPermissions)
    }

    private fun setupTrustedNumberUi() {
        val simManager = SimManager(this)
        val etNumber = findViewById<EditText>(R.id.etTrustedNumber)
        val btnSave = findViewById<Button>(R.id.btnSaveTrustedNumber)

        etNumber.setText(simManager.getTrustedNumber())

        btnSave.setOnClickListener {
            val number = etNumber.text.toString().trim()
            if (number.length >= 7) {
                simManager.setTrustedNumber(number)
                Toast.makeText(this, "Número guardado", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "Ingresa un número válido", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun setupAdminUi() {
        val btnActivate = findViewById<Button>(R.id.btnActivateAdmin)
        updateAdminStatus()
        btnActivate.setOnClickListener {
            val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
                putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "Necesario para el comando LOCK")
            }
            adminLauncher.launch(intent)
        }
    }

    private fun updateAdminStatus() {
        val isActive = dpm.isAdminActive(adminComponent)
        val tvStatus = findViewById<TextView>(R.id.tvAdminStatus)
        val btnActivate = findViewById<Button>(R.id.btnActivateAdmin)
        if (isActive) {
            tvStatus.text = "● Activo"
            tvStatus.setTextColor(getColor(android.R.color.holo_green_dark))
            btnActivate.visibility = View.GONE
        } else {
            tvStatus.text = "● No activado"
            tvStatus.setTextColor(getColor(android.R.color.holo_red_dark))
            btnActivate.visibility = View.VISIBLE
        }
    }

    private fun startTracerService() {
        val intent = Intent(this, TracerLocationService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }
}
