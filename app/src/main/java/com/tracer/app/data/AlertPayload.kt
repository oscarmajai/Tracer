package com.tracer.app.data

data class AlertPayload(
    val type: String,
    val message: String = "",
    val lat: Double? = null,
    val lon: Double? = null,
    val battery: Int? = null,
    val signal: Int? = null,
    val device_id: String? = null,
    val attempt_num: Int? = null,
)
