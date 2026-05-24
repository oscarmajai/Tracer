package com.tracer.app.network

import com.tracer.app.data.CommandRecord
import com.tracer.app.data.LocationTelemetry
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.RequestBody
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path

interface TracerApiService {

    @POST("api/location")
    suspend fun postLocation(
        @Header("Authorization") token: String,
        @Body payload: LocationTelemetry
    ): retrofit2.Response<Unit>

    @GET("api/command/pending")
    suspend fun getPendingCommands(
        @Header("Authorization") token: String
    ): retrofit2.Response<List<CommandRecord>>

    @POST("api/command/{id}/ack")
    suspend fun ackCommand(
        @Header("Authorization") token: String,
        @Path("id") id: Long
    ): retrofit2.Response<Unit>

    @Multipart
    @POST("api/photo")
    suspend fun uploadPhoto(
        @Header("Authorization") token: String,
        @Part("device_id") deviceId: RequestBody,
        @Part photo: MultipartBody.Part
    ): retrofit2.Response<Unit>

    companion object {
        // Cambiar a la IP/dominio real del servidor antes de instalar en el dispositivo.
        // En emulador: http://10.0.2.2:3000/
        const val BASE_URL = "http://10.0.2.2:3000/"
        const val AUTH_TOKEN = "Bearer TracerSecretToken123"

        fun create(): TracerApiService {
            val client = OkHttpClient.Builder()
                .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .build()

            return Retrofit.Builder()
                .baseUrl(BASE_URL)
                .client(client)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
                .create(TracerApiService::class.java)
        }
    }
}
