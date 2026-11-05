# Ālāpana Coach — Google Cloud Agent Builder + MongoDB MCP

The Ālāpana practice coach is built with **Google ADK**, deployed to **Vertex AI Agent Engine** (Google Cloud Agent Builder's managed execution environment), and uses the **MongoDB MCP server** for persistent student memory.

## Architecture

```
React App (alapana.vercel.app)
    ↓
/api/coach  (Vercel serverless function)
    ↓
Vertex AI Agent Engine          ← Google Cloud Agent Builder
    ↓
ADK Agent  (agent/agent.py)
├── Gemini 2.5 Flash            ← reasoning model
└── MongoDB MCP Server          ← practice history tool
        ↓
MongoDB Atlas  (sessions collection)
```

Raga identification (Viveka feature):
```
React App → /api/ai/rank-ragas → Go AI gateway → Gemini 2.5 Flash (Vertex AI)
```

## Agent Engine Deployment

> **Run this once** to publish the agent to Google Cloud Agent Builder.

```bash
# 1. Install deploy dependencies
pip install "google-cloud-aiplatform[adk]>=1.87.0" google-adk mcp

# 2. Authenticate with Google Cloud
gcloud auth application-default login

# 3. Set environment variables
export GOOGLE_CLOUD_PROJECT="project-24a53985-305d-4031-ae8"
export GOOGLE_CLOUD_LOCATION="us-central1"
export MONGODB_URI="<your-atlas-connection-string>"

# 4. Deploy to Agent Engine (~5-10 min on first run)
python agent/deploy_to_agent_engine.py
```

The script prints an `AGENT_ENGINE_RESOURCE` value. Add it to Vercel:

```
AGENT_ENGINE_RESOURCE=projects/project-24a53985-305d-4031-ae8/locations/us-central1/reasoningEngines/<ID>
```

Once set, `/api/coach` routes through Agent Engine automatically. The agent handles MongoDB MCP tool calls server-side.

## Local Development

```bash
# 1. Create venv and install
python3 -m venv .venv
source .venv/bin/activate
pip install google-adk mcp

# 2. Copy env file
cp agent/.env.example agent/.env
# Fill in MONGODB_URI and GOOGLE_CLOUD_PROJECT

# 3. Authenticate
gcloud auth application-default login

# 4. Run locally (opens ADK dev UI at http://localhost:8000)
adk web agent
```

The ADK dev UI shows real-time MongoDB tool call traces.

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `MONGODB_URI` | `.env` + Vercel | MongoDB Atlas connection string |
| `GOOGLE_CLOUD_PROJECT` | `.env` + Vercel | GCP project ID |
| `GOOGLE_CLOUD_LOCATION` | `.env` + Vercel | GCP region (`us-central1`) |
| `GOOGLE_GENAI_USE_VERTEXAI` | `.env` | Set to `1` to use Vertex AI |
| `GOOGLE_CREDENTIALS_B64` | Vercel only | Base64 service account JSON |
| `AGENT_ENGINE_RESOURCE` | Vercel only | Resource name after deployment |

## How It Works

When a student sends a message to the coach:

1. `/api/coach` calls the Agent Engine REST API with the message + userId
2. Agent Engine invokes the ADK agent (`agent/agent.py`)
3. The agent calls **MongoDB MCP `find`** to retrieve the student's practice history
4. **Gemini 2.5 Flash** reasons over the history and the student's request
5. The agent recommends specific tools in the Ālāpana app (Gurukul, Raga Kosha, Viveka, etc.)
6. After a session, the agent calls **MongoDB MCP `insertOne`** to save progress

For raga identification (Viveka), the Go AI gateway (`gateway/`) builds the prompt from the transcribed swara events and the local candidate shortlist, then calls Gemini 2.5 Flash via Vertex AI.

## MongoDB Track — Partner Integration

This submission uses the **MongoDB MCP server** (`mongodb-mcp-server` via npx) as the partner integration:

- **Collection**: `alapana.sessions`
- **Operations**: `find` (read history), `insertOne` (save sessions)
- **Schema**: `{ userId, timestamp, tool, raga, durationMinutes, notes }`

The agent reads MongoDB before every response and writes after every completed session — giving it genuine long-term memory that persists across app restarts.
