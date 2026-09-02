package main

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	fiberws "github.com/gofiber/websocket/v2"
	_ "github.com/mattn/go-sqlite3"
)

// ── Config ────────────────────────────────────────────────────────────────────

type Config struct {
	APIToken  string
	DBFile    string
	PhotosDir string
	AudioDir  string
	Port      string
	Username  string
	Password  string
}

var (
	cfg     Config
	db      *sql.DB
	writeCh chan LocationPayload
)

func loadConfig() Config {
	loadDotEnv(".env", "../.env")
	return Config{
		APIToken:  mustEnv("TRACER_API_TOKEN"),
		DBFile:    getEnv("TRACER_DB_FILE", "./telemetry.db"),
		PhotosDir: getEnv("TRACER_PHOTOS_DIR", "./photos"),
		AudioDir:  getEnv("TRACER_AUDIO_DIR", "./audio"),
		Port:      getEnv("PORT", "3000"),
		Username:  mustEnv("TRACER_USERNAME"),
		Password:  mustEnv("TRACER_PASSWORD"),
	}
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// mustEnv devuelve la variable de entorno o aborta si falta/está vacía.
// Se usa para secretos: nunca hay valor por defecto.
func mustEnv(key string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		log.Fatalf("falta la variable de entorno obligatoria %s (definila en .env o en el entorno)", key)
	}
	return v
}

// loadDotEnv carga el primer archivo .env que exista de la lista, sin pisar
// variables que ya estén definidas en el entorno. Formato: KEY=VALUE por línea,
// admite comentarios con # y comillas simples/dobles alrededor del valor.
func loadDotEnv(paths ...string) {
	for _, path := range paths {
		f, err := os.Open(path)
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			key, val, ok := strings.Cut(line, "=")
			if !ok {
				continue
			}
			key = strings.TrimSpace(key)
			val = strings.TrimSpace(val)
			val = strings.Trim(val, `"'`)
			if key == "" {
				continue
			}
			if _, exists := os.LookupEnv(key); !exists {
				_ = os.Setenv(key, val)
			}
		}
		f.Close()
		log.Printf("config: cargado %s", path)
		return
	}
}

// ── WebSocket Hub ─────────────────────────────────────────────────────────────

type wsClient struct {
	conn *fiberws.Conn
	mu   sync.Mutex
}

func (c *wsClient) send(data []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	_ = c.conn.WriteMessage(fiberws.TextMessage, data)
}

var (
	hub   []*wsClient
	hubMu sync.RWMutex
)

func hubAdd(c *wsClient) {
	hubMu.Lock()
	hub = append(hub, c)
	hubMu.Unlock()
}

func hubRemove(c *wsClient) {
	hubMu.Lock()
	for i, cl := range hub {
		if cl == c {
			hub = append(hub[:i], hub[i+1:]...)
			break
		}
	}
	hubMu.Unlock()
}

func broadcast(eventType string, payload interface{}) {
	msg, err := json.Marshal(map[string]interface{}{"type": eventType, "data": payload})
	if err != nil {
		return
	}
	hubMu.RLock()
	clients := make([]*wsClient, len(hub))
	copy(clients, hub)
	hubMu.RUnlock()
	for _, c := range clients {
		c.send(msg)
	}
}

// ── Types ─────────────────────────────────────────────────────────────────────

type LocationPayload struct {
	DeviceID     string  `json:"device_id"`
	Latitude     float64 `json:"latitude"`
	Longitude    float64 `json:"longitude"`
	BatteryLevel int     `json:"battery_level"`
	Timestamp    string  `json:"timestamp"`
	SignalLevel  *int    `json:"signal_level,omitempty"`
	DeviceName   string  `json:"device_name,omitempty"`
	IsCharging   *bool   `json:"is_charging,omitempty"`
}

type LocationRecord struct {
	ID           int64   `json:"id"`
	DeviceID     string  `json:"device_id"`
	Latitude     float64 `json:"latitude"`
	Longitude    float64 `json:"longitude"`
	BatteryLevel int     `json:"battery_level"`
	Timestamp    string  `json:"timestamp"`
	SignalLevel  *int    `json:"signal_level,omitempty"`
	DeviceName   string  `json:"device_name,omitempty"`
	IsCharging   bool    `json:"is_charging"`
	LastPollAt   string  `json:"last_poll_at,omitempty"`
}

// Última vez que el dispositivo hizo poll de comandos (cualquier request autenticado)
var (
	lastPollMu sync.Mutex
	lastPollAt time.Time
)

func recordDevicePoll() {
	lastPollMu.Lock()
	lastPollAt = time.Now().UTC()
	lastPollMu.Unlock()
}

func getLastPollAt() string {
	lastPollMu.Lock()
	t := lastPollAt
	lastPollMu.Unlock()
	if t.IsZero() {
		return ""
	}
	return t.Format(time.RFC3339)
}

type CommandPayload struct {
	Command string `json:"command"`
	Args    string `json:"args,omitempty"`
}

type CommandRecord struct {
	ID         int64   `json:"id"`
	Command    string  `json:"command"`
	Args       string  `json:"args"`
	Status     string  `json:"status"`
	Result     string  `json:"result,omitempty"`
	CreatedAt  string  `json:"created_at"`
	ExecutedAt *string `json:"executed_at,omitempty"`
}

type Geofence struct {
	Lat     float64 `json:"lat"`
	Lon     float64 `json:"lon"`
	Radius  float64 `json:"radius"`
	Enabled bool    `json:"enabled"`
}

type PhotoInfo struct {
	Filename  string `json:"filename"`
	Timestamp string `json:"timestamp"`
}

type AlertPayload struct {
	Type       string   `json:"type"`
	Message    string   `json:"message,omitempty"`
	Lat        *float64 `json:"lat,omitempty"`
	Lon        *float64 `json:"lon,omitempty"`
	Battery    *int     `json:"battery,omitempty"`
	Signal     *int     `json:"signal,omitempty"`
	DeviceID   string   `json:"device_id,omitempty"`
	AttemptNum *int     `json:"attempt_num,omitempty"`
}

var validFilename = regexp.MustCompile(`^[a-zA-Z0-9_.\-]+\.jpg$`)
var validAudioFilename = regexp.MustCompile(`^[a-zA-Z0-9_.\-]+\.m4a$`)

// ── Database ──────────────────────────────────────────────────────────────────

func initDatabase() {
	var err error
	db, err = sql.Open("sqlite3", cfg.DBFile)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	db.SetMaxOpenConns(1)

	stmts := []string{
		`PRAGMA journal_mode=WAL`,
		`PRAGMA busy_timeout=5000`,
		`CREATE TABLE IF NOT EXISTS locations (
			id            INTEGER PRIMARY KEY AUTOINCREMENT,
			device_id     TEXT    NOT NULL,
			latitude      REAL    NOT NULL,
			longitude     REAL    NOT NULL,
			battery_level INTEGER NOT NULL,
			timestamp     TEXT    NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS commands (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			command     TEXT NOT NULL,
			args        TEXT NOT NULL DEFAULT '',
			status      TEXT NOT NULL DEFAULT 'pending',
			created_at  TEXT NOT NULL,
			executed_at TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS geofence (
			id          INTEGER PRIMARY KEY,
			lat         REAL NOT NULL,
			lon         REAL NOT NULL,
			radius      REAL NOT NULL DEFAULT 500,
			enabled     INTEGER NOT NULL DEFAULT 1,
			last_inside INTEGER NOT NULL DEFAULT 1
		)`,
		`CREATE TABLE IF NOT EXISTS alerts (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			type        TEXT NOT NULL,
			message     TEXT NOT NULL DEFAULT '',
			lat         REAL,
			lon         REAL,
			battery     INTEGER,
			signal      INTEGER,
			device_id   TEXT NOT NULL DEFAULT '',
			attempt_num INTEGER,
			created_at  TEXT NOT NULL
		)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			log.Fatalf("db init: %v — stmt: %.40s", err, s)
		}
	}

	// Migraciones idempotentes — ignoran el error "duplicate column name"
	migrations := []string{
		`ALTER TABLE locations ADD COLUMN signal_level INTEGER`,
		`ALTER TABLE locations ADD COLUMN device_name  TEXT    DEFAULT ''`,
		`ALTER TABLE locations ADD COLUMN is_charging  INTEGER DEFAULT 0`,
		`ALTER TABLE commands  ADD COLUMN result       TEXT    DEFAULT ''`,
		`ALTER TABLE commands  ADD COLUMN dispatched_at TEXT`,
	}
	for _, s := range migrations {
		if _, err := db.Exec(s); err != nil && !strings.Contains(err.Error(), "duplicate column name") {
			log.Fatalf("db migration: %v — %s", err, s)
		}
	}

	if err := os.MkdirAll(cfg.PhotosDir, 0755); err != nil {
		log.Fatalf("failed to create photos dir: %v", err)
	}
	log.Println("database initialized")
}

// startWriteWorker serializa inserts de ubicación y emite broadcast WebSocket tras cada insert.
func startWriteWorker() {
	writeCh = make(chan LocationPayload, 256)
	go func() {
		for p := range writeCh {
			isChargingInt := 0
			if p.IsCharging != nil && *p.IsCharging {
				isChargingInt = 1
			}
			result, err := db.Exec(
				`INSERT INTO locations
				 (device_id, latitude, longitude, battery_level, timestamp, signal_level, device_name, is_charging)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				p.DeviceID, p.Latitude, p.Longitude, p.BatteryLevel,
				p.Timestamp, p.SignalLevel, p.DeviceName, isChargingInt,
			)
			if err != nil {
				log.Printf("db insert error: %v", err)
				continue
			}
			id, _ := result.LastInsertId()
			rec := LocationRecord{
				ID:           id,
				DeviceID:     p.DeviceID,
				Latitude:     p.Latitude,
				Longitude:    p.Longitude,
				BatteryLevel: p.BatteryLevel,
				Timestamp:    p.Timestamp,
				SignalLevel:  p.SignalLevel,
				DeviceName:   p.DeviceName,
				IsCharging:   isChargingInt != 0,
			}
			broadcast("location", rec)
			go checkGeofence(p.Latitude, p.Longitude)
		}
	}()
}

// ── Auth ──────────────────────────────────────────────────────────────────────

func postLogin(c *fiber.Ctx) error {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Username != cfg.Username || body.Password != cfg.Password {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid credentials"})
	}
	return c.JSON(fiber.Map{"token": cfg.APIToken})
}

func authMiddleware(c *fiber.Ctx) error {
	if c.Get("Authorization") != "Bearer "+cfg.APIToken {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	return c.Next()
}

// ── Location handlers ─────────────────────────────────────────────────────────

func postLocation(c *fiber.Ctx) error {
	var payload LocationPayload
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	if payload.Timestamp == "" {
		payload.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}
	recordDevicePoll()
	writeCh <- payload
	return c.SendStatus(fiber.StatusOK)
}

func scanLocation(row interface {
	Scan(dest ...interface{}) error
}) (LocationRecord, error) {
	var r LocationRecord
	var signalLevel sql.NullInt64
	var deviceName sql.NullString
	var isChargingInt int
	err := row.Scan(
		&r.ID, &r.DeviceID, &r.Latitude, &r.Longitude,
		&r.BatteryLevel, &r.Timestamp,
		&signalLevel, &deviceName, &isChargingInt,
	)
	if err != nil {
		return r, err
	}
	if signalLevel.Valid {
		v := int(signalLevel.Int64)
		r.SignalLevel = &v
	}
	r.DeviceName = deviceName.String
	r.IsCharging = isChargingInt != 0
	return r, nil
}

func getLatestLocation(c *fiber.Ctx) error {
	row := db.QueryRow(`
		SELECT id, device_id, latitude, longitude, battery_level, timestamp,
		       signal_level, device_name, is_charging
		FROM locations ORDER BY id DESC LIMIT 1
	`)
	r, err := scanLocation(row)
	if err == sql.ErrNoRows {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "no records found"})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	r.LastPollAt = getLastPollAt()
	return c.JSON(r)
}

func getLocationHistory(c *fiber.Ctx) error {
	limit := c.QueryInt("limit", 50)
	if limit < 1 {
		limit = 1
	}
	if limit > 500 {
		limit = 500
	}
	rows, err := db.Query(`
		SELECT id, device_id, latitude, longitude, battery_level, timestamp,
		       signal_level, device_name, is_charging
		FROM locations ORDER BY id DESC LIMIT ?
	`, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	defer rows.Close()

	records := make([]LocationRecord, 0)
	for rows.Next() {
		r, err := scanLocation(rows)
		if err != nil {
			continue
		}
		records = append(records, r)
	}
	return c.JSON(records)
}

// ── Command handlers ──────────────────────────────────────────────────────────

func postCommand(c *fiber.Ctx) error {
	var payload CommandPayload
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	if payload.Command == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "command required"})
	}
	result, err := db.Exec(
		`INSERT INTO commands (command, args, status, created_at) VALUES (?, ?, 'pending', ?)`,
		payload.Command, payload.Args, time.Now().UTC().Format(time.RFC3339),
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	id, _ := result.LastInsertId()
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": id, "status": "pending"})
}

// commandDispatchTTL: tiempo máximo que un comando puede quedar en estado
// 'dispatched' sin resultado antes de volver a 'pending' para reintentarlo
// (p. ej. si la app se reinició a mitad de una captura de audio/foto).
const commandDispatchTTL = 10 * time.Minute

func getPendingCommands(c *fiber.Ctx) error {
	recordDevicePoll()

	// Re-armar comandos despachados que llevan demasiado tiempo sin resultado.
	staleBefore := time.Now().UTC().Add(-commandDispatchTTL).Format(time.RFC3339)
	if _, err := db.Exec(
		`UPDATE commands SET status='pending', dispatched_at=NULL
		 WHERE status='dispatched' AND (dispatched_at IS NULL OR dispatched_at < ?)`,
		staleBefore,
	); err != nil {
		log.Printf("re-arm dispatched: %v", err)
	}

	rows, err := db.Query(`
		SELECT id, command, args, status, created_at
		FROM commands WHERE status = 'pending' ORDER BY id ASC
	`)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	commands := make([]CommandRecord, 0)
	ids := make([]interface{}, 0)
	for rows.Next() {
		var r CommandRecord
		if err := rows.Scan(&r.ID, &r.Command, &r.Args, &r.Status, &r.CreatedAt); err != nil {
			continue
		}
		commands = append(commands, r)
		ids = append(ids, r.ID)
	}
	rows.Close() // cerrar antes del UPDATE: SetMaxOpenConns(1)

	// Marcar como 'dispatched' para no re-entregarlos en el siguiente poll.
	if len(ids) > 0 {
		now := time.Now().UTC().Format(time.RFC3339)
		placeholders := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
		args := append([]interface{}{now}, ids...)
		if _, err := db.Exec(
			`UPDATE commands SET status='dispatched', dispatched_at=? WHERE id IN (`+placeholders+`)`,
			args...,
		); err != nil {
			log.Printf("mark dispatched: %v", err)
		}
	}
	return c.JSON(commands)
}

func getCommandHistory(c *fiber.Ctx) error {
	limit := c.QueryInt("limit", 10)
	if limit < 1 {
		limit = 1
	}
	if limit > 100 {
		limit = 100
	}
	rows, err := db.Query(`
		SELECT id, command, args, status, COALESCE(result,''), created_at, executed_at
		FROM commands ORDER BY id DESC LIMIT ?
	`, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	defer rows.Close()

	commands := make([]CommandRecord, 0)
	for rows.Next() {
		var r CommandRecord
		var executedAt sql.NullString
		if err := rows.Scan(&r.ID, &r.Command, &r.Args, &r.Status, &r.Result, &r.CreatedAt, &executedAt); err != nil {
			continue
		}
		if executedAt.Valid {
			r.ExecutedAt = &executedAt.String
		}
		commands = append(commands, r)
	}
	return c.JSON(commands)
}

// postCommandResult: la app reporta el resultado de un comando ejecutado.
// Marca el comando como ejecutado y hace broadcast WebSocket a la web.
func postCommandResult(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id"})
	}
	var body struct {
		Result string `json:"result"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}

	now := time.Now().UTC().Format(time.RFC3339)
	res, err := db.Exec(
		`UPDATE commands SET status='executed', executed_at=?, result=?
		 WHERE id=? AND status IN ('pending', 'dispatched')`,
		now, body.Result, id,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found or already executed"})
	}

	go broadcast("cmd_result", fiber.Map{
		"id":          id,
		"result":      body.Result,
		"executed_at": now,
	})
	return c.SendStatus(fiber.StatusOK)
}

// ackCommand: la app confirma que recibió el comando y lo va a ejecutar.
// Lo pasa a 'dispatched' (no 'executed'): el resultado real llega luego por
// POST /api/command/:id/result. Sirve para que un comando asíncrono (foto,
// audio) no se re-entregue en el siguiente poll.
func ackCommand(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id"})
	}
	result, err := db.Exec(
		`UPDATE commands SET status='dispatched', dispatched_at=?
		 WHERE id=? AND status IN ('pending', 'dispatched')`,
		time.Now().UTC().Format(time.RFC3339), id,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "command not found or already executed"})
	}
	return c.SendStatus(fiber.StatusOK)
}

// ── Geofence ──────────────────────────────────────────────────────────────────

func haversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000
	φ1 := lat1 * math.Pi / 180
	φ2 := lat2 * math.Pi / 180
	dφ := (lat2 - lat1) * math.Pi / 180
	dλ := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dφ/2)*math.Sin(dφ/2) + math.Cos(φ1)*math.Cos(φ2)*math.Sin(dλ/2)*math.Sin(dλ/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func checkGeofence(lat, lon float64) {
	var id, enabled, lastInside int
	var gfLat, gfLon, radius float64
	err := db.QueryRow(`SELECT id, lat, lon, radius, enabled, last_inside FROM geofence WHERE id=1`).
		Scan(&id, &gfLat, &gfLon, &radius, &enabled, &lastInside)
	if err != nil || enabled == 0 {
		return
	}
	dist := haversineDistance(lat, lon, gfLat, gfLon)
	inside := dist <= radius

	if lastInside == 1 && !inside {
		if _, err := db.Exec(`UPDATE geofence SET last_inside=0 WHERE id=1`); err != nil {
			return
		}
		now := time.Now().UTC().Format(time.RFC3339)
		res, err := db.Exec(`INSERT INTO commands (command, args, status, created_at) VALUES ('GEO_BREACH', '', 'pending', ?)`, now)
		if err == nil {
			cmdID, _ := res.LastInsertId()
			broadcast("geofence_breach", fiber.Map{"lat": lat, "lon": lon, "distance": dist, "cmd_id": cmdID})
		}
		log.Printf("geofence breach: %.6f,%.6f dist=%.0fm", lat, lon, dist)
	} else if lastInside == 0 && inside {
		db.Exec(`UPDATE geofence SET last_inside=1 WHERE id=1`)
		broadcast("geofence_enter", fiber.Map{"lat": lat, "lon": lon})
	}
}

func getGeofence(c *fiber.Ctx) error {
	var gf Geofence
	var enabled int
	err := db.QueryRow(`SELECT lat, lon, radius, enabled FROM geofence WHERE id=1`).
		Scan(&gf.Lat, &gf.Lon, &gf.Radius, &enabled)
	if err == sql.ErrNoRows {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "no geofence"})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	gf.Enabled = enabled != 0
	return c.JSON(gf)
}

func postGeofence(c *fiber.Ctx) error {
	var gf Geofence
	if err := c.BodyParser(&gf); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	if gf.Radius <= 0 {
		gf.Radius = 500
	}
	enabledInt := 0
	if gf.Enabled {
		enabledInt = 1
	}
	_, err := db.Exec(`
		INSERT INTO geofence (id, lat, lon, radius, enabled, last_inside)
		VALUES (1, ?, ?, ?, ?, 1)
		ON CONFLICT(id) DO UPDATE SET lat=excluded.lat, lon=excluded.lon,
		    radius=excluded.radius, enabled=excluded.enabled, last_inside=1
	`, gf.Lat, gf.Lon, gf.Radius, enabledInt)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	return c.JSON(gf)
}

func deleteGeofence(c *fiber.Ctx) error {
	db.Exec(`DELETE FROM geofence WHERE id=1`)
	return c.SendStatus(fiber.StatusNoContent)
}

// ── Photo handlers ────────────────────────────────────────────────────────────

func postPhoto(c *fiber.Ctx) error {
	deviceID := c.FormValue("device_id", "unknown")
	file, err := c.FormFile("photo")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "no photo file"})
	}

	filename := fmt.Sprintf("%s_%d.jpg", deviceID, time.Now().UnixMilli())
	path := fmt.Sprintf("%s/%s", cfg.PhotosDir, filename)
	if err := c.SaveFile(file, path); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "save failed"})
	}

	ts := time.Now().UTC().Format(time.RFC3339)
	log.Printf("photo saved: %s", filename)
	go broadcast("photo", fiber.Map{"filename": filename, "timestamp": ts})
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"filename": filename, "timestamp": ts})
}

func getLatestPhoto(c *fiber.Ctx) error {
	entries, err := os.ReadDir(cfg.PhotosDir)
	if err != nil || len(entries) == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "no photos"})
	}

	var latestName string
	var latestMod time.Time
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".jpg") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if latestName == "" || info.ModTime().After(latestMod) {
			latestName = e.Name()
			latestMod = info.ModTime()
		}
	}
	if latestName == "" {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "no photos"})
	}
	return c.SendFile(fmt.Sprintf("%s/%s", cfg.PhotosDir, latestName))
}

func getPhotoList(c *fiber.Ctx) error {
	limit := c.QueryInt("limit", 6)
	if limit < 1 {
		limit = 1
	}
	if limit > 20 {
		limit = 20
	}
	entries, err := os.ReadDir(cfg.PhotosDir)
	if err != nil {
		return c.JSON([]PhotoInfo{})
	}
	var infos []PhotoInfo
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".jpg") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		infos = append(infos, PhotoInfo{
			Filename:  e.Name(),
			Timestamp: info.ModTime().UTC().Format(time.RFC3339),
		})
	}
	sort.Slice(infos, func(i, j int) bool {
		return infos[i].Timestamp > infos[j].Timestamp
	})
	if len(infos) > limit {
		infos = infos[:limit]
	}
	if infos == nil {
		infos = []PhotoInfo{}
	}
	return c.JSON(infos)
}

// ── Audio handlers ────────────────────────────────────────────────────────────

func postAudio(c *fiber.Ctx) error {
	deviceID := c.FormValue("device_id", "unknown")
	file, err := c.FormFile("audio")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "no audio file"})
	}

	if err := os.MkdirAll(cfg.AudioDir, 0755); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "audio dir error"})
	}

	filename := fmt.Sprintf("%s_%d.m4a", deviceID, time.Now().UnixMilli())
	path := fmt.Sprintf("%s/%s", cfg.AudioDir, filename)
	if err := c.SaveFile(file, path); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "save failed"})
	}

	ts := time.Now().UTC().Format(time.RFC3339)
	log.Printf("audio saved: %s", filename)
	go broadcast("audio", fiber.Map{"filename": filename, "timestamp": ts})
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"filename": filename, "timestamp": ts})
}

func getAudioList(c *fiber.Ctx) error {
	limit := c.QueryInt("limit", 10)
	if limit < 1 {
		limit = 1
	}
	if limit > 50 {
		limit = 50
	}

	type AudioInfo struct {
		Filename  string `json:"filename"`
		Timestamp string `json:"timestamp"`
	}

	entries, err := os.ReadDir(cfg.AudioDir)
	if err != nil {
		return c.JSON([]AudioInfo{})
	}
	var infos []AudioInfo
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".m4a") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		infos = append(infos, AudioInfo{
			Filename:  e.Name(),
			Timestamp: info.ModTime().UTC().Format(time.RFC3339),
		})
	}
	sort.Slice(infos, func(i, j int) bool {
		return infos[i].Timestamp > infos[j].Timestamp
	})
	if len(infos) > limit {
		infos = infos[:limit]
	}
	if infos == nil {
		infos = []AudioInfo{}
	}
	return c.JSON(infos)
}

func getAudioFile(c *fiber.Ctx) error {
	filename := c.Params("filename")
	if !validAudioFilename.MatchString(filename) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid filename"})
	}
	return c.SendFile(fmt.Sprintf("%s/%s", cfg.AudioDir, filename))
}

// ── Alert handler ─────────────────────────────────────────────────────────────

func postDeviceAlert(c *fiber.Ctx) error {
	var payload AlertPayload
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	if payload.Type == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "type required"})
	}
	ts := time.Now().UTC().Format(time.RFC3339)
	log.Printf("alert: %s — %s", payload.Type, payload.Message)

	res, err := db.Exec(
		`INSERT INTO alerts (type, message, lat, lon, battery, signal, device_id, attempt_num, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		payload.Type, payload.Message, payload.Lat, payload.Lon, payload.Battery,
		payload.Signal, payload.DeviceID, payload.AttemptNum, ts,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	id, _ := res.LastInsertId()

	go broadcast("alert", fiber.Map{
		"id":          id,
		"type":        payload.Type,
		"message":     payload.Message,
		"timestamp":   ts,
		"lat":         payload.Lat,
		"lon":         payload.Lon,
		"battery":     payload.Battery,
		"signal":      payload.Signal,
		"device_id":   payload.DeviceID,
		"attempt_num": payload.AttemptNum,
	})
	return c.SendStatus(fiber.StatusOK)
}

// getAlertHistory: alertas persistidas, más recientes primero. Para que el
// panel web pueda recuperarlas aunque no estuviera abierto cuando llegaron.
func getAlertHistory(c *fiber.Ctx) error {
	limit := c.QueryInt("limit", 30)
	if limit < 1 {
		limit = 1
	}
	if limit > 200 {
		limit = 200
	}
	rows, err := db.Query(`
		SELECT id, type, message, lat, lon, battery, signal, device_id, attempt_num, created_at
		FROM alerts ORDER BY id DESC LIMIT ?
	`, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	defer rows.Close()

	alerts := make([]fiber.Map, 0)
	for rows.Next() {
		var (
			id                           int64
			aType, message, deviceID, ts string
			lat, lon                     sql.NullFloat64
			battery, signal, attemptNum  sql.NullInt64
		)
		if err := rows.Scan(&id, &aType, &message, &lat, &lon, &battery, &signal, &deviceID, &attemptNum, &ts); err != nil {
			continue
		}
		m := fiber.Map{"id": id, "type": aType, "message": message, "device_id": deviceID, "timestamp": ts}
		if lat.Valid {
			m["lat"] = lat.Float64
		}
		if lon.Valid {
			m["lon"] = lon.Float64
		}
		if battery.Valid {
			m["battery"] = battery.Int64
		}
		if signal.Valid {
			m["signal"] = signal.Int64
		}
		if attemptNum.Valid {
			m["attempt_num"] = attemptNum.Int64
		}
		alerts = append(alerts, m)
	}
	return c.JSON(alerts)
}

func getPhotoFile(c *fiber.Ctx) error {
	filename := c.Params("filename")
	if !validFilename.MatchString(filename) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid filename"})
	}
	return c.SendFile(fmt.Sprintf("%s/%s", cfg.PhotosDir, filename))
}

// ── WebSocket handler ─────────────────────────────────────────────────────────

func handleWS(conn *fiberws.Conn) {
	client := &wsClient{conn: conn}
	hubAdd(client)
	defer func() {
		hubRemove(client)
		conn.Close()
	}()

	// Enviar estado actual al cliente recién conectado
	row := db.QueryRow(`
		SELECT id, device_id, latitude, longitude, battery_level, timestamp,
		       signal_level, device_name, is_charging
		FROM locations ORDER BY id DESC LIMIT 1
	`)
	if r, err := scanLocation(row); err == nil {
		if data, err := json.Marshal(map[string]interface{}{"type": "location", "data": r}); err == nil {
			client.send(data)
		}
	}

	// Leer hasta que el cliente desconecte (necesario para detectar cierre)
	_ = conn.SetReadDeadline(time.Now().Add(120 * time.Second))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(120 * time.Second))
	})
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	cfg = loadConfig()
	initDatabase()
	defer db.Close()
	if err := os.MkdirAll(cfg.PhotosDir, 0755); err != nil {
		log.Fatalf("cannot create photos dir: %v", err)
	}
	if err := os.MkdirAll(cfg.AudioDir, 0755); err != nil {
		log.Fatalf("cannot create audio dir: %v", err)
	}
	startWriteWorker()

	app := fiber.New(fiber.Config{DisableStartupMessage: false})
	app.Use(cors.New())

	// Panel web estático
	app.Static("/", "./web")

	// WebSocket — auth por query param (los browsers no pueden enviar headers en WS)
	app.Use("/ws", func(c *fiber.Ctx) error {
		if fiberws.IsWebSocketUpgrade(c) {
			if c.Query("token") != cfg.APIToken {
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
			}
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})
	app.Get("/ws", fiberws.New(handleWS))

	// Login público (sin auth)
	app.Post("/api/login", postLogin)

	// REST API autenticada
	api := app.Group("/api", authMiddleware)

	api.Post("/location", postLocation)
	api.Get("/location/latest", getLatestLocation)
	api.Get("/location/history", getLocationHistory)

	api.Post("/command", postCommand)
	api.Get("/command/pending", getPendingCommands)
	api.Get("/command/history", getCommandHistory)
	api.Post("/command/:id/ack", ackCommand)
	api.Post("/command/:id/result", postCommandResult)

	api.Post("/photo", postPhoto)
	api.Get("/photo/latest", getLatestPhoto)
	api.Get("/photo/list", getPhotoList)
	api.Get("/photo/file/:filename", getPhotoFile)

	api.Post("/audio", postAudio)
	api.Get("/audio/list", getAudioList)
	api.Get("/audio/file/:filename", getAudioFile)

	api.Get("/geofence", getGeofence)
	api.Post("/geofence", postGeofence)
	api.Delete("/geofence", deleteGeofence)

	api.Post("/alert", postDeviceAlert)
	api.Get("/alert/history", getAlertHistory)

	log.Fatal(app.Listen(":" + cfg.Port))
}
