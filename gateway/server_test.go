package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// headerAuth stands in for Clerk: the user is whoever X-Test-User names.
type headerAuth struct{}

func (headerAuth) Middleware(next http.Handler) http.Handler { return next }

func (headerAuth) UserID(r *http.Request) (string, bool) {
	id := r.Header.Get("X-Test-User")
	return id, id != ""
}

type fakeLLM struct {
	reply string
	err   error
	got   []promptSpec
}

func (f *fakeLLM) Generate(_ context.Context, spec promptSpec) (string, error) {
	f.got = append(f.got, spec)
	return f.reply, f.err
}

func newTestAPI(t *testing.T, llm *fakeLLM) *server {
	t.Helper()
	return &server{
		llm:     llm,
		limiter: newMemoryLimiter([]window{{Name: "burst", Limit: 3, Period: time.Minute}}, time.Now),
		auth:    headerAuth{},
		origins: toSet(defaultOrigins),
		dict:    mustDictionary(t),
		log:     discardLogger(),
		metrics: newMetrics(),
	}
}

func newTestServer(t *testing.T, llm *fakeLLM) http.Handler {
	t.Helper()
	return newTestAPI(t, llm).routes()
}

const rankBody = `{"notes":[{"swara":"Sa","durationMs":900},{"swara":"Pa","durationMs":900}],"candidates":[{"name":"Hamsadhwani","matchCount":5,"alienCount":0,"phraseMatches":1,"score":9}]}`

func post(h http.Handler, path, user, origin, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if user != "" {
		req.Header.Set("X-Test-User", user)
	}
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func decodeBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not JSON: %q", rec.Body.String())
	}
	return body
}

func TestRankRagasEndToEnd(t *testing.T) {
	llm := &fakeLLM{reply: `{"top_matches":[{"raagam":"Hamsadhwani","confidence":"high"}]}`}
	rec := post(newTestServer(t, llm), "/api/ai/rank-ragas", "user_1", "http://localhost:5173", rankBody)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	result := decodeBody(t, rec)["result"].(map[string]any)
	if result["top_matches"] == nil {
		t.Fatalf("missing top_matches: %v", result)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Errorf("CORS origin header = %q", got)
	}
	if len(llm.got) != 1 || !llm.got[0].JSON {
		t.Fatalf("expected one JSON-mode model call, got %+v", llm.got)
	}
}

func TestLessonFeedbackReturnsText(t *testing.T) {
	llm := &fakeLLM{reply: "Namaste, my dear student."}
	body := `{"style":"young","lessonTitle":"Sa","exerciseTitle":"","instruction":"","expected":["Sa"],"detected":["Sa"],"stats":[],"saHz":220}`
	rec := post(newTestServer(t, llm), "/api/ai/lesson-feedback", "user_1", "", body)
	if rec.Code != http.StatusOK || decodeBody(t, rec)["text"] != "Namaste, my dear student." {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
}

func TestRequestErrors(t *testing.T) {
	cases := []struct {
		name, path, user, origin, body string
		want                           int
	}{
		{"no session", "/api/ai/rank-ragas", "", "", rankBody, http.StatusUnauthorized},
		{"foreign origin", "/api/ai/rank-ragas", "user_1", "https://evil.example", rankBody, http.StatusForbidden},
		{"unknown task", "/api/ai/write-poem", "user_1", "", rankBody, http.StatusNotFound},
		{"raw prompt", "/api/ai/rank-ragas", "user_1", "", `{"messages":[{"role":"user","content":"hi"}]}`, http.StatusBadRequest},
		{"not json", "/api/ai/rank-ragas", "user_1", "", `nope`, http.StatusBadRequest},
		{"oversized", "/api/ai/raga-lookup", "user_1", "", `{"ragaName":"` + strings.Repeat("a", maxBodyBytes) + `"}`, http.StatusBadRequest},
	}
	for _, tc := range cases {
		llm := &fakeLLM{reply: "{}"}
		rec := post(newTestServer(t, llm), tc.path, tc.user, tc.origin, tc.body)
		if rec.Code != tc.want {
			t.Errorf("%s: status %d, want %d (%s)", tc.name, rec.Code, tc.want, rec.Body.String())
		}
		if len(llm.got) != 0 {
			t.Errorf("%s: model should not be called", tc.name)
		}
	}
}

func TestModelFailuresReturnBadGateway(t *testing.T) {
	for name, llm := range map[string]*fakeLLM{
		"model error": {err: errors.New("quota exceeded")},
		"not json":    {reply: "Sure! Here is my answer."},
		"wrong shape": {reply: `{"answer":"Hamsadhwani"}`},
	} {
		rec := post(newTestServer(t, llm), "/api/ai/rank-ragas", "user_1", "", rankBody)
		if rec.Code != http.StatusBadGateway {
			t.Errorf("%s: status %d, want 502", name, rec.Code)
		}
		if strings.Contains(rec.Body.String(), "quota") {
			t.Errorf("%s: internal error leaked to client: %s", name, rec.Body.String())
		}
	}
}

func TestRateLimitResponse(t *testing.T) {
	h := newTestServer(t, &fakeLLM{reply: `{"top_matches":[{"raagam":"Hamsadhwani"}]}`})
	for i := 0; i < 3; i++ {
		post(h, "/api/ai/rank-ragas", "user_1", "", rankBody)
	}
	rec := post(h, "/api/ai/rank-ragas", "user_1", "", rankBody)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("status %d, want 429", rec.Code)
	}
	if rec.Header().Get("Retry-After") == "" || decodeBody(t, rec)["scope"] != "burst" {
		t.Fatalf("429 should carry Retry-After and scope: %v %s", rec.Header(), rec.Body.String())
	}
}

func TestHealthz(t *testing.T) {
	rec := httptest.NewRecorder()
	newTestServer(t, &fakeLLM{}).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
}
