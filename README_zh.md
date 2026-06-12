# Unified Coding Plan Balancer

> 自托管的 AI 网关，将所有上游 AI 服务商统一到一个入口 —— 支持配额感知智能路由、双协议互转、流式响应、完整指标采集与内置管理后台。（原名 Unified AI Router）

[English](./README.md) | [中文](./README_zh.md)

---

## ⚠️ 公告

> **本项目大量基于 AI 生成的代码。** 绝大部分代码、架构决策和文档由 AI 编程助手生成。Including this document but not this phrase. 虽然经过审查和测试，但在生产环境中使用时请自行判断。欢迎提交 Issue 和贡献代码。

---

## ⚠️ 已知问题

- **Output TPS（每秒输出 Token 数）仅供参考。** 由于无法获取上游服务商的后端指标，TPS 完全基于墙钟时间和输出 Token 数估算，仅作为粗略参考，非精确测量。

---

## 🧪 实验性功能：跨协议转换

> **本网关支持实验性的跨协议转换。** 当客户端协议与上游服务商配置的端点不匹配时，网关会自动进行请求和响应的协议转换。
>
> 例如，OpenAI 协议客户端可以调用仅配置了 Anthropic 端点的服务商（反之亦然）。转换层负责请求规范化、响应格式转换和流式 Chunk 适配。
>
> ⚠️ 跨协议转换目前为**实验性功能**。虽然基本功能可用，但可能无法保留所有服务商特定特性（如推理块、Tool Use 边界场景）。建议在条件允许时优先使用匹配协议。

---

## 这是什么？

Unified Coding Plan Balancer 是一个部署在你的应用和多个上游 AI 服务商之间的网关服务。支持 OpenAI、Anthropic、Azure、OpenRouter、火山引擎等。你不再需要为每个服务商管理独立的 API Key、Base URL 和协议差异 —— **一个统一入口搞定一切**。

```
┌──────────────────┐       ┌──────────────────────────────┐       ┌──────────────────────┐
│  你的应用        │──────▶│   Unified Coding Plan Balancer  │──────▶│  上游 AI 服务商      │
│  (OpenAI SDK)    │       │   ┌────────────────────────┐ │       │  OpenAI / Anthropic  │
│  (Anthropic SDK) │◀──────│   │ 配额感知路由           │ │◀──────│  Azure / OpenRouter  │
│  (curl / httpie) │       │   │ 流式指标采集           │ │       │  火山引擎 / …        │
└──────────────────┘       │   │ 内置管理后台           │ │       └──────────────────────┘
                           │   └────────────────────────┘ │
                           └──────────────────────────────┘
```

**为什么需要它？**

- 🔑 **一个 API Key** 访问所有服务商
- 🔄 **自动故障转移** —— 服务商宕机或限流时，流量自动切换
- 🌐 **双协议支持** —— 同时暴露 OpenAI 和 Anthropic 兼容的 API 端点
- 📊 **完整可观测性** —— 逐请求日志、TTFT、TPS、Token 明细
- 🖥️ **内置管理后台** —— 可视化管理服务商、模型、API Key，查看用量仪表盘

---

## 功能特性

### 🔀 双协议支持

同时暴露 **OpenAI** 和 **Anthropic** 兼容的 API 端点。客户端必须使用与其协议匹配的端点。每个服务商可以分别配置各协议的端点和密钥（`baseUrlOpenai`/`apiKeyOpenai` 和 `baseUrlAnthropic`/`apiKeyAnthropic`）。

| 客户端协议 | 上游协议  | 处理方式      |
| :--------: | :-------: | ------------- |
|   OpenAI   |  OpenAI   | 直接透传      |
| Anthropic  | Anthropic | 直接透传      |
|   OpenAI   | Anthropic | 🧪 跨协议转换 |
| Anthropic  |  OpenAI   | 🧪 跨协议转换 |

> 🧪 **跨协议路由为实验性功能。** 当客户端与上游服务商使用不同协议时，网关会自动在 OpenAI 和 Anthropic 协议之间进行转换。

### 🎯 配额感知智能路由

- 每个 `model_id` 可绑定多个服务商（通过 `ProviderModel`）
- 后台 Worker 定期拉取各服务商的配额/计费状态
- 请求优先路由到**剩余配额最多**的服务商
- 失败时（429 / 5xx / 超时）自动降级到下一个候选
- 支持按 ProviderModel 配置路由权重

### 📡 流式与指标

- 两个协议均支持完整流式响应（`stream: true` / SSE）
- 逐请求指标：**TTFT**（首 Token 延迟）、**TPS**（每秒输出 Token 数）、总延迟
- Token 统计：`input_tokens`、`cached_input_tokens`、`output_tokens`
- 指标流水线：内存缓冲 → 1s 刷盘 → 按天 SQLite 分片 → 按月聚合 → 按年归档

### 🔐 安全

- **管理后台**：密码登录（bcrypt + NextAuth session）
- **API 访问**：Bearer Key 鉴权，SHA-256 哈希比对，前缀 `sk-y6-`
- **凭据隔离**：上游 API Key 绝不出现在日志、错误信息或 HTTP 响应中
- **入参校验**：所有请求体通过 Zod schema 验证

### 🏠 零外部依赖，自托管友好

- **无需外部数据库** —— 所有数据存储在 SQLite，位于 `./data/`
- 启动时自动执行数据库迁移
- 后台 Worker 自动启动（配额刷新、指标刷盘、聚合、归档）

### 📈 内置管理后台

- **服务商管理**：增删改查、启停、测试连通性、查看配额健康度
- **模型管理**：配置默认参数（上下文长度、最大 Token 数、温度等）
- **服务商模型**：将模型挂接到服务商，支持参数覆盖和路由权重
- **API Key**：创建、撤销、查看各 Key 的用量
- **用量仪表盘**：交互式图表 —— TTFT/TPS 趋势、按模型/Key/服务商的 Token 分布
- **请求日志**：可搜索、可按 Key/模型/服务商/状态筛选
- **配额面板**：实时查看各服务商配额快照，支持手动刷新
- **用户管理**：管理管理员账号（创建、启用/停用）
- **系统设置**：全局网关配置

---

## 快速开始

### 前置条件

- Node.js 22+
- pnpm

### 安装

```bash
# 克隆仓库
git clone https://github.com/FlashInspire/unified-coding-plan-balancer.git
cd unified-coding-plan-balancer

# 安装依赖
pnpm install
```

### 环境变量配置

```bash
cat > .env.local << 'EOF'
DATABASE_URL=file:./data/config.sqlite
NEXTAUTH_SECRET=$(openssl rand -base64 32)
ADMIN_INIT_USERNAME=admin
ADMIN_INIT_PASSWORD=your-secure-password
EOF
```

### 初始化 & 运行

```bash
# 执行数据库迁移
pnpm db:migrate

# 启动开发服务器
pnpm dev
```

打开 `http://localhost:3000` —— 管理后台在 `/login`。

### 首次配置（5 分钟）

1. **登录**：访问 `/login`，使用管理员账号密码
2. **添加服务商**：进入 `/providers`
   - 填写 `id`、`name`、各协议的 Base URL 和 API Key（`baseUrlOpenai`/`apiKeyOpenai`、`baseUrlAnthropic`/`apiKeyAnthropic`）、`headersTemplate`
   - 至少需要配置一组协议端点
   - 点击"测试"验证连通性
3. **添加模型**：进入 `/models`
   - `id` = 客户端将使用的模型名（如 `gpt-4o`、`claude-3-5-sonnet`）
   - 设置默认 `contextLength`、`maxTokens`、`temperature` 等
4. **关联服务商 ↔ 模型**：进入 `/provider-models`
   - 设置 `realModelId`（上游的真实模型 ID，如 `gpt-4o-2024-11-20`）
   - 按需覆盖参数；设置路由 `weight`
5. **创建 API Key**：进入 `/api-keys`
   - 立即复制 Key —— 仅显示一次（前缀：`sk-y6-`）

### 测试

```bash
# OpenAI 协议
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-y6-your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "你好！"}],
    "stream": true
  }'

# Anthropic 协议
curl http://localhost:3000/v1/messages \
  -H "Authorization: Bearer sk-y6-your-key" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-5-sonnet",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "你好！"}]
  }'
```

---

## API 端点

| 方法   | 路径                   | 协议      | 说明                                   |
| ------ | ---------------------- | --------- | -------------------------------------- |
| `POST` | `/v1/chat/completions` | OpenAI    | Chat 补全（支持流式与非流式）          |
| `POST` | `/v1/messages`         | Anthropic | Messages（支持流式与非流式）           |
| `POST` | `/v1/embeddings`       | OpenAI    | Embeddings                             |
| `GET`  | `/v1/models`           | OpenAI    | 列出可用模型（去重，不暴露服务商信息） |
| `GET`  | `/api/health`          | —         | 健康检查                               |

### 参数优先级

```
用户请求 > ProviderModel 覆盖 > Model 默认值
```

可覆盖：`temperature`、`top_p`、`top_k`、`max_tokens`（有上限）、`reasoning_effort`、`include_reasoning`

不可覆盖：`context_length`、`real_model_id`

---

## 配置

### 环境变量

| 变量                        | 默认值                  | 说明                                       |
| --------------------------- | ----------------------- | ------------------------------------------ |
| `DATABASE_URL`              | —                       | SQLite 路径（`file:./data/config.sqlite`） |
| `NEXTAUTH_SECRET`           | —                       | **必填。** Session 加密密钥                |
| `NEXTAUTH_URL`              | `http://localhost:3000` | 公网 URL（用于 Auth 回调）                 |
| `ADMIN_INIT_USERNAME`       | `admin`                 | 初始管理员用户名                           |
| `ADMIN_INIT_PASSWORD`       | —                       | **必填。** 初始管理员密码                  |
| `LOG_RETENTION_DAYS`        | `30`                    | 请求日志保留天数                           |
| `STAT_RETENTION_MONTHS`     | `24`                    | 聚合统计数据保留月数                       |
| `QUOTA_REFRESH_INTERVAL_MS` | `60000`                 | 配额刷新间隔（毫秒）                       |
| `QUOTA_REFRESH_CONCURRENCY` | `4`                     | 配额刷新最大并发请求数                     |
| `QUOTA_EXHAUST_THRESHOLD`   | `100`                   | 使用率超过此阈值的服务商将被跳过           |
| `METRICS_FLUSH_INTERVAL_MS` | `1000`                  | 指标缓冲刷盘间隔（毫秒）                   |
| `METRICS_FLUSH_BATCH_SIZE`  | `500`                   | 每次刷盘最大写入行数                       |
| `METRICS_BUFFER_MAX`        | `5000`                  | 内存指标缓冲区最大容量                     |
| `SQLITE_POOL_MAX`           | `16`                    | SQLite 连接池最大连接数                    |
| `NEXTAUTH_URL_INTERNAL`     | —                       | 内部 Base URL（反向代理场景）              |
| `DATA_DIR`                  | `./data`                | 数据目录路径                               |

### 数据目录结构

```
data/
├── config.sqlite              # 配置库（Prisma 管理）
├── logs/
│   └── YYYY-MM-DD.sqlite      # 请求日志（按天分片）
├── stats/
│   └── YYYY-MM.sqlite         # 分钟级聚合（按月分片）
└── archive/
    └── YYYY.sqlite            # 小时/天级归档（按年分片）
```

---

## 开发

```bash
pnpm dev                # 开发服务器（热重载）
pnpm build              # 生产构建
pnpm start              # 生产服务器
pnpm lint               # ESLint
pnpm typecheck          # TypeScript 严格类型检查
pnpm test               # 运行测试（vitest）
pnpm test:coverage      # 测试 + 覆盖率报告
pnpm db:migrate         # 创建迁移
pnpm db:deploy          # 执行迁移（生产环境）
pnpm db:studio          # 用 Prisma Studio 浏览 SQLite
```

### 项目结构

```
app/
├── (admin)/            # 管理后台页面（受 session 保护）
├── api/
│   ├── v1/             # 对外公开 API 端点
│   └── admin/          # 管理 API（受 session 保护）
lib/
├── adapters/           # OpenAI & Anthropic 协议适配器 + 双向转换
├── routing/            # 参数解析、候选排序、请求调度、活跃请求追踪
├── quota/              # 使用率计算、配额重置调度器
├── metrics/            # 缓冲、分片存储、刷盘、聚合、跨分片查询
├── repositories/       # Prisma 数据访问层
├── auth/               # NextAuth + API Key 鉴权 + Edge 配置
└── workers/            # 后台 Worker（配额、刷盘、聚合、归档）
prisma/
├── schema.prisma       # 数据库 Schema
└── migrations/         # 自动生成的迁移文件
```

---

## License

MIT
