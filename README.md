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

首次使用 P2 业务接口前执行：

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

P2 的 REST API 位于 `/api/v1`，包含认证、Session/Device、当前用户、隐私、联系人、拉黑和举报。公开 Schema 与稳定错误码由 `@im/contracts/api`、`@im/contracts/websocket` 和 `@im/contracts/errors` 提供。
