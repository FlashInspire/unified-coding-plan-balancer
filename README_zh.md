# Unified Coding Plan Balancer

> 自托管的 AI 网关，将所有上游 AI 服务商统一到一个入口 —— 支持配额感知智能路由、双协议互转、流式响应、完整指标采集与内置管理后台。（原名 Unified AI Router）

[English](./README.md) | [中文](./README_zh.md)

---

## ⚠️ 公告

> **本项目大量基于 AI 生成的代码。** 绝大部分代码、架构决策和文档由 AI 编程助手生成。Including this document but not this phrase. 虽然经过审查和测试，但在生产环境中使用时请自行判断。欢迎提交 Issue 和贡献代码。

---

## ⚠️ 已知问题

- **API 协议转换仍处于实验阶段。** OpenAI 与 Anthropic 格式之间的双向协议转换（包括流式 chunk）仍在积极开发中，您可能会在以下场景遇到问题：
  - 跨协议的 Tool Calls / Function Calling
  - Reasoning（`thinking`）块的转换
  - 非标准消息内容类型（如图片输入）
  - 特定服务商组合下的 Stream chunk 重组

  如果遇到转换 Bug，请附带请求/响应 payload 提交 Issue。

- **仅 OpenAI 兼容接口（`/v1/chat/completions`）经过完整测试。** Anthropic 兼容接口（`/v1/messages`）以尽力提供的方式支持，无法保证在所有场景下正常工作。

- **Output TPS（每秒输出 Token 数）仅供参考。** 由于无法获取上游服务商的后端指标，TPS 完全基于墙钟时间和输出 Token 数估算，仅作为粗略参考，非精确测量。

---

## 这是什么？

Unified Coding Plan Balancer 是一个部署在你的应用和多个上游 AI 服务商之间的网关服务。支持 OpenAI、Anthropic、Azure、OpenRouter、火山引擎等。你不再需要为每个服务商管理独立的 API Key、Base URL 和协议差异 —— **一个统一入口搞定一切**。

```
┌──────────────────┐       ┌──────────────────────────────┐       ┌──────────────────────┐
│  你的应用        │──────▶│   Unified Coding Plan Balancer  │──────▶│  上游 AI 服务商      │
│  (OpenAI SDK)    │       │   ┌────────────────────────┐ │       │  OpenAI / Anthropic  │
│  (Anthropic SDK) │◀──────│   │ 协议自动互转           │ │◀──────│  Azure / OpenRouter  │
│  (curl / httpie) │       │   │ 配额感知路由           │ │       │  火山引擎 / …        │
└──────────────────┘       │   │ 流式指标采集           │ │       └──────────────────────┘
                           │   │ 内置管理后台           │ │
                           │   └────────────────────────┘ │
                           └──────────────────────────────┘
```

**为什么需要它？**

- 🔑 **一个 API Key** 访问所有服务商
- 🔄 **自动故障转移** —— 服务商宕机或限流时，流量自动切换
- 🌐 **协议互转** —— 用 OpenAI SDK 调用 Anthropic 模型，反之亦然
- 📊 **完整可观测性** —— 逐请求日志、TTFT、TPS、Token 明细
- 🖥️ **内置管理后台** —— 可视化管理服务商、模型、API Key，查看用量仪表盘

---

## 功能特性

### 🔀 双协议支持

同时暴露 **OpenAI** 和 **Anthropic** 兼容的 API 端点。使用任一协议的客户端都可以访问任意上游模型 —— 网关自动完成双向协议转换（包括流式 chunk）。

| 客户端协议 | 上游协议  | 处理方式    |
| :--------: | :-------: | ----------- |
|   OpenAI   |  OpenAI   | 直接透传    |
|   OpenAI   | Anthropic | 自动互转 ↑↓ |
| Anthropic  | Anthropic | 直接透传    |
| Anthropic  |  OpenAI   | 自动互转 ↑↓ |

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

---

## 快速开始

### 前置条件

- Node.js 22+
- pnpm

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-org/unified-coding-plan-balancer.git
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
   - 填写 `id`、`name`、`baseUrl`、`apiMode`（openai / anthropic）、`apiKey`
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

可覆盖：`temperature`、`top_p`、`top_k`、`max_tokens`（有上限）、`reasoning_effort`

不可覆盖：`context_length`、`api_mode`、`real_model_id`

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
| `METRICS_FLUSH_INTERVAL_MS` | `1000`                  | 指标缓冲刷盘间隔（毫秒）                   |
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
├── routing/            # 参数解析、候选排序、请求调度
├── quota/              # 各服务商配额查询处理器
├── metrics/            # 缓冲、分片存储、刷盘、聚合、跨分片查询
├── repositories/       # Prisma 数据访问层
├── auth/               # NextAuth + API Key 鉴权
└── workers/            # 后台 Worker（配额、刷盘、聚合、归档）
prisma/
├── schema.prisma       # 数据库 Schema
└── migrations/         # 自动生成的迁移文件
```

---

## License

MIT
