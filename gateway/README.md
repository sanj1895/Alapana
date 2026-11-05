# Ālāpana AI gateway (Go)

The only service that calls Gemini. The browser sends typed practice data, and
the gateway builds every prompt itself, so a client cannot send the model
arbitrary text.

```
Browser ──POST /api/ai/{task}──► gateway (Cloud Run) ──► Gemini 2.5 Flash (Vertex AI)
          typed JSON + Clerk JWT     │
                                     └── Redis: per-user rate limits shared by all instances
```

## Why it exists

It replaced `api/gemini-identify.js`, which had three problems:

| Problem in the old route | What the gateway does |
| --- | --- |
| Accepted a full prompt from the client and required no login, so anyone could use it as a free Gemini proxy | Accepts only typed fields for four tasks; prompts live in `tasks.go` |
| Rate limits lived in one serverless instance's memory | One Redis count across all instances, with an atomic Lua check-and-increment |
| Forced JSON output on every task, so prose feedback came back as JSON | JSON mode only for ranking and lookup; feedback is plain text |

## Tasks

| Task | Request (typed) | Response |
| --- | --- | --- |
| `rank-ragas` | Note events (`swara`, `durationMs`, `direction`) and the local scorer's top candidates | `{"result": {"top_matches": [...]}}` |
| `raga-lookup` | `ragaName` (letters, digits and light punctuation, up to 60 characters) | `{"result": {...}}` |
| `practice-feedback` | Note hits, cents deviation, harmonic richness, breath label, gamaka rates | `{"text": "..."}` |
| `lesson-feedback` | Expected and sung swaras, pitch statistics, guru style | `{"text": "..."}` |

Every field is validated: swaras against the 16 swarasthana names, candidates
against the verified raga dictionary, numbers against ranges. Unknown fields are
rejected. Lesson titles are reduced to one short line with no quotes.

## Code map

| File | Responsibility |
| --- | --- |
| `main.go` | Config from environment, startup, graceful shutdown on SIGTERM |
| `server.go` | Routes, origin allowlist, security headers, Clerk auth, the request flow |
| `tasks.go` | Request types, validation and prompt builders for the four tasks |
| `evidence.go` | Turns note events into the swara evidence text (ported from `Viveka.jsx`) |
| `ratelimit.go` | Redis limiter, in-memory limiter, and the fallback between them |
| `vertex.go` | Vertex AI `generateContent` client and Google credentials |
| `ragas.go`, `ragas.json` | The verified raga dictionary, embedded in the binary |

`ragas.json` is generated from `src/utils/ragaLogic.js`. After editing ragas, run
`npm run export:ragas` from the repo root.

## Run and test

```bash
cd gateway
go test -race ./...

# Run locally (needs `gcloud auth application-default login`):
CLERK_SECRET_KEY=sk_test_... GOOGLE_CLOUD_PROJECT=your-project go run .
```

Most people run it with the rest of the app: `docker compose up --build` from the repo root.

| Variable | Required | Default |
| --- | --- | --- |
| `CLERK_SECRET_KEY` | Yes | |
| `GOOGLE_CLOUD_PROJECT` | Yes, unless the credentials name a project | |
| `GOOGLE_CLOUD_LOCATION` | No | `us-central1` |
| `GOOGLE_CREDENTIALS_B64` | No; otherwise Application Default Credentials | |
| `REDIS_URL` | No; without it, limits are per instance | |
| `ALLOWED_ORIGINS` | No; comma-separated, added to localhost:5173 and alapana.vercel.app | |
| `AI_BURST_LIMIT`, `AI_DAILY_LIMIT` | No | 20 a minute, 120 a day |
| `PORT` | No (Cloud Run sets it) | `8080` |

## Deploy to Cloud Run

First store the Clerk secret key and Redis URL in Secret Manager as
`clerk-secret-key` and `redis-url`.

```bash
# 1. Deploy (Cloud Build builds the Dockerfile).
gcloud run deploy alapana-gateway \
  --source gateway \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT=<project-id>,ALLOWED_ORIGINS=https://alapana.vercel.app \
  --set-secrets CLERK_SECRET_KEY=clerk-secret-key:latest,REDIS_URL=redis-url:latest

# 2. Let the service account call Gemini.
gcloud projects add-iam-policy-binding <project-id> \
  --member serviceAccount:<service-account-email> --role roles/aiplatform.user
```

`--allow-unauthenticated` lets the browser reach the service; Clerk tokens
protect every AI route. For `REDIS_URL`, a hosted Redis such as Upstash
(`rediss://...`) works without VPC setup.

Then route `/api/ai/*` to the service in `vercel.json`, so the front end keeps
calling its own origin:

```json
"rewrites": [
  { "source": "/api/ai/:path*", "destination": "https://<gateway-url>/api/ai/:path*" }
]
```

Vercel preview URLs need adding to `ALLOWED_ORIGINS`, or the gateway refuses them.
