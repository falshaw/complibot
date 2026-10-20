# complibot

A self-hosted web app that drafts answers to vendor security questionnaires (SIG, CAIQ, ISO 27001, SOC 2 style spreadsheets) from your own security knowledge base, using retrieval-augmented generation on a local LLM.

## Why

Security questionnaires repeat the same questions in different wording. Answering them by hand means searching old spreadsheets and policies every time. complibot keeps a reviewed knowledge base of your answers, retrieves the closest entries for each new question, drafts an answer with a confidence score and citations, and leaves the final approval to a human reviewer. It runs on your own machine with Ollama by default, so questionnaire content does not have to leave your infrastructure.

## Features

- **Questionnaire upload and parsing**: Excel (`.xlsx`) and CSV. The question column is detected automatically (or set explicitly), questions are classified by type (yes/no, text, date, numeric, ...) and security domain (20 domains).
- **RAG answer generation**: keyword search (always on) plus optional pgvector semantic search over the knowledge base; the top-scored entries go to the LLM, which drafts each answer with a confidence score and the source entries it used.
- **Review workflow**: approve, reject, edit or regenerate answers; bulk-approve.
- **Export**: completed questionnaires to Excel or a text report.
- **Knowledge base**: import entries from spreadsheets/PDF sources, search, per-domain stats, and a **gap analysis** that shows thin domains.
- **Knowledge interview**: an AI-led interview that cycles through security domains and turns your replies into knowledge-base entries.
- **Templates**: seeded questionnaire templates (SIG Lite, CAIQ v4, VSA, NIST CSF, ISO 27001, CIS Controls v8, SOC 2 readiness).
- **Teams and RBAC**: organizations, invitations, roles.
- **Audit log**: security-relevant actions recorded per organization.
- **Security**: CSRF protection in middleware, Redis-backed rate limiting, login lockout, input sanitization, AES-256-GCM field encryption, least-privilege database role, hardened containers (read-only root, dropped capabilities, resource limits).

## Quick start

The commands are the same in PowerShell (Windows) and bash (Linux/macOS).

### 1. Prerequisites

| Tool | Notes |
|---|---|
| Docker | Docker Desktop on Windows/macOS, Docker Engine + the compose plugin on Linux |
| Node.js 22 or newer | used to generate `.env` and for development |
| [Ollama](https://ollama.com) | runs the LLM on the host (or see [LLM providers](#llm-providers)) |
| Git | on Windows the repo's `.gitattributes` keeps shell scripts LF, no `core.autocrlf` change needed |

Pull a chat model into Ollama (about 4.7 GB):

```bash
ollama pull qwen2.5:7b
```

Optional, for semantic search (about 270 MB, see [Embeddings](#embeddings-optional)):

```bash
ollama pull nomic-embed-text
```

**Linux only:** Ollama listens on `127.0.0.1` by default, which containers cannot reach. Make it listen on all interfaces: `sudo systemctl edit ollama`, add

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0"
```

then `sudo systemctl restart ollama`. Docker Desktop on Windows/macOS needs nothing extra.

### 2. Configure

```bash
git clone <this repo> complibot
cd complibot
node scripts/setup-env.mjs
```

`setup-env.mjs` copies `.env.example` to `.env` with random passwords and keys. Open `.env` and check:

- `OLLAMA_MODEL`: the chat model you pulled (default `qwen2.5:7b`)
- `SEED_ADMIN_PASSWORD`: set one (at least 12 characters with a special character), or leave empty to get a random one
- `COMPLIBOT_PORT` and `NEXTAUTH_URL`: change both if port 3005 is taken (for example `3105` and `http://localhost:3105`)

### 3. Start

```bash
docker compose up -d --build
```

This builds the app, starts Postgres (pgvector) and Redis, and runs the one-shot `complibot-init` container, which applies the database migrations and seeds a demo organization, two users, a 10-entry knowledge base and the questionnaire templates. The app starts once init has finished.

```bash
docker compose ps                      # complibot-app should become "healthy"
docker compose logs complibot-init     # shows the demo password if you left it empty
```

Open http://localhost:3005 (or your `COMPLIBOT_PORT`) and sign in as `admin@demo.com` with the seed password.

### 4. Try it

1. **Questionnaires → Upload**: upload a CSV or Excel file with one question per row, e.g.

   ```csv
   Question
   Do you encrypt customer data at rest?
   Do you perform vulnerability scanning?
   What is your password policy?
   ```

2. **Parse Questions**, then **Generate Answers**. Generation calls the LLM once per question; on a laptop CPU/GPU expect seconds to a minute per answer depending on the model.
3. Review each draft with its confidence score and cited knowledge-base entries, approve or edit, then **Export**.

Stop with `docker compose down` (add `-v` to delete the database volume).

## Question column detection (`columnMapping`)

Without a column mapping, the parser picks the question column like this:

1. a header cell named `Question`, `Questions`, `Question Text`, `Control Question`, `Requirement`, `Frage`, `Fragen` or `Anforderung` (case-insensitive);
2. otherwise the column with the most cells ending in `?`;
3. otherwise the first column that contains text (not IDs or numbers).

The first row is treated as a header unless it already looks like a question. If nothing is found, parsing fails with a message and the questionnaire can be parsed again.

To set the column explicitly, enter the column letter on the upload form, or send `columnMapping` (JSON) with the upload or the parse request:

| Field | Type | Default | Meaning |
|---|---|---|---|
| `questionCol` | string | detected | column letter holding the questions (`"A"`, `"B"`, `"AA"`) |
| `headerRow` | number | `1` (detected) | number of header rows to skip |
| `sheetName` | string | first sheet | Excel worksheet name |
| `answerCol` | string | none | existing answers (knowledge-base import only) |

```bash
# multipart upload with an explicit mapping
curl -b cookies.txt -H "Origin: http://localhost:3005" \
  -F "name=Vendor A" -F "file=@questionnaire.csv" \
  -F 'columnMapping={"questionCol":"C","headerRow":1}' \
  http://localhost:3005/api/questionnaires
```

## LLM providers

Chat completions (domain classification and answer drafting) go through `src/lib/ollama.ts`, an OpenAI-compatible client with retries and a circuit breaker (5 failures, 5 minutes open).

| Option | Settings |
|---|---|
| Ollama on the Docker host (default) | `LLM_PROVIDER=ollama`, `OLLAMA_HOST=http://host.docker.internal:11434`, `OLLAMA_MODEL=<pulled model>` |
| Ollama on another machine | `OLLAMA_HOST=http://<host>:11434` |
| Other OpenAI-compatible server without an API key (llama.cpp server, LM Studio, vLLM) | `OLLAMA_HOST=<base URL without /v1>`, `OLLAMA_MODEL=<model name>`; embeddings need an Ollama-style `/api/embed`, so set `EMBEDDING_MODEL=none` |
| Bundled Ollama container | `deploy/docker-compose.prod.yml` (see below) |
| HTTP bridge to Claude | `LLM_PROVIDER=claude`, `CLAUDE_BRIDGE_URL`, `CLAUDE_BRIDGE_TOKEN`, `CLAUDE_MODEL` |

The bridge is any HTTP service that accepts `POST {CLAUDE_BRIDGE_URL}/generate` with JSON `{prompt, system, model}` (header `X-Bridge-Token` when a token is set) and returns `{ok: true, response: "<text>"}`. Embeddings always stay on Ollama.

Larger models give better answers: `qwen2.5:7b` is a good default for 8 GB of VRAM; 14B to 32B models are noticeably better if you have the memory. Change `OLLAMA_MODEL` in `.env` and run `docker compose up -d` to apply.

## Embeddings (optional)

Retrieval always runs a keyword search: stopwords are removed, terms are stemmed, each knowledge-base entry is scored (a match in the entry's question counts most, then its keywords, then its answer) and the best-scored entries are used. The question's classified domain only boosts matching entries, it never filters them out. This works with no embedding model at all.

With `EMBEDDING_MODEL=nomic-embed-text` pulled in Ollama, complibot also runs pgvector cosine search and merges both result lists (reciprocal rank fusion). New entries from the knowledge interview are embedded automatically; for entries that already exist (like the demo data), re-run init after pulling the model:

```bash
docker compose run --rm complibot-init
```

Set `EMBEDDING_MODEL=none` to switch semantic search off. If the model is missing, semantic search pauses for 5 minutes after the first failure and keyword search carries on.

## Architecture

```
Browser ── Next.js 16 (App Router, React 19)
             ├─ middleware: CSRF + NextAuth session guard
             ├─ API routes: rate limiting, RBAC, audit logging
             └─ services (src/lib/services/)
                  ├─ QuestionnaireParserService  Excel/CSV -> questions (+ columnDetection)
                  ├─ SearchService               keyword scoring (+ optional pgvector), RRF
                  ├─ EmbeddingService            optional Ollama embeddings (768-dim)
                  ├─ AnswerGenerationService     RAG prompt -> answer + confidence + sources
                  ├─ InterviewService            domain-cycling KB interview
                  └─ ExportService               answers -> Excel / text report
PostgreSQL 16 + pgvector (Prisma 7 with the PrismaPg adapter)
Redis (rate limits, lockout, cache)
Ollama or another LLM endpoint
```

Docker services: `complibot-postgres`, `complibot-redis`, `complibot-init` (one-shot migrations + seed, runs as the Postgres superuser) and `complibot-app` (connects as the least-privilege `complibot` role). No fixed container names or IPs, so `docker compose -p <name>` can run several copies side by side.

## Production overlay

`deploy/docker-compose.prod.yml` adds Caddy (automatic TLS on 80/443) and a bundled Ollama container on top of the base compose file:

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml \
  --env-file deploy/.env.prod up -d --build
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml \
  exec complibot-ollama ollama pull qwen2.5:7b
```

It requires `COMPLIBOT_DOMAIN` and `COMPLIBOT_PUBLIC_URL` in `deploy/.env.prod` (plus everything from `.env.example`). It has not been validated on a public server.

## Configuration

See `.env.example` for all variables.

| Variable | Required | Purpose |
|---|---|---|
| `POSTGRES_PASSWORD`, `COMPLIBOT_DB_PASSWORD` | yes | DB superuser (migrations) and least-privilege app user |
| `REDIS_PASSWORD` | yes | Redis auth |
| `AUTH_SECRET` | yes | NextAuth signing secret (32+ characters) |
| `ENCRYPTION_KEY` | yes | 64 hex characters for AES-256-GCM |
| `SEED_ADMIN_PASSWORD` | no | demo user password; random (printed by init) if empty |
| `LLM_PROVIDER` | no | `ollama` (default) or `claude` |
| `OLLAMA_HOST`, `OLLAMA_MODEL` | no | default `http://host.docker.internal:11434`, `qwen2.5:7b` |
| `EMBEDDING_MODEL` | no | default `nomic-embed-text`; `none` = keyword search only |
| `CLAUDE_BRIDGE_URL`, `CLAUDE_BRIDGE_TOKEN`, `CLAUDE_MODEL` | no | only for `LLM_PROVIDER=claude` |
| `COMPLIBOT_PORT`, `COMPLIBOT_DB_PORT`, `COMPLIBOT_REDIS_PORT` | no | host ports on 127.0.0.1 (3005, 5437, 6384) |
| `NEXTAUTH_URL` | no | the URL you open in the browser; keep in sync with `COMPLIBOT_PORT` |
| `TRUST_PROXY`, `RATE_LIMIT_PER_MINUTE` | no | rate limiting behind a proxy |

## Development

```bash
npm install            # also runs prisma generate
npm run typecheck
npm test               # Vitest
npm run lint
npm run build
```

Run the app with hot reload against the Docker database and Redis:

```bash
docker compose up -d complibot-postgres complibot-redis complibot-init
npm run dev            # http://localhost:3005, uses DATABASE_URL / REDIS_* from .env
```

`npm run db:seed` seeds from the host using `DATABASE_URL` in `.env`.

Tests cover keyword retrieval against the demo knowledge base (the "Do you encrypt customer data at rest?" question must retrieve both encryption entries), question-column detection, questionnaire status transitions, the parser, confidence scoring and benchmark scoring.

`scripts/benchmark.ts` scores AI answers against reference answers (token-F1 per domain):

```bash
npx tsx scripts/benchmark.ts scripts/benchmark-sample.json 0.5
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `cannot execute: required file not found` in the Postgres container | the clone has CRLF line endings from an old checkout: `git rm --cached -r . && git reset --hard` |
| `Bind for 127.0.0.1:3005 failed: port is already allocated` | set `COMPLIBOT_PORT` (and `NEXTAUTH_URL`) in `.env`, or `COMPLIBOT_DB_PORT` / `COMPLIBOT_REDIS_PORT` |
| Generation returns 502 "No answers could be generated" | Ollama not reachable from the container or `OLLAMA_MODEL` not pulled. The questionnaire stays in PARSED status; fix and click Generate again |
| Login fails with the seed password | the password is only set when the demo users are first created; `docker compose down -v` resets the database |

## License

MIT, see [LICENSE](LICENSE).
