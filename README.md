# Unified Coding Plan Balancer

> Self-hosted AI gateway that unifies all your AI providers behind a single endpoint — with quota-aware smart routing, dual-protocol translation, streaming support, and a built-in admin dashboard. (Formerly Unified AI Router)

[English](./README.md) | [中文](./README_zh.md)

---

## ⚠️ Announcement

> **This project is heavily based on AI-generated code.** Most of the codebase, architecture decisions, and documentation were produced with the assistance of AI coding agents. Including this document but not this phrase. While reviewed and tested, you should exercise your own judgment when using it in production. Contributions and issue reports are welcome.

---

## ⚠️ Known Issues

- **Output TPS (Tokens Per Second) is an estimate.** Without backend metrics from the upstream provider, TPS is calculated purely from wall-clock time and output token count. Use it as a rough reference, not an exact measurement.

---

## ⚠️ Important: Protocol Matching

> **This gateway does NOT perform cross-protocol translation.** The client protocol must match the upstream provider's protocol.
>
> If you are using an **Anthropic-protocol client** (e.g., Anthropic SDK, Claude Code), your upstream provider **must** have an Anthropic-compatible endpoint configured (`baseUrlAnthropic` + `apiKeyAnthropic`).
> If you are using an **OpenAI-protocol client** (e.g., OpenAI SDK), your upstream provider **must** have an OpenAI-compatible endpoint configured (`baseUrlOpenai` + `apiKeyOpenai`).
>
> Mixing protocols (e.g., Anthropic client → OpenAI upstream) is **not supported** and will result in errors.

---

## What Is It?

Unified Coding Plan Balancer sits between your applications and multiple upstream AI providers (OpenAI, Anthropic, Azure, OpenRouter, Volcengine, …). Instead of managing separate API keys, base URLs, and protocol quirks for each provider, you get **one unified endpoint** that handles everything.

```
┌──────────────────┐       ┌──────────────────────────────┐       ┌──────────────────────┐
│  Your Apps       │──────▶│   Unified Coding Plan Balancer  │──────▶│  Upstream Providers  │
│  (OpenAI SDK)    │       │   ┌────────────────────────┐ │       │  OpenAI / Anthropic  │
│  (Anthropic SDK) │◀──────│   │ Quota-Aware Routing    │ │◀──────│  Azure / OpenRouter  │
│  (curl / httpie) │       │   │ Streaming Metrics      │ │       │  Volcengine / …      │
└──────────────────┘       │   │ Admin Dashboard        │ │       └──────────────────────┘
                           │   └────────────────────────┘ │
                           └──────────────────────────────┘
```

**Why?**

- 🔑 **One API key** to access all providers
- 🔄 **Automatic failover** — when a provider is down or rate-limited, traffic shifts instantly
- 🌐 **Dual protocol support** — expose both OpenAI and Anthropic compatible endpoints simultaneously
- 📊 **Full observability** — per-request logs, TTFT, TPS, token breakdowns
- 🖥️ **Built-in admin UI** — manage providers, models, keys, and view dashboards

---

## Features

### 🔀 Dual Protocol Support

Expose both **OpenAI** and **Anthropic** compatible endpoints simultaneously. Clients must use the endpoint matching their protocol. Each provider can configure separate endpoints and keys for each protocol (`baseUrlOpenai`/`apiKeyOpenai` and `baseUrlAnthropic`/`apiKeyAnthropic`).

| Client (in) | Provider (out) | Handling           |
| :---------: | :------------: | ------------------ |
|   OpenAI    |     OpenAI     | Direct passthrough |
|  Anthropic  |   Anthropic    | Direct passthrough |

> ⚠️ **Cross-protocol routing is not supported.** OpenAI clients cannot call Anthropic providers and vice versa.

### 🎯 Quota-Aware Smart Routing

- Each `model_id` can be backed by multiple providers (via `ProviderModel`)
- A background worker periodically fetches each provider's quota/billing status
- Requests are routed to the provider with the **most remaining quota** first
- On failure (429 / 5xx / timeout), automatically falls back to the next candidate
- Configurable routing weights per ProviderModel

### 📡 Streaming & Metrics

- Full streaming support for both protocols (`stream: true` / SSE)
- Per-request metrics: **TTFT** (Time to First Token), **TPS** (Tokens Per Second), latency
- Token accounting: `input_tokens`, `cached_input_tokens`, `output_tokens`
- Metrics pipeline: memory buffer → 1s flush → daily SQLite shards → monthly aggregation → yearly archive

### 🔐 Security

- **Admin dashboard**: password login (bcrypt + NextAuth session)
- **API access**: Bearer key auth with SHA-256 hash comparison (prefix `sk-y6-`)
- **Credential isolation**: provider API keys never appear in logs, errors, or HTTP responses
- **Input validation**: all request bodies validated with Zod

### 🏠 Zero-Dependency Self-Hosting

- **No external databases** required — everything in SQLite under `./data/`
- Automatic schema migrations on startup
- Background workers auto-start (quota refresher, metrics flusher, aggregator, archiver)

### 📈 Admin Dashboard

- **Providers**: CRUD, enable/disable, test connectivity, view quota health
- **Models**: configure default parameters (context length, max tokens, temperature, etc.)
- **Provider Models**: link models to providers with per-provider overrides and weights
- **API Keys**: create, revoke, view usage per key
- **Usage**: interactive charts — TTFT/TPS trends, token breakdown by model/key/provider
- **Logs**: searchable request log with filtering by key, model, provider, status
- **Quota**: live snapshot of each provider's quota with manual refresh
- **Users**: manage admin accounts (create, enable/disable)
- **Settings**: global gateway configuration

---

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/unified-coding-plan-balancer.git
cd unified-coding-plan-balancer

# Install dependencies
pnpm install
```

### Environment Setup

```bash
cat > .env.local << 'EOF'
DATABASE_URL=file:./data/config.sqlite
NEXTAUTH_SECRET=$(openssl rand -base64 32)
ADMIN_INIT_USERNAME=admin
ADMIN_INIT_PASSWORD=your-secure-password
EOF
```

### Initialize & Run

```bash
# Run database migrations
pnpm db:migrate

# Start development server
pnpm dev
```

Open `http://localhost:3000` — the admin dashboard is at `/login`.

### First-Time Setup (5 min)

1. **Login** at `/login` with your admin credentials
2. **Add a Provider** at `/providers`
   - Fill in `id`, `name`, protocol-specific base URLs and API keys (`baseUrlOpenai`/`apiKeyOpenai`, `baseUrlAnthropic`/`apiKeyAnthropic`), and `headersTemplate`
   - At least one protocol pair must be configured
   - Click "Test" to verify connectivity
3. **Add a Model** at `/models`
   - `id` = the model name clients will use (e.g. `gpt-4o`, `claude-3-5-sonnet`)
   - Set default `contextLength`, `maxTokens`, `temperature`, etc.
4. **Link Provider ↔ Model** at `/provider-models`
   - Set `realModelId` (the upstream's actual model id, e.g. `gpt-4o-2024-11-20`)
   - Override parameters if needed; set routing `weight`
5. **Create an API Key** at `/api-keys`
   - Copy the key immediately — it's only shown once (prefix: `sk-y6-`)

### Test It

```bash
# OpenAI protocol
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-y6-your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'

# Anthropic protocol
curl http://localhost:3000/v1/messages \
  -H "Authorization: Bearer sk-y6-your-key" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-5-sonnet",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## API Endpoints

| Method | Path                   | Protocol  | Description                                            |
| ------ | ---------------------- | --------- | ------------------------------------------------------ |
| `POST` | `/v1/chat/completions` | OpenAI    | Chat completions (streaming & non-streaming)           |
| `POST` | `/v1/messages`         | Anthropic | Messages (streaming & non-streaming)                   |
| `POST` | `/v1/embeddings`       | OpenAI    | Embeddings                                             |
| `GET`  | `/v1/models`           | OpenAI    | List available models (deduplicated, no provider leak) |
| `GET`  | `/api/health`          | —         | Health check                                           |

### Parameter Priority

```
User Request > ProviderModel Override > Model Default
```

Overridable: `temperature`, `top_p`, `top_k`, `max_tokens` (capped), `reasoning_effort`, `include_reasoning`

Not overridable: `context_length`, `real_model_id`

---

## Configuration

### Environment Variables

| Variable                    | Default                 | Description                               |
| --------------------------- | ----------------------- | ----------------------------------------- |
| `DATABASE_URL`              | —                       | SQLite path (`file:./data/config.sqlite`) |
| `NEXTAUTH_SECRET`           | —                       | **Required.** Session encryption secret   |
| `NEXTAUTH_URL`              | `http://localhost:3000` | Public URL for auth callbacks             |
| `ADMIN_INIT_USERNAME`       | `admin`                 | Initial admin username                    |
| `ADMIN_INIT_PASSWORD`       | —                       | **Required.** Initial admin password      |
| `LOG_RETENTION_DAYS`        | `30`                    | Days to keep request logs                 |
| `STAT_RETENTION_MONTHS`     | `24`                    | Months to keep aggregated stats           |
| `QUOTA_REFRESH_INTERVAL_MS` | `60000`                 | Quota refresh interval (ms)               |
| `QUOTA_REFRESH_CONCURRENCY` | `4`                     | Max concurrent quota refresh requests     |
| `QUOTA_EXHAUST_THRESHOLD`   | `100`                   | Usage % above which provider is skipped   |
| `METRICS_FLUSH_INTERVAL_MS` | `1000`                  | Metrics buffer flush interval (ms)        |
| `METRICS_FLUSH_BATCH_SIZE`  | `500`                   | Max rows per flush batch                  |
| `METRICS_BUFFER_MAX`        | `5000`                  | Max in-memory metrics buffer size         |
| `SQLITE_POOL_MAX`           | `16`                    | Max SQLite connection pool size           |
| `NEXTAUTH_URL_INTERNAL`     | —                       | Internal base URL (behind reverse proxy)  |
| `DATA_DIR`                  | `./data`                | Data directory                            |

### Data Layout

```
data/
├── config.sqlite              # Configuration (Prisma-managed)
├── logs/
│   └── YYYY-MM-DD.sqlite      # Request logs (daily shards)
├── stats/
│   └── YYYY-MM.sqlite         # Minute-level aggregation (monthly shards)
└── archive/
    └── YYYY.sqlite            # Hour/day-level archive (yearly shards)
```

---

## Development

```bash
pnpm dev                # Dev server (hot reload)
pnpm build              # Production build
pnpm start              # Production server
pnpm lint               # ESLint
pnpm typecheck          # TypeScript strict check
pnpm test               # Run tests (vitest)
pnpm test:coverage      # Tests with coverage report
pnpm db:migrate         # Create migration
pnpm db:deploy          # Apply migrations (production)
pnpm db:studio          # Browse SQLite with Prisma Studio
```

### Project Structure

```
app/
├── (admin)/            # Admin UI pages (session-protected)
├── api/
│   ├── v1/             # Public API endpoints
│   └── admin/          # Admin API (session-protected)
lib/
├── adapters/           # OpenAI & Anthropic protocol adapters + translation
├── routing/            # Parameter resolution, candidate selection, dispatch, active request tracking
├── quota/              # Usage percentage computation, quota reset scheduler
├── metrics/            # Buffer, shard store, flusher, aggregator, query router
├── repositories/       # Prisma data access layer
├── auth/               # NextAuth + API key auth + edge config
└── workers/            # Background workers (quota, flush, aggregate, archive)
prisma/
├── schema.prisma       # Database schema
└── migrations/         # Auto-generated migrations
```

---

## License

MIT
