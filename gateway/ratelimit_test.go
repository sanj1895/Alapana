package main

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

var testWindows = []window{
	{Name: "burst", Limit: 2, Period: time.Minute},
	{Name: "daily", Limit: 3, Period: 24 * time.Hour},
}

// exerciseLimiter checks the behaviour both limiters must share. advance moves
// the limiter's clock forward.
func exerciseLimiter(t *testing.T, l Limiter, advance func(time.Duration)) {
	t.Helper()
	ctx := context.Background()
	allow := func() Decision {
		t.Helper()
		d, err := l.Allow(ctx, "user_1")
		if err != nil {
			t.Fatal(err)
		}
		return d
	}

	if !allow().Allowed || !allow().Allowed {
		t.Fatal("first two requests should pass")
	}
	d := allow()
	if d.Allowed || d.Scope != "burst" || d.RetryAfter <= 0 || d.RetryAfter > time.Minute {
		t.Fatalf("third request should hit the burst window, got %+v", d)
	}

	// Another user has their own quota.
	if d, _ := l.Allow(ctx, "user_2"); !d.Allowed {
		t.Fatal("a different user should not be limited")
	}

	// Refused requests don't use quota: after the burst window resets, one
	// more request fits under the daily limit of 3, then the daily window refuses.
	advance(61 * time.Second)
	if !allow().Allowed {
		t.Fatal("request after the burst window resets should pass")
	}
	if d := allow(); d.Allowed || d.Scope != "daily" {
		t.Fatalf("expected the daily window to refuse, got %+v", d)
	}
}

func TestMemoryLimiter(t *testing.T) {
	now := time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC)
	l := newMemoryLimiter(testWindows, func() time.Time { return now })
	exerciseLimiter(t, l, func(d time.Duration) { now = now.Add(d) })
}

func TestRedisLimiter(t *testing.T) {
	mr := miniredis.RunT(t)
	l := &redisLimiter{client: redis.NewClient(&redis.Options{Addr: mr.Addr()}), windows: testWindows}
	exerciseLimiter(t, l, mr.FastForward)
}

type failingLimiter struct{}

func (failingLimiter) Allow(context.Context, string) (Decision, error) {
	return Decision{}, context.DeadlineExceeded
}

func TestFallbackLimiterUsesMemoryWhenRedisFails(t *testing.T) {
	now := time.Now()
	l := &fallbackLimiter{
		primary:   failingLimiter{},
		secondary: newMemoryLimiter(testWindows, func() time.Time { return now }),
		log:       discardLogger(),
	}
	ctx := context.Background()
	l.Allow(ctx, "user_1")
	l.Allow(ctx, "user_1")
	if d, err := l.Allow(ctx, "user_1"); err != nil || d.Allowed {
		t.Fatalf("limits should still apply when Redis is down, got %+v, %v", d, err)
	}
}
