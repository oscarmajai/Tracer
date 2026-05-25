package com.tracer.app.data

import com.google.gson.annotations.SerializedName

data class LocationTelemetry(
    @SerializedName("device_id")      val deviceId: String,
    @SerializedName("latitude")       val latitude: Double,
    @SerializedName("longitude")      val longitude: Double,
    @SerializedName("battery_level")  val batteryLevel: Int,
    @SerializedName("timestamp")      val timestamp: String,
    @SerializedName("signal_level")   val signalLevel: Int? = null,  // 0-4 (None→Great)
    @SerializedName("device_name")    val deviceName: String? = null,
    @SerializedName("is_charging")    val isCharging: Boolean? = null,
)
