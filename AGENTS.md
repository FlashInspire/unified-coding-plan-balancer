# AGENTS.md — unified-coding-plan-balancer

> 给 AI Agent（以及人类贡献者）的工程约定与操作手册。任何代码生成、修改、新增功能前请先通读本文件，并以 `DESIGN.md` 为架构权威。

---

## 1. 项目简介

`unified-coding-plan-balancer` 是一个自托管的 AI 网关服务。它统一管理所有上游 AI Provider 的 `baseUrl` / `header` / `apiKey`，对外提供 **OpenAI** 与 **Anthropic** 两套协议兼容的入口，并支持配额感知的智能路由、双协议互转、流式响应、细粒度用量统计与可视化管理后台。

详细架构与数据模型见 [`DESIGN.md`](./DESIGN.md)。

---

## 2. 技术栈

| 类别         | 选择                                            |
| ------------ | ----------------------------------------------- |
| 框架         | Next.js 15（App Router）+ TypeScript（strict）  |
| 数据库       | PostgreSQL + Prisma                             |
| 鉴权（后台） | NextAuth Credentials Provider + bcrypt          |
| 鉴权（API）  | Bearer API Key（SHA-256 hash 比对）             |
| UI           | Tailwind CSS + shadcn/ui                        |
| 入参校验     | Zod                                             |
| 图表         | Recharts（或 visx）                             |
| HTTP 客户端  | `fetch` + `undici`（流式）                      |
| 加密         | —（v1 不加密；Provider apiKey 明文存数据库）    |
| 部署         | Docker 单容器 + PostgreSQL（所有数据 → 数据库） |

---

## 3. 目录结构

```
.
├── app/
│   ├── (admin)/                  # 管理后台 UI, 受 session 保护
│   │   ├── login/
│   │   ├── providers/
│   │   ├── models/
│   │   ├── provider-models/
│   │   ├── api-keys/
│   │   ├── usage/
│   │   ├── logs/
│   │   ├── quota/
│   │   └── settings/
│   └── api/
│       ├── v1/                   # 对外协议兼容入口
│       │   ├── chat/completions/route.ts       # OpenAI
│       │   ├── messages/route.ts               # Anthropic
│       │   ├── embeddings/route.ts             # OpenAI
│       │   └── models/route.ts                 # OpenAI
│       └── admin/                # 后台管理 API, session 保护
│           ├── providers/
│           ├── models/
│           ├── provider-models/
│           ├── api-keys/
│           ├── usage/
│           └── quota/
├── lib/
│   ├── adapters/                 # Provider 协议适配 + 双协议互转
│   │   ├── base.ts               # ProviderAdapter 接口
│   │   ├── openai.ts
│   │   ├── anthropic.ts
│   │   └── translate/            # openai<->anthropic 双向转换
│   ├── routing/
│   │   ├── resolveParams.ts      # §4 参数优先级解析
│   │   ├── selectCandidate.ts    # 配额感知排序
│   │   └── dispatch.ts           # 失败 fallback 循环
│   ├── quota/                    # Provider 配额字段与自动重置 worker
│   ├── auth/
│   │   ├── nextauth.ts           # Credentials Provider 配置
│   │   ├── apiKey.ts             # 对外 API Key 中间件 (前缀固定 sk-y6-)
│   │   └── password.ts           # bcrypt 封装
│   ├── metrics/
│   │   ├── buffer.ts             # MetricsBuffer (in-memory ring)
│   │   ├── flusher.ts            # 批量写入 request_log (PostgreSQL)
│   │   ├── liveReportUpdater.ts  # 每个请求实时增量写入 aggregate_report
│   │   ├── reportAggregator.ts   # 仅 truncateToGranularity 工具函数
│   │   ├── staleLogCleaner.ts    # 标记滞留 in-flight 日志为 aborted
│   │   ├── archiver.ts           # 归档 + 清理 (deleteMany)
│   │   └── queryRouter.ts        # 跨表查询 API
│   ├── cron/                     # /api/cron 拆分后的独立任务
│   │   ├── flush.task.ts
│   │   ├── staleLogs.task.ts
│   │   ├── userTokenFlush.task.ts
│   │   ├── apiKeyTokenFlush.task.ts
│   │   ├── quotaReset.task.ts
│   │   ├── archive.task.ts
│   │   └── ensureLatestReports.task.ts
│   ├── repositories/             # Prisma 操作统一封装
│   │   ├── providerRepo.ts
│   │   ├── modelRepo.ts
│   │   ├── providerModelRepo.ts
│   │   ├── apiKeyRepo.ts
│   │   └── adminUserRepo.ts
│   ├── workers/
│   │   └── bootstrap.ts          # 启动期占位（实际周期任务在 /api/cron）
│   └── utils/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── data/                         # gitignored, Docker volume
│   ├── logs/
│   ├── stats/
│   └── archive/
├── docker/
│   └── Dockerfile
├── docker-compose.yml
├── DESIGN.md
├── AGENTS.md
├── README.md
└── package.json
```

---

## 4. 编码规范

### 4.1 通用

- **TypeScript strict**，禁用 `any`（如必须用，加 `// eslint-disable-next-line` 并注释原因）
- 模块边界清晰：`app/api/*/route.ts` 只做参数校验 + 调用 `lib/`，**不写业务逻辑**
- 所有外部输入（HTTP body / query / header）必须用 Zod schema 校验
- 所有 Prisma 调用必须经过 `lib/repositories/*` 封装，不在路由 handler 里直接 `prisma.xxx.findMany`

### 4.2 模型参数

- 任何向上游发请求的 body **必须**通过 `lib/routing/resolveParams.ts` 中的 `resolveModelParams()` 计算最终参数
- 严禁把客户端 body 直接透传给上游
- 优先级链：`用户请求 > ProviderModel.*Override > Model.*`
- 不可被用户覆盖的字段：`context_length` / `real_model_id`
- `max_tokens` 可被用户覆盖但需取 `min(用户值, ProviderModel.maxTokensOverride ?? Model.maxTokens)`

### 4.3 指标 / 日志

- `request_log` / `aggregate_report` 由 Prisma 管理，直接通过 Prisma Client 读写
- `aggregate_report` 在每次请求成功/失败后由 `liveReportUpdater.updateLatestReports` 实时增量写入；`/api/cron` 不再扫 `request_log` 重新聚合，只负责把过期的 `latest=true` 行翻面
- 所有读写可经 `lib/metrics/queryRouter.ts` 或直接用 Prisma
- 业务代码禁止在请求路径上做同步阻塞操作

### 4.4 安全

- Provider `apiKey` （明文存 DB）**禁止**：
  - 写入任何业务日志
  - 出现在 HTTP 响应中
  - 出现在错误信息（含堆栈）中
  - 错误脚本打印时统一 mask（仅保留前 4 后 4）
- 对外 API Key：明文只在 `POST /api/admin/api-keys` 创建瞬间返回一次；DB 仅存 `keyHash`；明文前缀固定 `sk-y6-`（在代码常量里，不入表）
- 错误信息向客户端返回时统一脱敏（不暴露上游 URL、Provider id）

### 4.5 命名与风格

- 文件名 `kebab-case`，类型/类名 `PascalCase`，函数/变量 `camelCase`，常量 `SCREAMING_SNAKE_CASE`
- 数据库字段 `snake_case`（通过 `@map`）/ `camelCase`（Prisma）
- 异步函数全部加 `async`，使用 `await`；禁止裸 `.then()` 链
- 提交规范：**Conventional Commits**（`feat:` / `fix:` / `refactor:` / `chore:` / `docs:` / `test:`）

---

## 5. 标准操作流程

### 5.1 新增一个 Provider

1. 在管理后台 `/providers` 新建，或写 seed 脚本
2. 填写 `id` / `name` / `baseUrlOpenai` / `apiKeyOpenai` / `baseUrlAnthropic` / `apiKeyAnthropic` / `headersTemplate`
   - 至少配置一组协议端点
3. 如需新协议适配，在 `lib/adapters/` 下新增；否则复用 `openai` / `anthropic`
4. 如需新的配额查询逻辑，按 §5.3 流程
5. 在 `/quota` 页面点 "刷新" 验证 snapshot 可正常拉取

### 5.2 新增一个 Model

> **重要**：先建 Model，再为多个 Provider 建 ProviderModel。

1. 在 `/models` 新建 `Model`：
   - `id` 即对外 `model_id`（如 `gpt-4o`）
   - 配置默认 `contextLength` / `maxTokens` / `temperature` / `topP` / `topK` / `reasoningEffort` / `includeReasoningInRequest`
2. 在 `/provider-models` 为该模型挂接一个或多个 Provider：
   - `realModelId` 写上游真实 id（如 `gpt-4o-2024-11-20`）
   - 如该 Provider 上参数不同，填写对应 `*Override`
   - `weight` 默认 1
3. 调用 `GET /v1/models` 应能看到去重后的 `model_id`

### 5.3 Provider 配额与计数器

1. Provider 表直接包含 quota 字段：`rollingQuota`、`weekQuota`、`monthQuota`，以及对应的 `rollingQuotaUsed`、`weekQuotaUsed`、`monthQuotaUsed` 计数器。
2. 所有配额计数器由后台 worker 自动重置：

- 每 5 小时清零 rollingQuotaUsed
- 每周一 0:00 清零 weekQuotaUsed
- 每月 1 号 0:00 清零 monthQuotaUsed

3. 业务代码直接读写 provider 上的 quota 字段，无需 handler 机制。

### 5.4 新增一个对外端点

1. 在 `app/api/v1/<path>/route.ts` 创建 Route Handler
2. 用 Zod 校验请求
3. 通过 `lib/auth/apiKey.ts` 中间件鉴权
4. 调用 `lib/routing/dispatch.ts`
5. 流式响应使用 `ReadableStream` + `Response` 返回，并把指标采集挂在 stream 关闭事件上

### 5.5 数据库迁移

```bash
pnpm prisma migrate dev --name <change>
pnpm prisma generate
```

提交时务必把 `prisma/migrations/` 一起提交。

---

## 6. 测试要求

| 模块                           | 必需测试                                                      |
| ------------------------------ | ------------------------------------------------------------- |
| `lib/adapters/translate/`      | 单元测试覆盖 openai↔anthropic 双向，含流式 chunk 序列         |
| `lib/routing/resolveParams.ts` | 表驱动测试覆盖三层优先级 + maxTokens 截断                     |
| `lib/routing/dispatch.ts`      | 集成测试：首选失败 → fallback 成功；全部失败 → 502            |
| `lib/quota/handlers/*`         | mock 上游 fetch 验证归一化输出                                |
| `lib/metrics/queryRouter.ts`   | 查询 API 覆盖 recentLogs / aggregateReport / apiKeyTokenUsage |
| `lib/auth/apiKey.ts`           | 无 key / 无效 key / 已停用 key 三种用例                       |

运行：

```bash
pnpm test          # vitest
pnpm test:watch
pnpm test:coverage
```

---

## 7. 常用命令

```bash
# 开发
pnpm install
pnpm dev                                # next dev
pnpm prisma migrate dev                 # 改完 schema.prisma 后
pnpm prisma studio                      # 浏览 PostgreSQL
pnpm lint
pnpm typecheck

# 测试
pnpm test
pnpm test:coverage

# 生产构建
pnpm build
pnpm start

# Docker
docker build -t unified-coding-plan-balancer -f docker/Dockerfile .
docker compose up -d
docker compose logs -f router
```

---

## 8. 必读 / 必知红线

| ❌ 禁止                                                  | ✅ 替代方案                                 |
| -------------------------------------------------------- | ------------------------------------------- |
| 在 route handler 里直接调 `prisma.*`                     | 通过 `lib/repositories/*`                   |
| 把 client request body 直接透传给上游                    | 先 `resolveModelParams()` 重组 body         |
| 把 `request_log` / `usage_*` 表加进 `schema.prisma`      | 走 `lib/metrics/shardStore.ts`              |
| 业务代码禁止直接 `import Database from 'better-sqlite3'` | 所有 DB 操作走 Prisma                       |
| 在日志里打印 Provider apiKey 明文                        | 永远不打印；调试用 mask（仅保留前 4 后 4）  |
| 在响应/错误信息中暴露上游 URL / Provider id              | 统一脱敏                                    |
| 允许客户端通过 body / header 指定走某个 Provider         | 路由由网关决定，客户端只能传 `model_id`     |
| 同步阻塞操作（如同步 fs）放在请求路径上                  | 异步化；指标走 buffer 异步 flush            |
| 在 next dev 热重载里启动重复的 worker                    | 用 `globalThis.__ucpb_workers_started` 守卫 |

---

## 9. 环境变量速查

参见 `DESIGN.md` §12.2、§12.3。开发可在 `.env.local` 中：

```
DATABASE_URL=postgresql://user:pass@localhost:5432/ucpb
NEXTAUTH_SECRET=<random>
ADMIN_INIT_USERNAME=admin
ADMIN_INIT_PASSWORD=changeme
LOG_RETENTION_DAYS=30
STAT_RETENTION_MONTHS=24
```

---

## 10. Prisma v7 注意事项

### 10.1 必须使用 Driver Adapter

Prisma v7 **不再支持**在 `schema.prisma` 的 `datasource` 块中写 `url = env("DATABASE_URL")`，也不再支持向 `PrismaClient` 构造函数传入 `datasourceUrl`。

**正确做法**：通过 `@prisma/adapter-pg` 显式传入连接字符串：

```ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
```

- `lib/prisma.ts` 已按此方式实现（包含 `globalThis` 单例守卫）
- 脚本（如 `scripts/migrate-to-pg.ts`）也须同样方式初始化 `PrismaClient`

### 10.2 Schema 规则

- `datasource db` 块只写 `provider = "postgresql"`，**不写 `url`**
- 连接 URL 仅在 `prisma.config.ts`（CLI 使用）和运行时 `PrismaPg` adapter 中配置

### 10.3 脚本顶层 `await`

`tsx` 默认以 CJS 格式执行，**不支持顶层 `await`**。所有脚本的入口逻辑必须包在 IIFE 中：

```ts
(async () => {
  // ...
})();
```

### 10.4 已安装的相关包

| 包                               | 位置            | 用途                                              |
| -------------------------------- | --------------- | ------------------------------------------------- |
| `@prisma/adapter-pg`             | dependencies    | Prisma v7 PostgreSQL driver adapter               |
| `pg`                             | dependencies    | Node.js PostgreSQL 客户端（adapter 依赖）         |
| `@types/pg`                      | devDependencies | pg 类型定义                                       |
| `@prisma/adapter-better-sqlite3` | devDependencies | 仅迁移脚本读取旧 SQLite 数据，不用于 PrismaClient |

---

## 11. PR 与代码评审

- 任何对**路由 / 鉴权 / 指标流水线**模块的改动必须附带测试
- 任何对 `prisma/schema.prisma` 的改动必须附 migration
- 任何新增 Provider / Model 类的能力必须同步更新本文件与 `DESIGN.md`
- PR 描述需说明：背景、变更点、测试覆盖、是否影响数据迁移
