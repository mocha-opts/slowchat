# 工程代理指南

本文件适用于仓库根目录及所有子目录。所有自动化代理、代码生成工具和贡献者在修改仓库前必须阅读并遵守本文件。

## 1. 权威来源

发生冲突时按以下优先级执行：

1. 用户在当前任务中的明确指示；
2. [spec.md](./spec.md) 中的产品需求、外部接口和系统不变量；
3. [adr/](./adr/) 中已接受的架构、技术设计和工程规范；
4. [plan.md](./plan.md) 中的阶段顺序和交付门槛；
5. [prd.md](./prd.md) 原始需求基线。

`prd.md` 用于追溯原始上下文，不作为实现细节的最终解释。若上层文档之间仍有无法消除的冲突，不得自行发明行为；记录冲突并请求确认。

## 2. 项目基线

- 技术栈：NestJS、TypeScript、PostgreSQL、TypeORM、Redis、RabbitMQ、BullMQ、MinIO/S3、Socket.IO。
- 代码架构：模块化单体 Monorepo；不采用 DDD，不拆成细粒度微服务。
- 运行架构：API、Realtime、Event Worker、Job Worker 四个独立进程。
- 数据事实：PostgreSQL 是唯一永久业务事实源。
- 可靠事件：Transactional Outbox + RabbitMQ，语义为至少一次投递与幂等消费。
- 实时通知：Socket.IO + Redis Adapter；WebSocket 不是离线恢复来源。
- 延迟和耗时任务：BullMQ；不得承载领域事件或消息 Fan-out。
- 对象存储：只依赖 S3 兼容接口，Bucket 默认私有。
- 运行时与工具链：Node.js `24.13.0`、pnpm `11.13.0`、原生 ESM、TypeScript `6.0.3`。
- 包管理与构建：pnpm Workspace + Turborepo；依赖版本精确锁定并提交 `pnpm-lock.yaml`。

只使用根 `package.json` 已声明的 scripts：

| 目的 | 命令 |
| --- | --- |
| 安装依赖 | `pnpm install --frozen-lockfile` |
| 启动完整开发环境 | `pnpm dev` |
| 分别启动四进程 | `pnpm dev:api`、`pnpm dev:realtime`、`pnpm dev:event-worker`、`pnpm dev:job-worker` |
| 启停基础设施 | `pnpm infra:up`、`pnpm infra:down` |
| 静态检查 | `pnpm format:check`、`pnpm lint`、`pnpm typecheck` |
| 测试 | `pnpm test`、`pnpm test:unit`、`pnpm test:contract`、`pnpm test:integration`、`pnpm test:e2e` |
| 构建与冒烟 | `pnpm build`、`pnpm smoke` |
| Migration | `pnpm db:migration:show`、`pnpm db:migration:run`、`pnpm db:migration:revert`、`pnpm db:migration:generate` |

本地运行前复制 `.env.example` 为 `.env`，真实 `.env` 不得提交。`pnpm smoke` 使用动态空闲端口，不受本机默认端口占用影响；基础设施定义位于 `deploy/docker/compose.yml`。

## 3. 不可破坏的系统不变量

- 只有消息事务提交 PostgreSQL 后才能返回 `ACCEPTED`。
- 同一会话的顺序由 `conversation_id + seq` 唯一确定，禁止以时间戳代替。
- 客户端重试必须复用 `clientMessageId`；数据库保持 `(sender_id, client_message_id)` 唯一。
- 消息事务同时写业务数据和 Outbox，事务内禁止发布 RabbitMQ。
- Outbox、RabbitMQ Consumer 和 BullMQ Processor 均必须允许安全重复执行。
- RabbitMQ Consumer 使用 Consumer Inbox 或等价的事务性幂等记录，并在事务提交后 ACK。
- Delivered/Read 使用只前进的游标，不建立群聊逐消息、逐成员永久回执。
- Redis、RabbitMQ、BullMQ 和 WebSocket 均不得保存唯一消息事实。
- 丢失实时事件后必须能通过 `user_sync_events + conversation seq` 恢复。
- `user_sync_events` 由 Event Worker 消费 Outbox 事件后幂等投影生成，不在消息事务中直接写每用户同步事件。
- 外部 API、WebSocket、领域事件、消息 Payload 和 Job Payload 必须显式版本化。

完整不变量以 [spec.md §5](./spec.md#5-系统不变量汇总) 和 [技术设计](./adr/technical-design.md) 为准。

## 4. 进程职责

### API Process

负责 Auth、用户、联系人、会话和群组、消息历史、REST 发送兜底、Sync、上传凭证、开放平台配置、管理 API 和 OpenAPI。不得承载长连接、RabbitMQ Consumer、文件字节转发或媒体转码。

### Realtime Process

负责 WebSocket 鉴权、连接和房间、消息命令、实时投递、Delivered/Read、Presence/Typing、心跳和 Session Revoked。写命令必须调用与 HTTP 共用的 Command Service。

### Event Worker

负责 Outbox Relay、RabbitMQ Consumer、实时分发、同步投影、推送、Bot 事件、Moderation、Audit 和 Analytics。Consumer 按产生的副作用归属，不按事件来源归属。

### Job Worker

负责媒体处理、Webhook 重试、清理、修复、定时消息、保留策略和周期统计。Processor 必须幂等并使用稳定 Job ID。

## 5. 模块与依赖规则

- Controller、Gateway、Consumer、Processor 只做协议适配、上下文提取、路由和错误映射，不写核心业务逻辑。
- HTTP 和 WebSocket 必须调用同一套应用 Service；禁止复制业务规则。
- 写事务边界放在 Command Service；查询逻辑放在 Query Service。
- TypeORM 事务内只使用传入的 Transaction Manager，不混用全局 Repository。
- Feature Entity、Repository、Service 和协议适配器保留在 Feature 内；Migration 全局集中管理。
- 业务模块不得直接使用其他模块的 Entity Repository，只能调用对方明确导出的 Service。
- Platform 层不得依赖业务模块；`@im/contracts` 不得依赖任何框架或基础设施 SDK。
- `common` 只接收被三个以上模块复用、且没有业务语义的代码。
- 禁止滥用 `forwardRef`，禁止无业务意义的 `BaseService`、`BaseRepository` 和复杂 Consumer 继承树。
- Entity 不得直接序列化为外部响应；通过 DTO/Schema 和 Mapper 映射。
- Redis Key 只能由统一 Factory 创建，业务代码不得手写 Key 字符串。

推荐调用方向：

```text
Controller / Gateway / Consumer / Processor
  -> Handler / Application Service
  -> Domain-specific Service / Permission Service
  -> Repository / Outbox Writer / Platform Adapter
```

模块和目录细节见 [工程规范](./adr/standards.md)。

## 6. 数据、事务与异步处理

- 所有 Schema 变更必须提供可回滚或有明确恢复方案的 Migration；生产环境禁止 `synchronize: true`。
- 单聊、会话序号、消息幂等和事件幂等必须由数据库唯一约束兜底，不能只依赖应用检查。
- 列表接口统一使用 Cursor；消息历史使用 Seq Cursor，禁止 Offset Page。
- Outbox 采用短事务 Claim、事务外 Publish、Publisher Confirm、成功后标记的流程。
- RabbitMQ 使用 Durable/Quorum Queue、Persistent Message、`mandatory=true`、Manual ACK、Retry 和 DLQ。
- 禁止无限 `nack(requeue=true)`；临时错误进入 Retry，永久错误进入 DLQ。
- BullMQ Job 必须包含版本、稳定 Job ID、超时、有限重试、指数退避和随机抖动。
- 媒体 Complete 必须重新 HEAD 校验对象；Media Processor 只能由 Job Worker 执行，状态和 Variant 写入必须幂等并与媒体 Outbox 事件同事务提交。
- 媒体响应、消息 Payload 和同步事件不得暴露完整 Object Key 或 Presigned URL；只有 `READY` 附件可发送和下载。
- Redis Realtime 与 Redis Jobs 使用独立 Connection、ACL、Prefix 和指标；生产环境优先独立实例。

## 7. 接口与协议规则

- REST 前缀为 `/api/v1`，所有写命令返回稳定错误码和 `requestId`。
- 所有改变状态的 WebSocket Command 必须返回 ACK。
- 外部事件必须包含 `eventId` 和 `eventVersion`；消息必须包含 `type`、`contentVersion` 和 `payload`。
- 不兼容变更必须提升版本，不得修改已发布字段的含义。
- Contract-first：先更新 `@im/contracts` Schema/类型和契约测试，再更新服务端与 SDK。
- 不得在日志、错误详情或遥测属性中泄露密码、Token、API Secret、完整私聊正文和完整预签名 URL。

## 8. 测试要求

每次改动按风险提供相应测试：

- 纯业务规则：单元测试。
- Repository、事务、Outbox、Consumer、BullMQ、Storage：使用真实依赖或 Testcontainers 的集成测试。
- API、WebSocket、事件和消息 Schema：契约测试与向后兼容检查。
- 跨进程用户旅程：E2E 测试。
- 可靠性机制：覆盖提交/发布/ACK 边界崩溃、重复投递、服务暂时不可用和并发游标推进。
- 性能敏感改动：按 [plan.md](./plan.md) 的容量场景做压测或提供影响说明。

测试不得通过放宽不变量、删除断言或隐藏错误来“修复”。若既有行为与 `spec.md` 冲突，以规格为准并在变更中说明兼容影响。

## 9. Definition of Done

一项实现只有同时满足以下条件才可标记完成：

1. 对应 `FR/NFR/INV/AC` 已明确，行为与 Contracts 一致。
2. 代码位于正确模块和进程，没有跨层或跨模块 Repository 访问。
3. Migration、幂等、重试、权限、安全和降级路径已考虑。
4. 相关单元、集成、契约或 E2E 测试通过。
5. 日志、指标、健康检查和告警按风险补齐，且不泄露敏感信息。
6. 文档、示例和计划状态与实现同步。
7. 所有进程能优雅关闭；生产部署不依赖 `synchronize: true`。

## 10. 文档维护

- 产品行为、验收或公开协议改变：更新 `spec.md`。
- 架构或关键技术决策改变：先更新相应 ADR 的状态、上下文、决策与影响。
- 阶段、依赖或交付门槛改变：更新 `plan.md`。
- 工程规则或代理工作方式改变：更新 `AGENTS.md` 或 `adr/standards.md`。
- 保留相对链接和需求编号；不得复制出互相冲突的第二份权威定义。
