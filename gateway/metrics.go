package main

import (
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// metrics are the gateway's Prometheus series. They are served on a separate
// listener (METRICS_ADDR), never on the public port, so Cloud Run does not
// expose them. Kubernetes sets METRICS_ADDR and Prometheus scrapes it there.
type metrics struct {
	registry       *prometheus.Registry
	requests       *prometheus.CounterVec
	duration       *prometheus.HistogramVec
	rateLimited    *prometheus.CounterVec
	redisFallbacks prometheus.Counter
}

func newMetrics() *metrics {
	m := &metrics{
		registry: prometheus.NewRegistry(),
		requests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "alapana_gateway_requests_total",
			Help: "AI task requests by task and HTTP status code.",
		}, []string{"task", "code"}),
		duration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name: "alapana_gateway_request_duration_seconds",
			Help: "Time to serve an AI task request, including the model call.",
			// The model call dominates and times out at 30 seconds.
			Buckets: []float64{0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 15, 30},
		}, []string{"task"}),
		rateLimited: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "alapana_gateway_rate_limited_total",
			Help: "Requests refused by the per-user rate limit, by window (burst or daily).",
		}, []string{"scope"}),
		redisFallbacks: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "alapana_gateway_redis_fallbacks_total",
			Help: "Rate-limit checks that used in-memory limits because Redis failed.",
		}),
	}
	m.registry.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
		m.requests, m.duration, m.rateLimited, m.redisFallbacks,
	)
	m.startSeriesAtZero()
	return m
}

// Status codes the AI route returns for a known task.
var taskStatusCodes = []int{
	http.StatusOK,
	http.StatusBadRequest,
	http.StatusUnauthorized,
	http.StatusTooManyRequests,
	http.StatusBadGateway,
	http.StatusServiceUnavailable,
}

// startSeriesAtZero creates every expected labelled series with a value of 0.
// Prometheus's rate() and increase() cannot see a series that first appears
// already at 1, so without this the first request of each kind is lost and
// latency quantiles come out as NaN until the second one.
func (m *metrics) startSeriesAtZero() {
	for name := range tasks {
		m.duration.WithLabelValues(name)
		for _, code := range taskStatusCodes {
			m.requests.WithLabelValues(name, strconv.Itoa(code))
		}
	}
	m.duration.WithLabelValues("unknown")
	m.requests.WithLabelValues("unknown", strconv.Itoa(http.StatusUnauthorized))
	m.requests.WithLabelValues("unknown", strconv.Itoa(http.StatusNotFound))
	for _, w := range quotaWindows(config{}) {
		m.rateLimited.WithLabelValues(w.Name)
	}
}

func (m *metrics) handler() http.Handler {
	return promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{})
}

// instrument records the status and duration of each AI task request,
// including ones the auth middleware refuses. Names outside the task table
// are labelled "unknown", so a client cannot create series by inventing paths.
func (m *metrics) instrument(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)

		task := r.PathValue("task")
		if _, ok := tasks[task]; !ok {
			task = "unknown"
		}
		m.requests.WithLabelValues(task, strconv.Itoa(rec.status)).Inc()
		m.duration.WithLabelValues(task).Observe(time.Since(start).Seconds())
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }
