# unified-coding-plan-balancer — Design Document

> 统一管理所有 AI Provider 的 baseUrl / header / key，对外提供单一入口，并支持配额感知的智能路由、双协议互转、流式响应、细粒度用量统计与自带管理后台。

---

## 1. 目标

1. **统一入口**：客户端只需对接一套 endpoint，即可访问任意上游 AI 服务商。
2. **双协议兼容**：对外同时暴露 **OpenAI** 与 **Anthropic** 两套 API；每个 Provider 可分别配置各协议的端点和密钥。客户端必须使用与其协议匹配的端点，不支持跨协议转换。
3. **解耦模型与上游**：同一个逻辑模型（`model_id`）可挂在多个 Provider 上，每个 Provider 上有不同的 `real_model_id` 和参数覆盖。
4. **配额感知路由**：后台定时刷新各 Provider 剩余配额，请求时优先选择剩余量最多的；失败自动降级到下一个候选。
5. **可观测**：完整记录调用日志、流式 TTFT、输出 TPS、Input / Cached Input / Output token 数，按分钟 × API Key × Model × Provider 聚合。
6. **自带管理后台**：通过用户名 / 密码登录，可视化管理 Provider、Model、ProviderModel、API Key，查看用量仪表盘。
7. **自托管友好**：单 Docker 容器部署，配置与密钥全部存数据库。

---

## 2. 架构总览

```
                        ┌──────────────────────────────────────────┐
                        │            Client (OpenAI SDK)           │
                        │            Client (Anthropic SDK)        │
                        └──────────────────┬───────────────────────┘
                                           │  HTTPS
                                           ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │                    unified-coding-plan-balancer (Next.js)         │
   │                                                                  │
   │  ┌────────────────────┐  ┌─────────────────────────────────────┐ │
   │  │   /v1/* Endpoints  │──│  API-Key Auth Middleware            │ │
   │  └─────────┬──────────┘  └─────────────────────────────────────┘ │
   │            ▼                                                     │
   │  ┌────────────────────┐    ┌──────────────────────────────────┐  │
   │  │  Param Resolver    │◀───│  SQLite + Prisma                 │  │
   │  │ (user > pm > model)│    │  data/config.sqlite              │  │
   │  └─────────┬──────────┘    │  Model / Provider / ProviderModel│  │
   │            ▼               │  ApiKey / AdminUser              │  │
   │  ┌────────────────────┐    │  ProviderQuotaSnapshot           │  │
   │  │ Quota-Aware Router │◀───┤                                  │  │
   │  └─────────┬──────────┘    └──────────────────────────────────┘  │
   │            ▼                            ▲                        │
   │  ┌────────────────────┐    ┌────────────┴────────────────────┐   │
   │  │ Provider Adapter   │    │  Quota Refresher (worker, 60s)  │   │
  │  │ (protocol format)  │    └─────────────────────────────────┘   │
   │  └─────────┬──────────┘                                          │
   │            ▼                                                     │
   │  ┌────────────────────┐    ┌──────────────────────────────────┐  │
   │  │ Metrics Collector  │───▶│  Memory Buffer ──▶ SQLite shards │  │
   │  │ (TTFT, TPS, tokens)│    │  data/logs/YYYY-MM-DD.sqlite     │  │
   │  └─────────┬──────────┘    │  data/stats/YYYY-MM.sqlite       │  │
   │            ▼               │  data/archive/YYYY.sqlite        │  │
   └────────────┼───────────────└──────────────────────────────────┘──┘
                ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │   Upstream Providers (OpenAI / Anthropic / Azure / OpenRouter ...) │
   └────────────────────────────────────────────────────────────────────┘
```

---

## 3. 数据模型

### 3.1 SQLite（Prisma）— 配置类强一致数据

> 单文件 `data/config.sqlite`，由 Prisma 管理。零外部依赖，与指标分片同盘，统一通过 Docker volume 持久化。
>
> 以下用 Prisma DSL 风格描述；实际落地以 `prisma/schema.prisma` 为准。SQLite provider 不支持 `enum`，统一用 `String` 字段并在应用层用联合类型约束。

#### 3.1.1 Model — 逻辑模型 / 共享默认值

`Model.id` 即对外暴露的 `model_id`，客户端调用时使用。

```prisma
model Model {
  id                          String   @id              // 对外 model_id, 如 "gpt-4o"
  displayName                 String
  contextLength               Int
  maxTokens                   Int
  temperature                 Float?
  topP                        Float?
  topK                        Int?
  reasoningEffort             String?                   // "low" | "medium" | "high" | null
  includeReasoningInRequest   Boolean  @default(false)
  enabled                     Boolean  @default(true)
  createdAt                   DateTime @default(now())
  updatedAt                   DateTime @updatedAt

  providerModels              ProviderModel[]
}
```

#### 3.1.2 Provider — 上游服务商

```prisma
model Provider {
  id                     String   @id                   // e.g. "openai-official", "azure-eu"
  name                   String
  baseUrlOpenai          String?                        // OpenAI-compatible endpoint URL
  apiKeyOpenai           String?                        // API key for OpenAI endpoint
  baseUrlAnthropic       String?                        // Anthropic-compatible endpoint URL
  apiKeyAnthropic        String?                        // API key for Anthropic endpoint
  headersTemplate        String                         // JSON-encoded extra headers
  enabled                Boolean  @default(true)
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  providerModels         ProviderModel[]
  quotaSnapshot          ProviderQuotaSnapshot?
}
```

#### 3.1.3 ProviderModel — 模型在 Provider 上的实例（含覆盖项）

> 同一 `modelId` 可对应多个 Provider；`realModelId` 即上游真实模型 id。

```prisma
model ProviderModel {
  id                                  String   @id @default(cuid())
  modelId                             String                          // FK -> Model.id
  providerId                          String                          // FK -> Provider.id
  realModelId                         String                          // 上游真实 model id

  // 以下字段全部可选; NULL 则继承 Model 的对应字段
  contextLengthOverride               Int?
  maxTokensOverride                   Int?
  temperatureOverride                 Float?
  topPOverride                        Float?
  topKOverride                        Int?
  reasoningEffortOverride             String?
  includeReasoningInRequestOverride   Boolean?

  // 路由权重（同等剩余量时使用）
  weight                              Int      @default(1)
  enabled                             Boolean  @default(true)

  createdAt                           DateTime @default(now())
  updatedAt                           DateTime @updatedAt

  model                               Model    @relation(fields: [modelId], references: [id])
  provider                            Provider @relation(fields: [providerId], references: [id])

  @@unique([modelId, providerId])
  @@index([modelId])
  @@index([providerId])
}
```

#### 3.1.4 ApiKey — 对外签发的 key

> 明文 key 形如 `sk-y6-<rand>`，前缀**固定**为 `sk-y6-`（常量, 不入表）。DB 仅存 `SHA-256(明文)`；明文只在创建瞬间返回一次。本网关不做限流和预算，仅做统计。

```prisma
model ApiKey {
  id         String    @id @default(cuid())
  keyHash    String    @unique                  // SHA-256(明文 key)
  name       String
  enabled    Boolean   @default(true)
  createdAt  DateTime  @default(now())
  lastUsedAt DateTime?
}
```

#### 3.1.5 AdminUser — 后台用户

```prisma
model AdminUser {
  id           String   @id @default(cuid())
  username     String   @unique
  passwordHash String                                // bcrypt
  createdAt    DateTime @default(now())
}
```

#### 3.1.6 ProviderQuotaSnapshot — 配额缓存

由后台 worker 定时（默认 60s）刷新，路由器读取此表，不在请求路径上访问上游配额接口。

```prisma
model ProviderQuotaSnapshot {
  providerId         String   @id                  // FK -> Provider.id
  usagePercent       Float?                        // 0–100; 越低越优先；null = 未知
  fetchedAt          DateTime
  healthy            Boolean  @default(true)
  consecutiveErrors  Int      @default(0)
  raw                String?                       // 上游原始响应 (JSON), 便于审计

  provider           Provider @relation(fields: [providerId], references: [id])
}
```

### 3.2 SQLite 分片存储 — 指标 / 日志

> **严格隔离**：所有指标 / 日志表 **绝对不走 Prisma**，统一通过 `lib/metrics/shardStore.ts` 用 `better-sqlite3` 访问。

```
data/
  logs/      YYYY-MM-DD.sqlite     ← 调用明细, 按天分片
  stats/     YYYY-MM.sqlite        ← 分钟聚合, 按月分片
  archive/   YYYY.sqlite           ← 长期归档 (小时/天级), 按年分片
```

#### 3.2.1 `logs/YYYY-MM-DD.sqlite` → `request_log`

```sql
CREATE TABLE IF NOT EXISTS request_log (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  ts                   INTEGER NOT NULL,           -- epoch ms
  api_key_id           TEXT    NOT NULL,
  model_id             TEXT    NOT NULL,           -- 对外 model_id
  provider_id          TEXT    NOT NULL,
  real_model_id        TEXT    NOT NULL,
  api_mode_in          TEXT    NOT NULL,           -- 客户端用的协议 (openai|anthropic)
  api_mode_out         TEXT    NOT NULL,           -- 上游用的协议
  stream               INTEGER NOT NULL,           -- 0/1
  status               INTEGER NOT NULL,           -- HTTP status
  error_code           TEXT,
  ttft_ms              INTEGER,                    -- 首 token 时延
  tps_out              REAL,                       -- 输出 token/s
  latency_ms           INTEGER,                    -- 总耗时
  input_tokens         INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens        INTEGER NOT NULL DEFAULT 0,
  ip                   TEXT
);
CREATE INDEX IF NOT EXISTS idx_request_log_ts            ON request_log(ts);
CREATE INDEX IF NOT EXISTS idx_request_log_key_ts        ON request_log(api_key_id, ts);
CREATE INDEX IF NOT EXISTS idx_request_log_model_ts      ON request_log(model_id, ts);
CREATE INDEX IF NOT EXISTS idx_request_log_provider_ts   ON request_log(provider_id, ts);
```

#### 3.2.2 `stats/YYYY-MM.sqlite` → `usage_minute`

按 `(minute, api_key_id, provider_id, model_id)` 维度聚合。

```sql
CREATE TABLE IF NOT EXISTS usage_minute (
  minute               INTEGER NOT NULL,           -- epoch min (ts / 60000)
  api_key_id           TEXT    NOT NULL,
  provider_id          TEXT    NOT NULL,
  model_id             TEXT    NOT NULL,

  requests             INTEGER NOT NULL DEFAULT 0,
  requests_ok          INTEGER NOT NULL DEFAULT 0,
  requests_err         INTEGER NOT NULL DEFAULT 0,

  input_tokens         INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens        INTEGER NOT NULL DEFAULT 0,

  ttft_ms_sum          INTEGER NOT NULL DEFAULT 0,
  ttft_ms_count        INTEGER NOT NULL DEFAULT 0,
  tps_out_sum          REAL    NOT NULL DEFAULT 0,
  tps_out_count        INTEGER NOT NULL DEFAULT 0,

  PRIMARY KEY (minute, api_key_id, provider_id, model_id)
);
CREATE INDEX IF NOT EXISTS idx_usage_minute_key   ON usage_minute(api_key_id, minute);
CREATE INDEX IF NOT EXISTS idx_usage_minute_model ON usage_minute(model_id, minute);
```

#### 3.2.3 `archive/YYYY.sqlite` → `usage_hour`, `usage_day`

下采样后的长期数据，结构与 `usage_minute` 相同，只是粒度不同。

### 3.3 连接池与写入策略

- `lib/metrics/shardStore.ts` 维护 `Map<shardKey, Database>` 的 LRU 缓存（默认上限 16）
- 打开时执行 `PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;`
- 表结构按需 `CREATE TABLE IF NOT EXISTS`
- 写入：
  - 明细 → `MetricsBuffer` 内存缓冲 → 每 1s 或满 500 条 → 单事务批量 INSERT
  - 聚合 → 每分钟 worker → `INSERT ... ON CONFLICT(...) DO UPDATE SET ...`
- 读取（仪表盘）→ `lib/metrics/queryRouter.ts` 按时间窗自动选分片并 union

---

## 4. 参数解析与优先级

### 4.1 优先级链

```
用户请求体  >  ProviderModel 覆盖  >  Model 默认值
```

### 4.2 字段分类

| 参数                           | 用户可覆盖 | 备注                                                                                        |
| ------------------------------ | ---------- | ------------------------------------------------------------------------------------------- |
| `temperature`                  | ✅         | 从请求体读                                                                                  |
| `top_p`                        | ✅         | 从请求体读                                                                                  |
| `top_k`                        | ✅         | OpenAI body 用 `top_k` 透传; Anthropic 原生支持                                             |
| `reasoning_effort`             | ✅         | OpenAI 使用 `reasoning_effort` 字段; Anthropic 使用 `thinking`                              |
| `max_tokens`                   | ✅ 有上限  | 用户值与 `ProviderModel.maxTokensOverride ?? Model.maxTokens` 取 `min`                      |
| `include_reasoning_in_request` | ✅         | 决定是否把上一轮 reasoning 内容回传给上游                                                   |
| `context_length`               | ❌         | 硬限制, 仅管理员可配                                                                        |
| `api_mode`                     | ❌         | 由客户端请求的 endpoint 决定（`/v1/chat/completions` → openai，`/v1/messages` → anthropic） |
| `real_model_id`                | ❌         | 内部路由用, 用户不可见也不可改                                                              |

### 4.3 解析函数

```ts
function resolveModelParams(
  model: Model,
  provider: Provider,
  pm: ProviderModel,
  userOverrides: UserOverrides,
): ResolvedParams {
  const maxTokensCap = pm.maxTokensOverride ?? model.maxTokens;
  return {
    contextLength: pm.contextLengthOverride ?? model.contextLength, // 不可覆盖
    apiMode: "openai", // 由请求 endpoint 决定
    realModelId: pm.realModelId, // 不可覆盖

    temperature:
      userOverrides.temperature ?? pm.temperatureOverride ?? model.temperature,
    topP: userOverrides.topP ?? pm.topPOverride ?? model.topP,
    topK: userOverrides.topK ?? pm.topKOverride ?? model.topK,
    reasoningEffort:
      userOverrides.reasoningEffort ??
      pm.reasoningEffortOverride ??
      model.reasoningEffort,
    includeReasoning:
      userOverrides.includeReasoning ??
      pm.includeReasoningInRequestOverride ??
      model.includeReasoningInRequest,

    maxTokens: Math.min(userOverrides.maxTokens ?? maxTokensCap, maxTokensCap),
  };
}
```

> **强制约束**：Adapter 层必须使用 `resolveModelParams()` 的结果向上游发请求，**禁止**直接把客户端 body 透传。

---

## 5. 配额感知路由

### 5.1 调度算法

```
INPUT: model_id, userOverrides
1. candidates = ProviderModel.findMany({
       where: { modelId, enabled: true, provider: { enabled: true } }
     })
   joined with ProviderQuotaSnapshot
2. 过滤:
     - quotaSnapshot.healthy === false           → 排除
     - 处于临时降权窗口 (recent failure < 60s)    → 排除
3. 排序:
     primary key  = usagePercent ASC   (越低越优先; null 视为 0 、与最低同类)
     secondary    = weight DESC, random tie break
4. 顺序尝试:
     for c in candidates:
       try:
         resolved = resolveModelParams(c.model, c, userOverrides)
         response = adapter.dispatch(c.provider, resolved, requestBody)
         emitMetrics(...)
         return response
       catch (RetryableError):                   // 429 / 5xx / timeout
         markTransientFailure(c.provider, 60s)
         continue
       catch (FatalError):
         emitMetrics(..., status=error)
         throw
5. 全部失败 → 502 + 聚合错误信息
```

`usagePercent` 说明:

- 由 `QuotaHandler.getUsagePercent()` 返回，表示当前周期已用比例（0–100）
- 返回 `null` 表示不可知（如 `NoopQuotaHandler`），排序时视为 0（与最低同优先）
- 越低越优先。例：40% 优先于 80%。

### 5.2 QuotaHandler 接口

```ts
export interface QuotaHandler {
  /**
   * 返回当前计费/额度周期内已使用的百分比（0–100）。
   * 返回 `null` 表示未知（不参与排序）。
   * 失败时抛错, 由 refresher 负责重试与降级。
   */
  getUsagePercent(provider: ResolvedProvider): Promise<{
    usagePercent: number | null;
    raw?: unknown;
  }>;
}
```

`ResolvedProvider` 是已组装好 headers 与 apiKey 的 Provider 视图。

### 5.3 内置实现

| 类名                     | 说明                                                                     |
| ------------------------ | ------------------------------------------------------------------------ |
| `OpenAIQuotaHandler`     | 调用 OpenAI billing/usage 接口                                           |
| `AnthropicQuotaHandler`  | 调用 Anthropic usage 接口（如可用），否则回退到 header 解析              |
| `OpenRouterQuotaHandler` | 调用 OpenRouter `/api/v1/credits`                                        |
| `StaticQuotaHandler`     | 返回固定 `usagePercent`（如 0 表示总是未耗用）, 用于无配额查询接口的上游 |
| `NoopQuotaHandler`       | 返回 `null`, 不参与排序                                                  |

### 5.4 注册与反射加载

```ts
// lib/quota/registry.ts
const registry: Record<string, new () => QuotaHandler> = {
  OpenAIQuotaHandler,
  AnthropicQuotaHandler,
  OpenRouterQuotaHandler,
  StaticQuotaHandler,
  NoopQuotaHandler,
};

export function getQuotaHandler(name: string): QuotaHandler {
  const Ctor = registry[name];
  if (!Ctor) throw new Error(`Unknown quota handler: ${name}`);
  return new Ctor();
}
```

### 5.5 刷新 Worker

- 默认每 `QUOTA_REFRESH_INTERVAL_MS = 60000` 触发
- 并发度可配, 默认 4
- 单 Provider 连续失败 3 次 → `healthy = false`, 仅靠下一次成功恢复
- 写入 `ProviderQuotaSnapshot`

---

## 6. Provider Adapter 与双协议互转

### 6.1 协议矩阵

| 客户端协议 (`api_mode_in`) | Provider 协议 (`api_mode_out`) | 处理                                        |
| -------------------------- | ------------------------------ | ------------------------------------------- |
| OpenAI                     | OpenAI                         | 直通（仍需 `resolveModelParams` 重组 body） |
| Anthropic                  | Anthropic                      | 直通                                        |

> ⚠️ **不支持跨协议路由。** 客户端协议必须与 Provider 配置的端点协议一致。

### 6.2 Adapter 接口

```ts
export interface ProviderAdapter {
  /** 非流式 */
  chat(req: NormalizedChatRequest): Promise<NormalizedChatResponse>;
  /** 流式 */
  chatStream(req: NormalizedChatRequest): AsyncIterable<NormalizedChatChunk>;
}
```

入口层先把客户端请求规范化为 `NormalizedChatRequest`，Adapter 根据客户端 endpoint 对应的协议转成对应上游格式；响应流直接以同协议返回。

### 6.3 协议格式要点

- **System message**：OpenAI 用 `messages[0].role = "system"`，Anthropic 用顶层 `system` 字段
- **Tool calls / function calling**：OpenAI 和 Anthropic 各自格式不同，客户端协议必须与上游一致
- **Reasoning**：OpenAI `reasoning_effort` ↔ Anthropic `thinking.budget_tokens`，各自原生支持
- **Stream chunk**：OpenAI 的 `data: {choices:[{delta:...}]}\n\n`，Anthropic 的 `event: content_block_delta`，分别处理

---

## 7. 鉴权

### 7.1 管理后台 — 用户名 / 密码

- 基于 NextAuth Credentials Provider
- `passwordHash` 用 bcrypt (cost 12)
- Session 通过 httpOnly cookie，过期时间 8 小时
- 路由级中间件：所有 `app/(admin)/**` 与 `app/api/admin/**` 必须有 session

### 7.2 对外 API — Bearer API Key

- 客户端：`Authorization: Bearer sk-y6-xxxxx`
- 服务端：取 SHA-256(key) → 查 `ApiKey.keyHash`
- 命中后写入 `requestContext.apiKey`，更新 `lastUsedAt`
- **明文 key 仅在创建时返回一次**，DB 永不存明文

### 7.3 初始化管理员

容器首次启动时，如 `AdminUser` 表为空，则用 `ADMIN_INIT_USERNAME` / `ADMIN_INIT_PASSWORD` 创建默认账号，并在日志中打印提示要求登录后修改密码。

---

## 8. 流式与指标采集

### 8.1 采集点

| 指标                  | 采集方式                                                                               |
| --------------------- | -------------------------------------------------------------------------------------- |
| `ttft_ms`             | 流式：从写出请求到收到首个 token chunk；非流式：到首 byte                              |
| `tps_out`             | `output_tokens / (latency_ms - ttft_ms) * 1000`                                        |
| `latency_ms`          | 请求开始到响应结束                                                                     |
| `input_tokens`        | 上游响应 `usage.prompt_tokens` / `usage.input_tokens`                                  |
| `cached_input_tokens` | 上游响应 `usage.prompt_tokens_details.cached_tokens` / `usage.cache_read_input_tokens` |
| `output_tokens`       | 上游响应 `usage.completion_tokens` / `usage.output_tokens`                             |

### 8.2 写入流水线

```
请求结束
   ▼
MetricsBuffer.push(record)              ← 内存队列, 容量阈值 5000
   ▼
Flusher (interval = METRICS_FLUSH_INTERVAL_MS, default 1s)
   ▼
shardStore.openLog(date).transaction(... batch INSERT ...)
   ▼
data/logs/YYYY-MM-DD.sqlite
```

### 8.3 分钟聚合 Worker

- 每分钟（在 :05 秒触发, 留 buffer flush 余量）
- 读取上一分钟的 `request_log`，按 `(api_key_id, provider_id, model_id)` 分组
- `INSERT ... ON CONFLICT DO UPDATE` 写入当月 `usage_minute`
- 异常容忍：失败不阻塞下一轮，记录到 server 日志

### 8.4 归档 Worker（每日 04:00）

- `LOG_RETENTION_DAYS` 之前的 `logs/*.sqlite` → 删除
- `STAT_RETENTION_MONTHS` 之前的 `stats/*.sqlite` → 下采样到 `archive/YYYY.sqlite` 的 `usage_hour` / `usage_day`，原文件删除

---

## 9. 指标查询路由

`lib/metrics/queryRouter.ts` 根据请求时间窗自动选择分片：

| 时间窗    | 数据源                               |
| --------- | ------------------------------------ |
| ≤ 24h     | 当天 + 昨天的 `logs/*.sqlite`        |
| 24h ~ 30d | 当月 + 必要时上月的 `stats/*.sqlite` |
| 30d ~ 24m | 跨多个 `stats/*.sqlite`              |
| > 24m     | `archive/YYYY.sqlite` 的小时/天表    |

所有查询都通过该 router 走，避免业务代码直接访问分片文件。

---

## 10. 对外 API 规范

### 10.1 OpenAI 兼容

| Method | Path                   | 说明                                          |
| ------ | ---------------------- | --------------------------------------------- |
| `POST` | `/v1/chat/completions` | 支持流式 `stream=true` 与非流式               |
| `POST` | `/v1/embeddings`       | 走同一套路由                                  |
| `GET`  | `/v1/models`           | **去重后的 `model_id` 列表**, 不暴露 Provider |

### 10.2 Anthropic 兼容

| Method | Path           | 说明                  |
| ------ | -------------- | --------------------- |
| `POST` | `/v1/messages` | 支持流式 SSE 与非流式 |

### 10.3 请求规则

- 客户端**不能**指定 Provider，路由层永远自主决定
- body 中的 `model` 字段必须是 `Model.id`（即对外 `model_id`），由路由层在内部替换为 `realModelId` 后再向上游发送
- 用户可在 body 中覆盖 `temperature` / `top_p` / `top_k` / `max_tokens` / `reasoning_effort` 等参数（参见 §4）

### 10.4 错误码

| 网关错误                               | HTTP | 说明                               |
| -------------------------------------- | ---- | ---------------------------------- |
| 缺失或无效 API Key                     | 401  |                                    |
| 未知 `model_id` 或无可用 ProviderModel | 404  |                                    |
| 全部候选 Provider 失败                 | 502  | response.body 含每个候选的失败摘要 |
| 网关内部错误                           | 500  |                                    |

---

## 11. 管理后台

### 11.1 页面

| 路径               | 功能                                                                     |
| ------------------ | ------------------------------------------------------------------------ |
| `/login`           | 用户名 / 密码登录                                                        |
| `/providers`       | Provider 列表、创建、编辑、启停、测试连通性                              |
| `/models`          | Model 列表与默认参数配置                                                 |
| `/provider-models` | ProviderModel 列表，按 model_id 分组展示候选与覆盖项                     |
| `/api-keys`        | 签发、撤销、查看用量与额度                                               |
| `/usage`           | 仪表盘：TTFT / TPS 折线、按 model / key / provider 的 token 与费用堆叠图 |
| `/logs`            | 调用日志查询（接 `queryRouter`）                                         |
| `/quota`           | 各 Provider 当前 snapshot 与健康度，手动触发刷新                         |
| `/settings`        | 修改密码、管理员账号                                                     |

### 11.2 仪表盘核心指标

- 总请求数 / 错误率
- Input / Cached Input / Output token 趋势
- p50 / p95 TTFT
- 平均 TPS
- 按 ApiKey、Model、Provider 的 top N
- 按分钟 / 小时 / 天的时间序列

---

## 12. 部署与配置

### 12.1 Docker 单容器

零外部依赖：配置库（`data/config.sqlite`）与指标分片（`data/{logs,stats,archive}/*.sqlite`）共用同一个 `data/` 目录，整体挂卷即可完成持久化与备份。

```
Dockerfile
  - Node 20 alpine
  - 内置 better-sqlite3 (需 build-base)
  - prisma generate + next build
ENTRYPOINT:
  1. mkdir -p data/logs data/stats data/archive
  2. prisma migrate deploy           # 作用于 data/config.sqlite
  3. seedAdminIfEmpty()
  4. startWorkers()                  // QuotaRefresher / Flusher / Aggregator / Archiver
  5. next start
```

### 12.2 必需环境变量

| 变量           | 说明                                                            |
| -------------- | --------------------------------------------------------------- |
| `DATABASE_URL` | Prisma 连接串, 默认 `file:./data/config.sqlite`（相对工作目录） |

| `NEXTAUTH_SECRET` | NextAuth session 签名 |
| `ADMIN_INIT_USERNAME` | 首次初始化管理员用户名 |
| `ADMIN_INIT_PASSWORD` | 首次初始化管理员密码 |

### 12.3 可选环境变量

| 变量                        | 默认  | 说明                   |
| --------------------------- | ----- | ---------------------- |
| `LOG_RETENTION_DAYS`        | 30    | 调用明细保留天数       |
| `STAT_RETENTION_MONTHS`     | 24    | 分钟聚合保留月数       |
| `QUOTA_REFRESH_INTERVAL_MS` | 60000 | 配额刷新间隔           |
| `METRICS_FLUSH_INTERVAL_MS` | 1000  | 指标 buffer flush 间隔 |
| `METRICS_FLUSH_BATCH_SIZE`  | 500   | flush 触发阈值         |
| `SQLITE_POOL_MAX`           | 16    | LRU 连接池上限         |
| `QUOTA_REFRESH_CONCURRENCY` | 4     | 并行刷新 Provider 数   |

### 12.4 必需挂卷

- `/app/data` → 宿主机持久化（包含 `config.sqlite` 配置库 + `logs/` / `stats/` / `archive/` 指标分片）

### 12.5 docker-compose 参考

```yaml
services:
  router:
    image: unified-coding-plan-balancer:latest
    environment:
      DATABASE_URL: file:./data/config.sqlite
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      ADMIN_INIT_USERNAME: admin
      ADMIN_INIT_PASSWORD: ${ADMIN_INIT_PASSWORD}
    volumes:
      - ./data:/app/data
    ports: ["3000:3000"]
```

---

## 13. 安全约束

1. Provider `apiKey` 以**明文**存储在 `config.sqlite`；**永不**进入业务日志、HTTP 响应、错误信息（含堆栈）
2. Provider `apiKey` 仅在 session 保护的后台 API 中可读
3. 对外 API Key 明文仅在签发瞬间显示一次；DB 仅存 SHA-256 hash
4. `NEXTAUTH_SECRET` 必须在容器外部以 secret 形式注入
5. 后台所有写操作均需 CSRF token（NextAuth 内建）
6. 调用日志中的 `messages` 内容**默认不持久化**（仅记录 token 数），如需开启需显式打开 `LOG_PAYLOADS=true` 并自行承担合规风险

---

## 14. 扩展点（未来）

- 按 ApiKey 的限流 / 预算 / 模型 scope
- Provider apiKey 落盘加密（AES-256-GCM + KEK）
- Webhook 告警：Provider 健康下降 / 配额低于阈值
- Embedding / Image / Audio 模型类型扩展
- 多租户隔离（ApiKey 之上加 Org 层）
