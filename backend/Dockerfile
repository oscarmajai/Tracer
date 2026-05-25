# El build context debe ser la raíz del proyecto (Tracer/):
#   docker build -f backend/Dockerfile -t tracer-api .

# --- Etapa 1: Build web (React/Vite) ---
FROM node:22-alpine AS web-builder

WORKDIR /web

COPY web/package.json web/package-lock.json ./
RUN npm ci --silent

COPY web/ ./
RUN npm run build

# --- Etapa 2: Compilación Go ---
FROM golang:1.26-alpine AS go-builder

RUN apk add --no-cache build-base

WORKDIR /app

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/main.go .

RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-w -s" -o tracer-api main.go

# --- Etapa 3: Imagen de ejecución ---
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

COPY --from=go-builder /app/tracer-api .
COPY --from=web-builder /web/dist ./web/

EXPOSE 3000

ENV TRACER_API_TOKEN=TracerSecretToken123 \
    TRACER_DB_FILE=/data/telemetry.db \
    TRACER_PHOTOS_DIR=/data/photos \
    PORT=3000

CMD ["./tracer-api"]
