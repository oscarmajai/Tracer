# CLAUDE.md — Tracer

## Proyecto

Tracer es una herramienta de rastreo y control remoto de dispositivos Android 
(localización, comandos remotos, captura de foto/audio, geofencing). Pensada 
para operar de forma silenciosa como servicio del sistema.

+ **Nota de contexto:** este proyecto es un clon personal de Cerberus 
+ (antirrobo por SMS, sin internet). El dispositivo controlado es propiedad 
+ del propio usuario/desarrollador — análogo a "Buscar mi dispositivo" de 
+ Google o "Find My iPhone" pero con más funciones. No está diseñado ni se 
+ usa para monitorear dispositivos de terceros sin su conocimiento.

Contexto y reglas para trabajar en este repositorio. Léelo completo antes de empezar cualquier tarea.

- **Monorepo con tres capas**, cada una con su propio stack:
  - `app/` — **Android** (Kotlin): servicio en segundo plano, comandos por SMS y por polling a la API, CameraX/audio silencioso, device admin, accessibility service.
  - `backend/` — **API** (Go + Fiber): SQLite, REST + WebSocket, además sirve el panel web estático desde `./web`.
  - `web/` — **Panel web** (React por CDN + Babel standalone + Leaflet, **sin build step**): archivos `.jsx` servidos tal cual.
- **Infra:** `docker-compose.yml` (contenedor Go + nginx), `nginx/` de proxy, expuesto vía Cloudflare Tunnel.
- Uso previsto: control de dispositivos **propios** o con autorización. No es para vigilancia de terceros.

## Arquitectura

### `app/` — Android

Organización **por feature/tipo** bajo `app/src/main/java/com/tracer/app/` (la estructura ya existe, respétala):

```
com/tracer/app/
  MainActivity.kt / TracerApp.kt      # Entrada y Application
  BootReceiver.kt                     # Re-arranque tras boot / update
  SecretCodeReceiver.kt               # Código secreto *#*#7223#*#* para reabrir config
  service/TracerLocationService.kt    # Foreground service: ubicación + poller de comandos
  sms/                                # SmsReceiver + CommandHandler + *Manager (Flash, Ring, Vibrate, Pin)
  network/TracerApiService.kt         # Cliente Retrofit contra el backend
  data/                               # Payloads / records (DTOs)
  camera/                             # PhotoCapture, AudioRecorder (silenciosos)
  accessibility/                      # TracerAccessibilityService (SCREENSHOT)
  admin/                              # TracerDeviceAdminReceiver (LOCK/WIPE)
  sim/SimManager.kt                   # Detección de cambio de SIM
```

Reglas:
- **Todo comando remoto (API o SMS) se despacha en `sms/CommandHandler.kt`** con el patrón `when (command) -> handleX(...)`. Al añadir un comando: nueva rama en el `when`, nueva función `handleX`, y si necesita permiso, declararlo en `AndroidManifest.xml`.
- El polling de comandos de la API vive en `TracerLocationService` (command poller). Los resultados se reportan con `POST /api/command/:id/result`.
- La red pasa siempre por `network/TracerApiService.kt` (Retrofit). No hacer HTTP a mano en otras clases.
- `BuildConfig.TRACER_BASE_URL` y `TRACER_AUTH_TOKEN` salen de `app/local.properties` (no versionado). No hardcodear URLs ni tokens.
- Coroutines para todo lo asíncrono. Nada de `AsyncTask` ni hilos crudos.

### `backend/` — Go + Fiber

- **Un solo archivo:** `backend/main.go`. Secciones marcadas con comentarios `// ── ... ──`. Mantener ese estilo; no fragmentar en paquetes salvo que el usuario lo pida.
- Capas dentro del archivo: `loadConfig` → `initDatabase` → hub WebSocket → middlewares → handlers HTTP (`postLocation`, `postCommand`, ...) → `main`.
- **Auth:** `POST /api/login` (público, valida `TRACER_USERNAME`/`TRACER_PASSWORD`, devuelve el token). El resto de `/api/*` exige `Authorization: Bearer <TRACER_API_TOKEN>`. El WebSocket `/ws` autentica por `?token=` (los browsers no pueden mandar headers en WS).
- **Eventos WS** (broadcast a todos los clientes): `location`, `cmd_result`, `photo`, `geofence_breach`, `alert`.
- Escrituras de ubicación pasan por un worker con canal (`writeCh` / `startWriteWorker`).

Endpoints REST (`/api`, todos autenticados salvo login):

```
POST   /api/login                       # público → token
POST   /api/location                    GET /api/location/latest   GET /api/location/history?limit=N
POST   /api/command                     GET /api/command/pending   GET /api/command/history?limit=N
POST   /api/command/:id/ack             POST /api/command/:id/result
POST   /api/photo                       GET /api/photo/latest      GET /api/photo/list   GET /api/photo/file/:filename
POST   /api/audio                       GET /api/audio/list        GET /api/audio/file/:filename
GET    /api/geofence                    POST /api/geofence         DELETE /api/geofence
POST   /api/alert
GET    /ws?token=...                    # WebSocket
```

### `web/` — Panel React sin build

- **No hay bundler.** `web/index.html` carga React 18, Babel standalone y Leaflet por CDN, y luego los `.jsx` en orden. Al añadir un archivo `.jsx` nuevo hay que **registrarlo en `index.html`** en el punto correcto del orden de carga.
- Los componentes se comunican por globales `window.tracer*` (p. ej. `window.tracerApiFetch`, `window.tracerDeviceIcon`), no por imports ES.

```
web/
  index.html            # entrada + carga de CDNs y JSX (mantener orden)
  tweaks-panel.jsx      # panel de ajustes de UI — NO modificar
  src/
    data.jsx            # capa API: expone window.tracerApiFetch y helpers
    app.jsx             # estado principal, WebSocket, refresh loop, despacho de comandos
    login.jsx           # login contra /api/login
    shell.jsx           # sidebar (dispositivos, logout)
    mapview.jsx         # mapa Leaflet real
    views.jsx           # Devices / History / Notifications / Settings
    activity.jsx        # historial de comandos
    modals.jsx          # Ring, Lost (LOCK), Wipe
    advanced-modals.jsx # Photo, Audio, Screen, Message, Geofence, ...
    map.jsx             # mapa SVG decorativo (fondo de modales/historial)
    icons.jsx           # íconos SVG (define window.tracerDeviceIcon)
  styles/               # tokens.css + una hoja por zona (shell, map, modals, views, commands)
```

Mapeo de comandos UI → backend (los nombres del backend viajan a Android):
`ring→RING · lost→LOCK · wipe→WIPE · photo→PHOTO · audio→AUDIO · screen→SCREENSHOT · silent-call→SILENT_CALL · flash→FLASH · vibrate→VIBRATE · gps→GPS_HIGH · locate→LOCATE · callback→CALLBACK · message→MESSAGE · stealth→STEALTH · apps→BLOCK_APPS · key→RESET_PIN`

Toggles (no en el mapa anterior): `alert→ALERT_ON/ALERT_OFF · keyguard→KEYGUARD_ON/KEYGUARD_OFF`. Variantes de parada: `RING_STOP · FLASH_STOP · VIBRATE_STOP`.

`GEO_BREACH` es un pseudo-comando: lo inserta el backend en `commands` cuando `checkGeofence` detecta salida de la zona; Android lo ejecuta (`handleGeoBreach`) y reporta resultado como cualquier otro.

La **geocerca no es un comando**: la web la gestiona con `GET/POST/DELETE /api/geofence` (estado en el backend, evaluación en `checkGeofence`). El dispositivo solo recibe el `GEO_BREACH` resultante.

## Base de datos

- **SQLite** (`mattn/go-sqlite3`, CGO), archivo `TRACER_DB_FILE` (por defecto `./telemetry.db`, en Docker `/data/telemetry.db`).
- Esquema creado con `CREATE TABLE IF NOT EXISTS` en `initDatabase()` (`backend/main.go`). Tablas: `locations`, `commands`, `geofence`.
- No hay herramienta de migraciones: si cambias el esquema, actualiza el `CREATE TABLE` y, si hace falta migrar datos existentes, coméntalo antes.
- Usa siempre **queries parametrizadas** (`?`). Nunca interpolar valores en el SQL.
- Los `.db`, `.db-shm`, `.db-wal` **no deberían** estar versionados con cambios; ignóralos, no los commitees.

## Configuración y secretos

- Backend/infra: variables en `.env` (ver `.env.example`, ya en `.gitignore`). `TRACER_USERNAME`, `TRACER_PASSWORD`, `TRACER_API_TOKEN`, `PORT`. Mantén `.env.example` al día al añadir una variable.
- Android: `app/local.properties` (ignorado) para `tracer.base.url` y `tracer.auth.token`.
- **Nunca hardcodear** credenciales, tokens ni URLs de producción en el código. Nunca commitear `.env` ni `local.properties`.

## Convenciones de código

### Kotlin (`app/`)
- `PascalCase` para clases y archivos de clase; `camelCase` para funciones, variables y propiedades; `UPPER_SNAKE_CASE` para constantes.
- Nombres de comando en `MAYÚSCULAS_CON_GUION_BAJO` (deben coincidir con lo que envía el backend).
- Coroutines + `suspend` para I/O. Manejo explícito de permisos runtime.

### Go (`backend/`)
- `gofmt` obligatorio. Handlers `postX` / `getX` / `deleteX`. Errores devueltos como JSON `{"error": "..."}` con el status adecuado.
- Mantén el estilo de archivo único con secciones comentadas.

### JSX (`web/`)
- Componentes en `PascalCase`; helpers en `camelCase`. Sin JSX-transform en build: todo corre por Babel standalone en el navegador, así que **no uses sintaxis que Babel standalone no soporte** ni imports de módulos.
- Globales compartidas con prefijo `window.tracer*`.

## Git — MUY IMPORTANTE

### Push
- **No hagas `git push` por tu cuenta.** Solo pushea cuando el usuario te lo pida explícitamente en ese momento.
- **Nunca pushees a `main`.**
- Si no te han pedido push, tu trabajo termina en el commit local: di qué ramas y commits dejaste listos.

### Git Flow
- `main`: producción. No se toca directamente.
- `develop`: rama de integración. Las ramas de trabajo salen de `develop` y vuelven a `develop` por Pull Request (`gh pr create` → `gh pr merge`), no con merges locales.
- Ramas de trabajo:
  - `feature/<descripcion-corta>` para nuevas funcionalidades.
  - `fix/<descripcion-corta>` para correcciones sobre `develop`.
  - `hotfix/<descripcion>` solo para urgencias sobre `main` (pedir confirmación antes).
- Antes de crear una rama, parte de `develop` actualizado.
- Antes de mergear un PR, actualiza la rama con `develop` (merge de `develop` hacia la feature branch, resuelve conflictos ahí) para que el PR quede limpio.

### Commits — Conventional Commits
- Formato: `<tipo>: <descripción en imperativo>`.
- Tipos permitidos: `feat`, `fix`, `chore`, `refactor`, `docs`, `style`, `test`, `perf`, `build`, `ci`, `revert`.
- **Sin scopes.** Descripción en minúscula, imperativo, sin punto final.
- Haz commits **frecuentes y atómicos**: uno por unidad lógica de trabajo terminada.
- Elige el tipo según lo que hizo el commit (no marques todo como `feat`).
- No commitees artefactos de build (`app/build/`, `app/.gradle/`, `backend/tracer-backend`, `*.db*`).

## Calidad — antes de cada commit

- **Android:** `./gradlew assembleDebug` (desde `app/`) debe compilar. Corre `./gradlew lint` si tocaste algo sensible.
- **Backend:** `gofmt -l .` sin salida, `go vet ./...` y `go build ./...` limpios (desde `backend/`).
- **Web:** carga `web/index.html` y comprueba que no haya errores en consola (el `window.onerror` de `index.html` los muestra en pantalla).

**Si algo falla, NO hagas commit.** Arréglalo primero; si no puedes, detente y avísame.

> Nota: aún no hay linters/tests formales configurados en el repo. Si un comando no existe todavía, avísame en lugar de inventarlo.

## Cómo ejecutar

- **Stack completo:** `docker compose up --build` (necesita `.env`). nginx queda en el puerto del mapeo de `docker-compose.yml`, y proxya a `tracer-api:3000`.
- **Backend solo (dev):** desde `backend/`, `go run main.go` (sirve API + `../web` en `:3000`). Requiere las env vars o usa los defaults.
- **Web:** se sirve desde el backend Go (`app.Static("/", "./web")`); no se abre suelto salvo con un server estático apuntando a `web/`.
- **Android:** abrir `app/` en Android Studio o `./gradlew installDebug` con un dispositivo/emulador y `local.properties` configurado.

## Flujo de trabajo esperado

1. Para tareas no triviales, **explica tu plan** y espera mi visto bueno antes de escribir código.
2. Una tarea a la vez, enfocado. Deja claro en qué capa (`app/`, `backend/`, `web/`) estás trabajando.
3. Crea la rama correcta desde `develop` antes de empezar.
4. Implementa en incrementos pequeños y revisables.
5. Un cambio de comando suele tocar las tres capas: backend (endpoint/constante) → Android (`CommandHandler`) → web (modal + mapeo). Mantenlas coherentes.
6. Corre las verificaciones de Calidad → commit (conventional) → repite.
7. Al terminar, dime qué ramas y commits dejaste listos. Pushea solo si te lo pedí.
8. Para integrar: abre PR a `develop` con `gh` cuando te lo pida.
