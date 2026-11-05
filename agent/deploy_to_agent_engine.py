"""
Deploy the Ālāpana Coach agent to Vertex AI Agent Engine.

Agent Engine is Google Cloud Agent Builder's managed execution environment for
custom agents. This script packages the ADK agent and registers it with the
Vertex AI platform so it can be called via a stable REST API.

If AGENT_ENGINE_RESOURCE is set, the existing agent is updated in place, so its
resource name (stored in Vercel) stays the same. Otherwise a new one is created.

Usage:
    # 1. Install deploy dependencies
    pip install "google-cloud-aiplatform[adk]>=1.87.0" google-adk mcp

    # 2. Authenticate
    gcloud auth application-default login

    # 3. Deploy (takes ~5-10 minutes). Settings are read from the repo's .env.
    cd /path/to/project
    python agent/deploy_to_agent_engine.py

    # 4. On a first deploy, copy the printed AGENT_ENGINE_RESOURCE value into
    #    your .env and Vercel environment variables.
"""
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_dotenv(path):
    """Fill unset environment variables from a .env file (no extra dependency)."""
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            key, sep, value = line.partition("=")
            key = key.strip()
            if sep and key and not key.startswith("#") and key not in os.environ:
                os.environ[key] = value.split(" #")[0].strip().strip("'\"")


# Before importing the agent: it reads MONGODB_URI at import time.
load_dotenv(os.path.join(REPO_ROOT, ".env"))

try:
    import cloudpickle
    import vertexai
    from vertexai.preview import reasoning_engines
except ImportError:
    print("ERROR: Install deploy deps first:")
    print("  pip install 'google-cloud-aiplatform[adk]>=1.87.0' google-adk mcp")
    sys.exit(1)

# Import the root agent from agent.py
sys.path.insert(0, REPO_ROOT)
import agent.agent as agent_module  # noqa: E402
from agent.agent import root_agent  # noqa: E402

# agent.py defines GlobalGemini. Agent Engine can't import our module, so
# pickle its code by value along with the agent.
cloudpickle.register_pickle_by_value(agent_module)

PROJECT        = os.getenv("GOOGLE_CLOUD_PROJECT",        "project-24a53985-305d-4031-ae8")
# Agent Engine runs in us-central1; the agent's model calls Gemini's global endpoint.
LOCATION       = os.getenv("GOOGLE_CLOUD_LOCATION",       "us-central1")
STAGING_BUCKET = os.getenv("GOOGLE_CLOUD_STAGING_BUCKET", f"gs://{PROJECT}-adk-staging")
EXISTING       = os.getenv("AGENT_ENGINE_RESOURCE",       "")

# Agent Engine requires a GCS staging bucket for packaging the agent.
# Create it once with: gsutil mb -l us-central1 gs://<PROJECT>-adk-staging
print(f"  Staging:  {STAGING_BUCKET}")
print(f"  (Create bucket if missing: gsutil mb -l {LOCATION} {STAGING_BUCKET})\n")

vertexai.init(project=PROJECT, location=LOCATION, staging_bucket=STAGING_BUCKET)

print("Deploying Ālāpana Coach to Vertex AI Agent Engine...")
print(f"  Project:  {PROJECT}")
print(f"  Location: {LOCATION}")
print(f"  Model:    {root_agent.model.model} (global endpoint, via ADK agent)")
print(f"  Mode:     {'update ' + EXISTING if EXISTING else 'create new agent'}\n")

app = reasoning_engines.AdkApp(
    agent=root_agent,
    enable_tracing=True,
)

REQUIREMENTS = [
    "google-cloud-aiplatform[adk]>=1.87.0",
    "google-adk>=1.0.0",
    "mcp>=1.0.0",
    "cloudpickle",
]

if EXISTING:
    remote_agent = reasoning_engines.ReasoningEngine(EXISTING)
    remote_agent.update(reasoning_engine=app, requirements=REQUIREMENTS)
else:
    # reasoning_engines.create() was removed in SDK >=1.87. Use the class method instead.
    remote_agent = reasoning_engines.ReasoningEngine.create(
        app,
        requirements=REQUIREMENTS,
        display_name="Alapana Coach",
        description="Carnatic music practice coach — Gemini + MongoDB MCP (Ālāpana app)",
    )

resource = remote_agent.resource_name
agent_id = resource.split("/")[-1]

print(f"\n✓ Agent Engine {'updated' if EXISTING else 'deployed'} successfully.")
print(f"  Resource name: {resource}")
print(f"  Agent ID:      {agent_id}")
if not EXISTING:
    print("\nAdd to your .env and Vercel environment variables:")
    print(f"  AGENT_ENGINE_RESOURCE={resource}")
print("\nTo query the agent (Python):")
print('  session = remote_agent.create_session(user_id="student-1")')
print('  for chunk in remote_agent.stream_query(user_id="student-1",')
print('                                          session_id=session["id"],')
print('                                          message="Help me practice Bhairavi"):')
print('      print(chunk)')
