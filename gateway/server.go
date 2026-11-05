package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/clerk/clerk-sdk-go/v2"
	clerkhttp "github.com/clerk/clerk-sdk-go/v2/http"
)

const (
	maxBodyBytes = 64 << 10
	llmTimeout   = 30 * time.Second
)

// LLM generates one response for a prompt the gateway built.
type LLM interface {
	Generate(ctx context.Context, spec promptSpec) (string, error)
}

// Authenticator attaches the caller's identity to a request and reads it back.
type Authenticator interface {
	Middleware(next http.Handler) http.Handler
	UserID(r *http.Request) (string, bool)
}

type server struct {
	llm     LLM
	limiter Limiter
	auth    Authenticator
	origins map[string]bool
	dict    *dictionary
	log     *slog.Logger
}

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()
	// Not /healthz: Cloud Run reserves paths ending in "z".
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	mux.HandleFunc("OPTIONS /api/ai/{task}", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	mux.Handle("POST /api/ai/{task}", s.auth.Middleware(http.HandlerFunc(s.handleTask)))
	return s.withSecurity(mux)
}

// withSecurity applies the same origin allowlist and headers as api/_security.js.
func (s *server) withSecurity(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Vary", "Origin")
		h.Set("Cache-Control", "no-store")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("Cross-Origin-Resource-Policy", "same-origin")

		if origin := r.Header.Get("Origin"); origin != "" {
			if !s.origins[origin] {
				writeError(w, http.StatusForbidden, "Origin not allowed.")
				return
			}
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		}
		next.ServeHTTP(w, r)
	})
}

func (s *server) handleTask(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	name := r.PathValue("task")

	userID, ok := s.auth.UserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "Authentication required.")
		return
	}
	t, ok := tasks[name]
	if !ok {
		writeError(w, http.StatusNotFound, "Unknown AI task.")
		return
	}

	// Limit before decoding, so malformed requests still count against the quota.
	decision, err := s.limiter.Allow(r.Context(), userID)
	if err != nil {
		s.log.Error("rate limiter failed", "error", err)
		writeError(w, http.StatusServiceUnavailable, "Please try again shortly.")
		return
	}
	if !decision.Allowed {
		retry := int(math.Ceil(decision.RetryAfter.Seconds()))
		w.Header().Set("Retry-After", strconv.Itoa(retry))
		writeJSON(w, http.StatusTooManyRequests, map[string]any{
			"error":         "Too many requests. Please slow down and try again shortly.",
			"retryAfterSec": retry,
			"scope":         decision.Scope,
		})
		return
	}

	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	dec.DisallowUnknownFields()
	spec, err := t.build(dec, s.dict)
	if err != nil {
		var bad badRequest
		if errors.As(err, &bad) {
			writeError(w, http.StatusBadRequest, bad.Error())
		} else {
			writeError(w, http.StatusBadRequest, "Invalid request body.")
		}
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), llmTimeout)
	defer cancel()
	text, err := s.llm.Generate(ctx, spec)
	if err != nil {
		s.log.Error("model call failed", "task", name, "error", err)
		writeError(w, http.StatusBadGateway, "The AI service is unavailable. Please try again.")
		return
	}

	if spec.JSON {
		raw, err := extractJSONObject(text)
		if err == nil && t.check != nil {
			err = t.check(raw)
		}
		if err != nil {
			s.log.Error("model returned unusable JSON", "task", name, "error", err)
			writeError(w, http.StatusBadGateway, "The AI service returned an unexpected response. Please try again.")
			return
		}
		writeJSON(w, http.StatusOK, map[string]json.RawMessage{"result": raw})
	} else {
		writeJSON(w, http.StatusOK, map[string]string{"text": text})
	}
	s.log.Info("task served", "task", name, "ms", time.Since(start).Milliseconds())
}

// clerkAuth verifies the Clerk session JWT in the Authorization header.
// parties limits the token's azp claim to our own origins.
type clerkAuth struct {
	parties []string
}

func (c clerkAuth) Middleware(next http.Handler) http.Handler {
	return clerkhttp.WithHeaderAuthorization(
		clerkhttp.AuthorizedPartyMatches(c.parties...),
		clerkhttp.AuthorizationFailureHandler(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			writeError(w, http.StatusUnauthorized, "Authentication required.")
		})),
	)(next)
}

func (clerkAuth) UserID(r *http.Request) (string, bool) {
	claims, ok := clerk.SessionClaimsFromContext(r.Context())
	if !ok || claims == nil || claims.Subject == "" {
		return "", false
	}
	return claims.Subject, true
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
