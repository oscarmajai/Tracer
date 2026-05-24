package com.tracer.app.data

import com.google.gson.annotations.SerializedName

data class CommandRecord(
    @SerializedName("id")          val id: Long,
    @SerializedName("command")     val command: String,
    @SerializedName("args")        val args: String = "",
    @SerializedName("status")      val status: String,
    @SerializedName("created_at")  val createdAt: String
)
