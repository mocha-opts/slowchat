# Slowchat

Slowchat 是一个面向中型规模的可靠 IM 平台。产品规格、架构和实施顺序分别见
[spec.md](./spec.md)、[adr/](./adr/) 和 [plan.md](./plan.md)。

## 环境要求

- Node.js 24.13.x
- pnpm 11.13.x
- Docker Desktop / Docker Compose

## 快速开始

```bash
cp .env.example .env
pnpm install
pnpm dev
```

`pnpm dev` 会启动 PostgreSQL、两个 Redis、RabbitMQ、MinIO，初始化开发 Bucket，
幂等生成被忽略的 `.local/auth` RSA 开发密钥，然后并行启动 API、Realtime、Event Worker 和 Job Worker。

首次使用业务接口前执行：

```bash
pnpm db:migration:run
```

认证配置集中在 `.env.example` 的 `JWT_*` 与 `AUTH_*`。开发/测试可显式开启验证码回显；生产环境禁止开发密钥、弱 Pepper 和验证码回显，且真实邮件/短信供应商适配器将在后续部署集成中提供。

| 进程         | 端口 | Liveness       | Readiness       |
| ------------ | ---: | -------------- | --------------- |
| API          | 3000 | `/health/live` | `/health/ready` |
| Realtime     | 3001 | `/health/live` | `/health/ready` |
| Event Worker | 3002 | `/health/live` | `/health/ready` |
| Job Worker   | 3003 | `/health/live` | `/health/ready` |

常用命令见 [AGENTS.md](./AGENTS.md)。

REST API 位于 `/api/v1`。P2 提供认证、Session/Device、用户、隐私和联系人；P3 提供单聊、文本消息、Seq 历史、Delivered/Read 和会话视图；P5 增加群资料、成员、邀请/申请审批、角色、禁言、转让群主和解散。Realtime 进程接受 `message.send`、`message.delivered`、`conversation.read`，Event Worker 通过 Outbox 和 RabbitMQ 发布 `conversation.created`、`conversation.updated`、`message.created`、`receipt.updated`。

P3 的 Outbox/RabbitMQ 参数位于 `.env.example` 的 `OUTBOX_*` 和 `RABBITMQ_*`。P4 增加 `GET /api/v1/sync/events`、`GET /api/v1/sync/snapshot`、`POST /api/v1/sync` 和消息 Range 接口；同步事件由 `user_sync_events` 按用户游标保存，过期游标返回 `SYNC_CURSOR_EXPIRED`。公开 Schema、领域事件、同步协议和稳定错误码分别由 `@im/contracts/api`、`@im/contracts/websocket`、`@im/contracts/messages`、`@im/contracts/events` 与 `@im/contracts/errors` 提供。

SDK 包：`@im/sdk-core` 提供 REST/Socket 抽象、Token 刷新锁、ACK、重连和 Sync Coordinator；`@im/sdk-web` 提供 IndexedDB 和 BroadcastChannel 适配。P5 开放 `DIRECT/GROUP + TEXT/SYSTEM`；媒体、Bot 和高级消息按计划后续实现。
