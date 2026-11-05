package main

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// window is one fixed-window quota, such as 20 requests a minute.
type window struct {
	Name   string
	Limit  int
	Period time.Duration
}

// Decision is the result of one rate-limit check. Scope names the window
// that refused the request ("burst" or "daily"), which the UI words differently.
type Decision struct {
	Allowed    bool
	Scope      string
	RetryAfter time.Duration
}

// Limiter decides whether a user may make another AI request.
type Limiter interface {
	Allow(ctx context.Context, userID string) (Decision, error)
}

func quotaWindows(cfg config) []window {
	return []window{
		{Name: "burst", Limit: cfg.BurstLimit, Period: time.Minute},
		{Name: "daily", Limit: cfg.DailyLimit, Period: 24 * time.Hour},
	}
}

// newLimiter uses Redis when REDIS_URL is set, so every instance shares one
// count. Without it, each instance counts on its own.
func newLimiter(cfg config, logger *slog.Logger) (Limiter, error) {
	windows := quotaWindows(cfg)
	memory := newMemoryLimiter(windows, time.Now)
	if cfg.RedisURL == "" {
		logger.Warn("REDIS_URL not set: rate limits are per instance")
		return memory, nil
	}
	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("parse REDIS_URL: %w", err)
	}
	// Fail over quickly: a slow Redis should not add seconds to every request.
	opts.DialTimeout = 2 * time.Second
	opts.ReadTimeout = time.Second
	opts.WriteTimeout = time.Second
	return &fallbackLimiter{
		primary:   &redisLimiter{client: redis.NewClient(opts), windows: windows},
		secondary: memory,
		log:       logger,
	}, nil
}

// allowScript checks every window first and only then increments, so a
// refused request never uses up quota. Running it in Redis makes the whole
// check-and-increment atomic across instances.
var allowScript = redis.NewScript(`
for i, key in ipairs(KEYS) do
  local count = tonumber(redis.call('GET', key) or '0')
  if count >= tonumber(ARGV[2 * i - 1]) then
    return {0, i, redis.call('PTTL', key)}
  end
end
for i, key in ipairs(KEYS) do
  if redis.call('INCR', key) == 1 then
    redis.call('PEXPIRE', key, ARGV[2 * i])
  end
end
return {1, 0, 0}
`)

type redisLimiter struct {
	client  *redis.Client
	windows []window
}

func (l *redisLimiter) Allow(ctx context.Context, userID string) (Decision, error) {
	keys := make([]string, len(l.windows))
	args := make([]any, 0, 2*len(l.windows))
	for i, w := range l.windows {
		// The {userID} hash tag keeps a user's keys in one Redis Cluster slot,
		// which a multi-key script requires.
		keys[i] = fmt.Sprintf("ai-rl:{%s}:%s", userID, w.Name)
		args = append(args, w.Limit, w.Period.Milliseconds())
	}
	res, err := allowScript.Run(ctx, l.client, keys, args...).Int64Slice()
	if err != nil {
		return Decision{}, err
	}
	if res[0] == 1 {
		return Decision{Allowed: true}, nil
	}
	w := l.windows[res[1]-1]
	retry := time.Duration(res[2]) * time.Millisecond
	if retry <= 0 {
		retry = w.Period
	}
	return Decision{Scope: w.Name, RetryAfter: retry}, nil
}

// fallbackLimiter keeps limits in force if Redis is unreachable, at the cost
// of counting per instance until it recovers.
type fallbackLimiter struct {
	primary   Limiter
	secondary Limiter
	log       *slog.Logger
}

func (l *fallbackLimiter) Allow(ctx context.Context, userID string) (Decision, error) {
	d, err := l.primary.Allow(ctx, userID)
	if err == nil {
		return d, nil
	}
	l.log.Warn("redis rate limiter unavailable, using in-memory limits", "error", err)
	return l.secondary.Allow(ctx, userID)
}

type bucket struct {
	count   int
	resetAt time.Time
}

type memoryLimiter struct {
	mu      sync.Mutex
	windows []window
	buckets map[string]*bucket
	now     func() time.Time
}

func newMemoryLimiter(windows []window, now func() time.Time) *memoryLimiter {
	return &memoryLimiter{windows: windows, buckets: map[string]*bucket{}, now: now}
}

func (l *memoryLimiter) Allow(_ context.Context, userID string) (Decision, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()

	for key, b := range l.buckets {
		if !now.Before(b.resetAt) {
			delete(l.buckets, key)
		}
	}

	for _, w := range l.windows {
		if b := l.buckets[w.Name+":"+userID]; b != nil && b.count >= w.Limit {
			return Decision{Scope: w.Name, RetryAfter: b.resetAt.Sub(now)}, nil
		}
	}
	for _, w := range l.windows {
		key := w.Name + ":" + userID
		if b := l.buckets[key]; b != nil {
			b.count++
		} else {
			l.buckets[key] = &bucket{count: 1, resetAt: now.Add(w.Period)}
		}
	}
	return Decision{Allowed: true}, nil
}
