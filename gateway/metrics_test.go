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
	body := scrape(t, s.metrics)
	for _, want := range []string{
		`alapana_gateway_request_duration_seconds_count{task="rank-ragas"} 2`,
		`alapana_gateway_request_duration_seconds_count{task="unknown"} 1`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("metrics output missing %q", want)
		}
	}
}

// A series that first appears at 1 shows no increase to rate(), so every
// expected series must exist at 0 before the first request.
func TestMetricsStartExpectedSeriesAtZero(t *testing.T) {
	body := scrape(t, newMetrics())
	var want []string
	for name := range tasks {
		want = append(want,
			`alapana_gateway_requests_total{code="200",task="`+name+`"} 0`,
			`alapana_gateway_requests_total{code="502",task="`+name+`"} 0`,
			`alapana_gateway_request_duration_seconds_count{task="`+name+`"} 0`,
		)
	}
	want = append(want,
		`alapana_gateway_requests_total{code="404",task="unknown"} 0`,
		`alapana_gateway_rate_limited_total{scope="burst"} 0`,
		`alapana_gateway_rate_limited_total{scope="daily"} 0`,
	)
	for _, w := range want {
		if !strings.Contains(body, w) {
			t.Errorf("fresh metrics missing %q", w)
		}
	}
}

func scrape(t *testing.T, m *metrics) string {
	t.Helper()
	rec := httptest.NewRecorder()
	m.handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	return rec.Body.String()
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

	body := scrape(t, s.metrics)
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
