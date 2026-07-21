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
然后并行启动 API、Realtime、Event Worker 和 Job Worker。

| 进程         | 端口 | Liveness       | Readiness       |
| ------------ | ---: | -------------- | --------------- |
| API          | 3000 | `/health/live` | `/health/ready` |
| Realtime     | 3001 | `/health/live` | `/health/ready` |
| Event Worker | 3002 | `/health/live` | `/health/ready` |
| Job Worker   | 3003 | `/health/live` | `/health/ready` |

常用命令见 [AGENTS.md](./AGENTS.md)。
