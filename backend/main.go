package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	_ "github.com/mattn/go-sqlite3"
)


// --- Config ---

type Config struct {
	APIToken  string
	DBFile    string
	PhotosDir string
	Port      string
}

var (
	cfg     Config
	db      *sql.DB
	writeCh chan LocationPayload
)

func loadConfig() Config {
	return Config{
		APIToken:  getEnv("TRACER_API_TOKEN", "TracerSecretToken123"),
		DBFile:    getEnv("TRACER_DB_FILE", "./telemetry.db"),
		PhotosDir: getEnv("TRACER_PHOTOS_DIR", "./photos"),
		Port:      getEnv("PORT", "3000"),
	}
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// --- Types ---

type LocationPayload struct {
	DeviceID     string  `json:"device_id"`
	Latitude     float64 `json:"latitude"`
	Longitude    float64 `json:"longitude"`
	BatteryLevel int     `json:"battery_level"`
	Timestamp    string  `json:"timestamp"`
}

type LocationRecord struct {
	ID           int64   `json:"id"`
	DeviceID     string  `json:"device_id"`
	Latitude     float64 `json:"latitude"`
	Longitude    float64 `json:"longitude"`
	BatteryLevel int     `json:"battery_level"`
	Timestamp    string  `json:"timestamp"`
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
	CreatedAt  string  `json:"created_at"`
	ExecutedAt *string `json:"executed_at,omitempty"`
}

// --- Database ---

func initDatabase() {
	var err error
	db, err = sql.Open("sqlite3", cfg.DBFile)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}

	// Una sola conexión serializa todas las escrituras en SQLite sin errores de lock.
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
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			log.Fatalf("db init: %v — stmt: %.40s", err, s)
		}
	}
	if err := os.MkdirAll(cfg.PhotosDir, 0755); err != nil {
		log.Fatalf("failed to create photos dir: %v", err)
	}
	log.Println("database initialized")
}

// startWriteWorker serializa inserts de ubicación a través de un canal buffereado
// para evitar errores "database is locked" bajo carga concurrente.
func startWriteWorker() {
	writeCh = make(chan LocationPayload, 256)
	go func() {
		for p := range writeCh {
			_, err := db.Exec(
				`INSERT INTO locations (device_id, latitude, longitude, battery_level, timestamp)
				 VALUES (?, ?, ?, ?, ?)`,
				p.DeviceID, p.Latitude, p.Longitude, p.BatteryLevel, p.Timestamp,
			)
			if err != nil {
				log.Printf("db insert error: %v", err)
			}
		}
	}()
}

// --- Middleware ---

func authMiddleware(c *fiber.Ctx) error {
	if c.Get("Authorization") != "Bearer "+cfg.APIToken {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	return c.Next()
}

// --- Location handlers ---

func postLocation(c *fiber.Ctx) error {
	var payload LocationPayload
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	if payload.Timestamp == "" {
		payload.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}
	writeCh <- payload
	return c.SendStatus(fiber.StatusOK)
}

func getLatestLocation(c *fiber.Ctx) error {
	var r LocationRecord
	err := db.QueryRow(`
		SELECT id, device_id, latitude, longitude, battery_level, timestamp
		FROM locations ORDER BY id DESC LIMIT 1
	`).Scan(&r.ID, &r.DeviceID, &r.Latitude, &r.Longitude, &r.BatteryLevel, &r.Timestamp)
	if err == sql.ErrNoRows {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "no records found"})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
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
		SELECT id, device_id, latitude, longitude, battery_level, timestamp
		FROM locations ORDER BY id DESC LIMIT ?
	`, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	defer rows.Close()

	records := make([]LocationRecord, 0)
	for rows.Next() {
		var r LocationRecord
		if err := rows.Scan(&r.ID, &r.DeviceID, &r.Latitude, &r.Longitude, &r.BatteryLevel, &r.Timestamp); err != nil {
			continue
		}
		records = append(records, r)
	}
	return c.JSON(records)
}

// --- Command handlers ---

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

func getPendingCommands(c *fiber.Ctx) error {
	rows, err := db.Query(`
		SELECT id, command, args, status, created_at
		FROM commands WHERE status = 'pending' ORDER BY id ASC
	`)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	defer rows.Close()

	commands := make([]CommandRecord, 0)
	for rows.Next() {
		var r CommandRecord
		if err := rows.Scan(&r.ID, &r.Command, &r.Args, &r.Status, &r.CreatedAt); err != nil {
			continue
		}
		commands = append(commands, r)
	}
	return c.JSON(commands)
}

// --- Photo handlers ---

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

	log.Printf("photo saved: %s", filename)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"filename":  filename,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
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

func ackCommand(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id"})
	}
	result, err := db.Exec(
		`UPDATE commands SET status = 'executed', executed_at = ? WHERE id = ? AND status = 'pending'`,
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

// --- Main ---

func main() {
	cfg = loadConfig()
	initDatabase()
	defer db.Close()
	startWriteWorker()

	app := fiber.New(fiber.Config{DisableStartupMessage: false})
	app.Use(cors.New())

	// Panel web — servido desde ./web si el directorio existe
	app.Static("/", "./web")

	api := app.Group("/api", authMiddleware)

	// Telemetría de ubicación
	api.Post("/location", postLocation)
	api.Get("/location/latest", getLatestLocation)
	api.Get("/location/history", getLocationHistory)

	// Relay de comandos (web → app)
	api.Post("/command", postCommand)
	api.Get("/command/pending", getPendingCommands)
	api.Post("/command/:id/ack", ackCommand)

	// Fotos
	api.Post("/photo", postPhoto)
	api.Get("/photo/latest", getLatestPhoto)

	log.Fatal(app.Listen(":" + cfg.Port))
}
