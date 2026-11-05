// Command gateway is Ālāpana's AI gateway: the only service that calls Gemini.
//
// The browser sends typed practice data (swara events, pitch statistics,
// raga names). Every prompt is built here, so a client can never send the
// model arbitrary text. Each request is authenticated with a Clerk session
// token and rate-limited per user through Redis.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/clerk/clerk-sdk-go/v2"
)

// Origins the Vite dev server and production app are served from. Mirrors
// api/_security.js; extend with ALLOWED_ORIGINS.
var defaultOrigins = []string{
	"http://localhost:5173",
	"http://127.0.0.1:5173",
	"https://alapana.vercel.app",
}

type config struct {
	Port           string
	Project        string
	Location       string
	Model          string
	CredentialsB64 string
	ClerkSecretKey string
	RedisURL       string
	AllowedOrigins []string
	BurstLimit     int
	DailyLimit     int
}

func loadConfig() (config, error) {
	cfg := config{
		Port:    envOr("PORT", "8080"),
		Project: os.Getenv("GOOGLE_CLOUD_PROJECT"),
		// Current Gemini models are served from the global endpoint, not us-central1.
		// The gateway has its own variable because the coach agent needs
		// GOOGLE_CLOUD_LOCATION=us-central1 for Agent Engine.
		Location:       envOr("GEMINI_LOCATION", "global"),
		Model:          envOr("GEMINI_MODEL", "gemini-3.8-flash"),
		CredentialsB64: os.Getenv("GOOGLE_CREDENTIALS_B64"),
		ClerkSecretKey: os.Getenv("CLERK_SECRET_KEY"),
		RedisURL:       os.Getenv("REDIS_URL"),
		AllowedOrigins: append([]string{}, defaultOrigins...),
	}
	for _, origin := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
		if origin = strings.TrimSpace(origin); origin != "" {
			cfg.AllowedOrigins = append(cfg.AllowedOrigins, origin)
		}
	}

	var err error
	// Same quotas the Node identify route used: 20 a minute, 120 a day.
	if cfg.BurstLimit, err = envInt("AI_BURST_LIMIT", 20); err != nil {
		return cfg, err
	}
	if cfg.DailyLimit, err = envInt("AI_DAILY_LIMIT", 120); err != nil {
		return cfg, err
	}
	if cfg.ClerkSecretKey == "" {
		return cfg, errors.New("CLERK_SECRET_KEY is required to verify session tokens")
	}
	return cfg, nil
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(logger); err != nil {
		logger.Error("gateway stopped", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	dict, err := loadDictionary()
	if err != nil {
		return err
	}
	llm, err := newVertexClient(ctx, cfg)
	if err != nil {
		return err
	}
	limiter, err := newLimiter(cfg, logger)
	if err != nil {
		return err
	}
	clerk.SetKey(cfg.ClerkSecretKey)

	srv := &server{
		llm:     llm,
		limiter: limiter,
		auth:    clerkAuth{parties: cfg.AllowedOrigins},
		origins: toSet(cfg.AllowedOrigins),
		dict:    dict,
		log:     logger,
	}
	httpServer := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           srv.routes(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      llmTimeout + 15*time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errs := make(chan error, 1)
	go func() {
		logger.Info("gateway listening", "port", cfg.Port, "model", cfg.Model, "redis", cfg.RedisURL != "")
		errs <- httpServer.ListenAndServe()
	}()

	select {
	case err := <-errs:
		return err
	case <-ctx.Done():
		// Cloud Run sends SIGTERM and allows 10 seconds to finish in-flight requests.
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 9*time.Second)
		defer cancel()
		return httpServer.Shutdown(shutdownCtx)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) (int, error) {
	v := os.Getenv(key)
	if v == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return 0, errors.New(key + " must be a positive integer")
	}
	return n, nil
}

func toSet(items []string) map[string]bool {
	set := make(map[string]bool, len(items))
	for _, item := range items {
		set[item] = true
	}
	return set
}
