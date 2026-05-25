package com.tracer.app.data

import com.google.gson.annotations.SerializedName

data class CommandResultPayload(
    @SerializedName("result") val result: String,
)
