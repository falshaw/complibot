# complibot

A self-hostable web app that drafts answers to vendor security questionnaires (SIG, CAIQ, ISO 27001, SOC 2 style spreadsheets) from your own security knowledge base, using retrieval-augmented generation on a local LLM.

## Why

Security questionnaires repeat the same questions in different wording. Answering them by hand means searching old spreadsheets and policies every time. complibot keeps a reviewed knowledge base of your answers, retrieves the closest entries for each new question, drafts an answer with a confidence score and citations, and leaves the final approval to a human reviewer. It runs on your own infrastructure with Ollama by default, so questionnaire content does not have to leave your servers.

## Features

- **Questionnaire upload and parsing** — Excel (`.xlsx`/`.xls`) and CSV; questions are extracted and classified by type (yes/no, text, date, numeric, …) and security domain (20 domains).
- **RAG answer generation** — hybrid search (pgvector cosine similarity + keyword search) over the knowledge base, then an LLM drafts each answer with a confidence score and the source entries it used. Generation runs in parallel with a concurrency cap.
- **Review workflow** — approve, reject, edit or regenerate answers; bulk-approve.
- **Export** — completed questionnaires back to CSV / Excel (format depends on plan tier).
- **Knowledge base** — import entries from spreadsheets/PDF sources, search, per-domain stats, and a **gap analysis** that shows thin domains.
- **Knowledge interview** — an AI-led interview that cycles through security domains and turns your replies into knowledge-base entries.
- **Templates** — seeded questionnaire templates (SIG Lite, CAIQ v4, VSA, NIST CSF, ISO 27001, CIS Controls v8, SOC 2 readiness).
- **Teams and RBAC** — multi-tenant organizations, invitations, roles.
- **Billing** — Stripe Checkout, customer portal and webhooks; Free / Pro / Enterprise plan limits on questionnaires, AI generations, KB entries and team size.
- **Audit log** — security-relevant actions recorded per organization.
- **Security** — CSRF protection in middleware, Redis-backed rate limiting, login lockout, input sanitization, AES-256-GCM field encryption, least-privilege database role, hardened containers (read-only root, dropped capabilities, resource limits).

## Architecture

```
Browser ── Next.js 16 (App Router, React 19)
             ├─ middleware: CSRF + NextAuth session guard
             ├─ API routes: rate limiting, RBAC, audit logging
             └─ services (src/lib/services/)
                  ├─ QuestionnaireParserService  Excel/CSV -> questions
                  ├─ SearchService               hybrid pgvector + keyword search
                  ├─ EmbeddingService            nomic-embed-text (768-dim) via Ollama
                  ├─ AnswerGenerationService     RAG prompt -> answer + confidence + sources
                  ├─ InterviewService            domain-cycling KB interview
                  └─ ExportService               answers -> CSV / Excel
PostgreSQL 16 + pgvector (Prisma 7 with the PrismaPg adapter)
Redis (rate limits, lockout, cache)
Ollama (chat model + embeddings)       Stripe (optional billing)
```

LLM calls go through `src/lib/ollama.ts`, an OpenAI-compatible client pointed at Ollama with a circuit breaker (5 failures -> 5 min open) and retries. Setting `LLM_PROVIDER=claude` routes chat completions to an optional HTTP bridge instead (`POST {CLAUDE_BRIDGE_URL}/generate` with `{prompt, system, model}`, returning `{ok, response}`); embeddings always stay on Ollama.

## Tech stack

Next.js 16, React 19, TypeScript, Tailwind CSS 4 + daisyUI, Prisma 7, PostgreSQL 16 + pgvector, Redis, NextAuth v5 (credentials), Stripe, ExcelJS, PapaParse, pdf-parse, Zod, Vitest, Docker Compose.

## Setup

### Prerequisites

- Docker + Docker Compose
- Node.js 24 (for local development, Prisma CLI and seeding)
- [Ollama](https://ollama.com) with the models pulled:
  ```bash
  ollama pull qwen2.5:7b
  ollama pull nomic-embed-text
  ```

### Run with Docker

```bash
cp .env.example .env            # fill in passwords, AUTH_SECRET, ENCRYPTION_KEY
docker compose up -d --build    # app on http://localhost:3005, Postgres on 5437, Redis on 6384
```

The app container reaches Ollama on the host via `host.docker.internal:11434` by default (override with `OLLAMA_HOST`).

### Create the schema and seed demo data

Run from the repo root on the host, with `DATABASE_URL` pointing at the Postgres superuser on `localhost:5437`:

```bash
npm install
npx prisma db push
npm run db:seed                 # demo org, admin@demo.com / reviewer@demo.com, sample KB, templates
```

The seed script prints the demo password (random unless `SEED_ADMIN_PASSWORD` is set).

Then add the pgvector column used for semantic search:

```bash
docker exec -i complibot-postgres psql -U postgres -d complibot <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "KnowledgeEntry" ADD COLUMN IF NOT EXISTS embedding vector(768);
CREATE INDEX IF NOT EXISTS knowledge_embedding_idx ON "KnowledgeEntry"
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
SQL
```

Without this column, search falls back to keyword matching only.

### Local development

```bash
docker compose up -d complibot-postgres complibot-redis
npm run dev                     # http://localhost:3005
```

### Production overlay

`deploy/docker-compose.prod.yml` adds Caddy (automatic TLS on 80/443), a bundled Ollama container and Stripe wiring on top of the base compose file:

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml \
  --env-file deploy/.env.prod up -d --build
```

It requires `COMPLIBOT_DOMAIN`, `COMPLIBOT_PUBLIC_URL` and the Stripe variables. It has not been validated on a live server yet.

## Configuration

See `.env.example` for all variables. The main ones:

| Variable | Required | Purpose |
|---|---|---|
| `POSTGRES_PASSWORD`, `COMPLIBOT_DB_PASSWORD` | yes | DB superuser and least-privilege app user |
| `REDIS_PASSWORD` | yes | Redis auth |
| `AUTH_SECRET` | yes | NextAuth signing secret |
| `ENCRYPTION_KEY` | yes | 64-char hex key for AES-256-GCM |
| `LLM_PROVIDER` | no | `ollama` (default) or `claude` |
| `OLLAMA_HOST`, `OLLAMA_MODEL` | no | default `http://localhost:11434`, `qwen2.5:7b` |
| `CLAUDE_BRIDGE_URL`, `CLAUDE_BRIDGE_TOKEN`, `CLAUDE_MODEL` | no | only for `LLM_PROVIDER=claude` |
| `STRIPE_*` | no | billing; checkout/portal are disabled without them |
| `TRUST_PROXY`, `RATE_LIMIT_PER_MINUTE` | no | rate limiting behind a proxy |
| `USE_MOCK_AUTH`, `MOCK_AUTH_*` | no | development-only mock login |

## Tests

```bash
npm test               # Vitest: parser, confidence scoring, usage display, benchmark scoring
npm run typecheck
npm run lint
```

`scripts/benchmark.ts` scores AI answers against reference answers (token-F1 per domain):

```bash
npx tsx scripts/benchmark.ts scripts/benchmark-sample.json 0.5
```

## License

MIT — see [LICENSE](LICENSE).
