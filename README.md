# Ālāpana

**A practice partner for Carnatic music students.** Sing into your browser and Ālāpana tells you which notes you hit, which raga you're in, and what to work on next.

**Try it:** [alapana.vercel.app](https://alapana.vercel.app/)

---

## Why I built this

Carnatic music is usually taught one-on-one with a teacher. You learn a phrase in class and then practice it alone at home for the rest of the week, with nobody telling you if you're actually singing it right.

Most music apps don't help much here. They're built around Western scales, so they can't follow the notes, scales and ornaments that make Carnatic music sound the way it does. I wanted something that could listen like a teacher between lessons, so students know what they're getting right, what they're getting wrong, and what to practice next.

## Carnatic music in 30 seconds

If you've never heard of Carnatic music, here are the only words you need for this README:

- **Carnatic music** is the classical music tradition of South India.
- **Swaras** are the notes. Instead of do-re-mi, the seven swaras are *sa ri ga ma pa da ni*.
- A **raga** is like a scale with rules. It decides which swaras you can use, the order you can use them in, and the mood the music should create. There are hundreds of ragas, and two ragas can share the same notes but still sound completely different.
- **Varisais, alankarams and gitams** are the exercises and beginner songs every student learns first, kind of like scales and études in piano.

## What you can do with it

- **Find out which raga you're singing.** Sing a short phrase and Ālāpana listens, works out your notes, and guesses the raga. *(Viveka)*
- **See your notes written out.** Sing something and get it transcribed into swaras so you can check it against what you meant to sing. *(Dhwani)*
- **Get advice on what to practice next.** An AI coach looks at your past practice sessions and tells you where to focus. *(Ālāpana Coach)*
- **Follow a real curriculum.** Work through varisais, alankarams and gitams in the order students normally learn them. *(Gurukul)*
- **Look up any of 90+ ragas.** See each raga's notes, its mood, and performances to listen to. *(Raga Kosha)*
- **Practice with a drone, a beat and a keyboard.** A reference pitch to sing against, a rhythm cycle to keep time, and an on-screen keyboard. *(Shruthi, Talam, Keyboard)*

## How it works

Here's what happens when you sing into the app:

```
  You sing
     │
     ▼
  Browser detects your pitch in real time  (Web Audio API)
     │
     ▼
  Pitches are turned into swaras
     │
     ▼
  The swaras go to the AI gateway, a small Go service on Cloud Run
     │
     ▼
  Gemini 3.8 Flash identifies the raga and gives feedback
     │
     ▼
  Your session is saved to MongoDB
     │
     ▼
  Next time, the Coach reads your history and suggests what to practice
```

Pitch detection happens entirely in your browser, so the app can react while you're still singing. The AI parts run on Google Cloud.

The browser never sends the AI a prompt. It sends only the notes it heard and some numbers about your pitch. The [AI gateway](gateway/README.md) turns those into the prompt, checks that you're signed in, and limits how many requests each person can make. The limits live in Redis, so they hold across every running copy of the gateway.

The coach is an agent built with Google's Agent Development Kit (ADK), deployed on Vertex AI Agent Engine, and it reads and writes your practice history in MongoDB Atlas through a MongoDB MCP server.

**Built with:** React, Vite, Tailwind, Web Audio API, Go, Gemini 3.8 Flash, Vertex AI Agent Engine, Google ADK, MongoDB Atlas, Redis, Docker, Vercel, Cloud Run

## Run it yourself

### The quick way: Docker

If you have Docker, one command runs the whole app on your computer: the website, the API, the AI gateway, a local MongoDB and Redis.

First copy the example settings and add your Clerk keys to `.env`:

```bash
cp .env.example .env
```

Then sign in to Google Cloud, so the AI gateway can call Gemini, and start everything:

```bash
gcloud auth application-default login
docker compose up --build
```

Open [http://localhost:5173](http://localhost:5173). To fill the local database with sample practice history, put your Clerk user ID in `.env` as `DEMO_USER_ID`, then run:

```bash
docker compose run --rm seed
```

### The manual way

#### What you need

- Node.js 22 or newer
- Python 3.11 or newer
- Go 1.26 or newer, for the AI gateway
- A Google Cloud project with Vertex AI turned on
- A MongoDB Atlas cluster (the free tier works)
- A Clerk application, for sign-in

#### 1. Install everything

```bash
npm install
python3 -m venv .venv && source .venv/bin/activate
pip install google-adk mcp
```

#### 2. Add your keys

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | What it is |
|---|---|
| `MONGODB_URI` | Your Atlas connection string |
| `GOOGLE_CLOUD_PROJECT` | Your Google Cloud project ID |
| `GOOGLE_CREDENTIALS_B64` | Your service account key, base64 encoded |
| `VITE_CLERK_PUBLISHABLE_KEY` | Your Clerk publishable key |
| `CLERK_SECRET_KEY` | Your Clerk secret key |
| `AGENT_ENGINE_RESOURCE` | Leave this blank for now. You'll get it in the next step. |

#### 3. Deploy the coach agent

```bash
pip install "google-cloud-aiplatform[adk]>=1.87.0"
python agent/deploy_to_agent_engine.py
```

When it finishes, it prints an `AGENT_ENGINE_RESOURCE` value. Copy that into your `.env`.

#### 4. Start the app

Run each of these in its own terminal: the website, the API routes, and the AI gateway.

```bash
npm run dev
```

```bash
npm run dev:api
```

```bash
cd gateway && go run .
```

Open [http://localhost:5173](http://localhost:5173) and allow microphone access when your browser asks. The website forwards API calls to the other two automatically.

If you want to test the agent by itself, run `adk web agent` and open [http://localhost:8000](http://localhost:8000).

## Project layout

```
agent/     The coach agent and the script that deploys it
api/       Server routes the frontend calls
gateway/   The Go AI gateway that builds prompts and calls Gemini
server/    A local server that runs the api/ routes during development
src/       The React app
public/    Static files
scripts/   Helper scripts
```

## About

I built Ālāpana for the Google Cloud Rapid Agent Hackathon (MongoDB track).

MIT License
