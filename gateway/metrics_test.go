package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"
)

func TestMetricsCountTasksByStatus(t *testing.T) {
	s := newTestAPI(t, &fakeLLM{reply: `{"top_matches":[{"raagam":"Hamsadhwani"}]}`})
	h := s.routes()

	post(h, "/api/ai/rank-ragas", "user_1", "", rankBody)
	post(h, "/api/ai/rank-ragas", "", "", rankBody)
	post(h, "/api/ai/made-up-task", "user_1", "", "{}")

	for _, tc := range []struct {
		task, code string
		want       float64
	}{
		{"rank-ragas", "200", 1},
		{"rank-ragas", "401", 1},
		{"unknown", "404", 1},
	} {
		if got := testutil.ToFloat64(s.metrics.requests.WithLabelValues(tc.task, tc.code)); got != tc.want {
			t.Errorf("requests{task=%q,code=%q} = %v, want %v", tc.task, tc.code, got, tc.want)
		}
	}
	if n := testutil.CollectAndCount(s.metrics.duration); n != 2 {
		t.Errorf("duration should have series for rank-ragas and unknown, got %d", n)
	}
}

func TestMetricsCountRateLimits(t *testing.T) {
	s := newTestAPI(t, &fakeLLM{reply: `{"top_matches":[{"raagam":"Hamsadhwani"}]}`})
	h := s.routes()
	for range 4 { // the test limiter allows 3 a minute
		post(h, "/api/ai/rank-ragas", "user_1", "", rankBody)
	}
	if got := testutil.ToFloat64(s.metrics.rateLimited.WithLabelValues("burst")); got != 1 {
		t.Fatalf("rate_limited{scope=burst} = %v, want 1", got)
	}
}

func TestMetricsHandlerServesSeries(t *testing.T) {
	s := newTestAPI(t, &fakeLLM{reply: `{"top_matches":[{"raagam":"Hamsadhwani"}]}`})
	post(s.routes(), "/api/ai/rank-ragas", "user_1", "", rankBody)

	rec := httptest.NewRecorder()
	s.metrics.handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := rec.Body.String()
	for _, want := range []string{
		`alapana_gateway_requests_total{code="200",task="rank-ragas"} 1`,
		"alapana_gateway_request_duration_seconds_bucket",
		"go_goroutines",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("metrics output missing %q", want)
		}
	}
}

func TestPublicPortDoesNotServeMetrics(t *testing.T) {
	rec := httptest.NewRecorder()
	newTestServer(t, &fakeLLM{}).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("GET /metrics on the public handler = %d, want 404", rec.Code)
	}
}
