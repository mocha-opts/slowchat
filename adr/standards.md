# 工程与协议规范

> 状态：Accepted  
> 日期：2026-07-20  
> 决策范围：代码组织、依赖、协议、数据、安全、测试与评审规范  
> 代理执行指南：[../AGENTS.md](../AGENTS.md)  
> 系统规格：[../spec.md](../spec.md)  
> 技术设计：[technical-design.md](./technical-design.md)

## 1. 适用范围与关键词

本文适用于所有应用、Package、部署配置、Migration、测试和文档。

- **必须/禁止**：合并前必须满足，不允许无记录例外。
- **应当**：默认执行；偏离时在变更说明中给出理由和风险。
- **可以**：允许的实现选择，不构成强制要求。

若规范与产品行为冲突，以 [../spec.md](../spec.md) 为准；若需要改变已接受架构，先更新 ADR。

## 2. Monorepo 结构

目标结构：

```text
im-platform/
├── apps/
│   ├── im-server/
│   │   ├── src/
│   │   │   ├── entrypoints/
│   │   │   ├── compositions/
│   │   │   ├── modules/
│   │   │   ├── realtime/
│   │   │   ├── platform/
│   │   │   └── common/
│   │   └── test/
│   ├── admin-web/
│   └── example-chat-web/
├── packages/
│   ├── contracts/
│   ├── sdk-core/
│   ├── sdk-web/
│   ├── sdk-node/
│   ├── sdk-react/
│   ├── sdk-react-native/
│   ├── bot-sdk/
│   ├── test-utils/
│   ├── eslint-config/
│   └── typescript-config/
├── deploy/
│   ├── docker/
│   ├── kubernetes/
│   ├── nginx/
│   ├── rabbitmq/
│   ├── postgres/
│   ├── redis/
│   ├── minio/
│   └── terraform/
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── websocket/
│   ├── events/
│   ├── adr/
│   ├── threat-model/
│   └── runbooks/
├── scripts/
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
└── tsconfig.base.json
```

根目录当前的 `spec.md`、`plan.md`、`AGENTS.md` 和 `adr/` 是工程初始化前的权威文档。未来迁移到 `docs/` 时必须同步修复链接和权威来源声明，不能保留相互冲突的副本。

## 3. Entry Point 与 Composition

四个 Entry Point 固定为：

```text
api.main.ts
realtime.main.ts
event-worker.main.ts
job-worker.main.ts
```

每个 Entry Point 只负责进程启动、全局配置、信号处理和对应 Composition Module，不组装业务细节。Composition Module 只组合当前进程需要的 Feature Adapter 和 Platform Module；不得用一个全量 `AppModule` 启动所有进程。

进程职责以 [architecture.md §4](./architecture.md#4-进程与-composition-module) 为准。

## 4. Feature Module 结构

Feature 按业务能力组织，不按 Controller/Service/Entity 全局分层。以 Messages 为例：

```text
modules/messages/
├── messages.module.ts
├── services/
│   ├── message-command.service.ts
│   ├── message-query.service.ts
│   ├── message-permission.service.ts
│   ├── message-sequence.service.ts
│   └── message-idempotency.service.ts
├── http/
│   ├── messages-http.module.ts
│   ├── messages.controller.ts
│   ├── dto/
│   └── mappers/
├── realtime/
│   ├── messages-realtime.module.ts
│   ├── handlers/
│   └── mappers/
├── events/
│   ├── message-event.factory.ts
│   ├── message-event.publisher.ts
│   └── message-event.types.ts
├── persistence/
│   ├── entities/
│   ├── repositories/
│   └── messages-persistence.module.ts
├── validators/
├── mappers/
├── constants/
└── tests/
```

仅创建实际需要的目录；禁止为了形式提前生成空层。Feature Entity 留在 Feature 内，Migration 集中在 Platform Database 的 migrations 目录。

## 5. 分层与依赖方向

### 5.1 薄适配层

Controller、Gateway、Consumer、Processor 只能：

- 解析和验证协议 Envelope/DTO；
- 提取身份、请求和追踪上下文；
- 路由到 Handler 或 Service；
- 将稳定错误码映射为协议响应；
- 记录无敏感内容的入口/出口指标。

它们不得直接使用 TypeORM、手写 Redis Key、开启核心业务事务、做群权限判断、发布 RabbitMQ 或实现状态机。

Gateway 调用链必须保持：

```text
ImGateway
-> WsCommandRouter
-> WsCommandHandler
-> Feature Command Service
-> Repository / Outbox Writer
```

```ts
export interface WsCommandHandler<TInput, TOutput> {
  readonly event: string;
  handle(context: SocketContext, input: TInput): Promise<TOutput>;
}
```

### 5.2 Service 与事务

- HTTP 和 WebSocket 写入必须调用同一 Command Service。
- Command Service 定义事务边界、权限顺序、幂等和 Outbox；Query Service 不产生业务副作用。
- TypeORM 事务内只使用回调/上下文传入的 Transaction Manager。
- 不允许在业务层捕获异常后返回模糊成功；重复命令只能返回已存在的等价结果。

### 5.3 模块依赖

- Feature 之间通过明确导出的 Service 或 Contract 交互，不跨模块访问 Entity Repository。
- Platform 提供数据库、Redis、RabbitMQ、BullMQ、Storage、Config、Security、Logger、Observability、Health 等 Adapter，不依赖 Feature。
- `common` 只保存被至少三个模块复用且不含业务语义的 Decorator、Error、Filter、Pipe、Pagination、Type 或 Utility。
- 禁止滥用 NestJS `forwardRef`；出现循环依赖时重新划分接口或提取无业务依赖的 Port。
- 禁止无业务价值的通用 BaseService/BaseRepository；Consumer 使用组合而非复杂继承。

## 6. Consumer 和 Processor 归属

Consumer 按产生的副作用归属。例如：

```text
realtime/dispatch/event-worker/message-created-realtime.consumer.ts
modules/sync/event-worker/message-created-sync.consumer.ts
modules/notifications/event-worker/message-created-push.consumer.ts
modules/bots/event-worker/message-created-bot.consumer.ts
modules/moderation/event-worker/message-created-moderation.consumer.ts
```

每个 Consumer 有稳定 `consumerName`、独立 Inbox 幂等范围和可观察指标。一个 Consumer 不应同时完成多个可独立失败的外部副作用。

Processor 放在拥有 Job 结果的 Feature 下，必须通过稳定 Job ID 和目标状态检查实现可重复执行。

## 7. Contracts、版本与序列化

### 7.1 Contracts 包

所有公开协议统一进入 `@im/contracts`：

```ts
import {} from "@im/contracts/api";
import {} from "@im/contracts/websocket";
import {} from "@im/contracts/events";
import {} from "@im/contracts/messages";
import {} from "@im/contracts/errors";
```

Contracts 只包含 TypeScript 类型、运行时 Schema、Envelope、枚举、错误码、版本和序列化规则。禁止依赖 NestJS、TypeORM、Redis、RabbitMQ、BullMQ、MinIO/S3 SDK 或 Node-only Runtime API。

### 7.2 版本策略

- REST 大版本位于 URL；兼容字段新增不提升大版本，不兼容变更新增版本。
- WebSocket Command/Event Envelope 包含 `version`。
- 外部事件包含 `eventId`、`eventType`、`eventVersion`。
- Message 包含 `type`、`contentVersion`、`payload`。
- Job 包含 `jobVersion` 和稳定 `jobId`。
- 已发布字段不得改变类型、含义、单位、时区或空值语义。
- Consumer/SDK 必须能拒绝未知不兼容版本，并用稳定错误码或升级事件提示。

### 7.3 Schema 与 DTO

- 运行时边界必须使用 Contracts Schema 校验；TypeScript 静态类型不能替代运行时验证。
- Entity 不直接返回客户端；Mapper 输出 Contract DTO。
- 时间戳格式、ID 类型、Cursor 和 Error Envelope 全局一致。
- `payload` 必须按类型/版本限制大小和字段，不接受任意未校验 JSON。

## 8. HTTP 与 WebSocket 规范

- REST 前缀固定 `/api/v1`；资源名使用复数和 kebab-case。
- 所有列表使用 Cursor，禁止 Offset Page；消息历史使用 `beforeSeq/afterSeq`。
- 写接口接收 `Idempotency-Key` 和 `X-Request-Id`，并返回稳定 Error Code。
- 所有状态变化的 WebSocket Command 必须 ACK；ACK 与 Request ID 关联。
- WebSocket 鉴权同时校验 JWT、Session、Device、用户状态和 Origin。
- Gateway 统一限制 Envelope 和 Payload 大小，未知事件返回稳定协议错误而不是断言失败。
- REST 和 WebSocket 对同一业务命令的权限、幂等、状态转换和错误码必须一致。

## 9. 数据库与 Migration

- 生产环境必须 `synchronize: false`。
- 每个 Schema 变更都必须有 Migration；Migration 名称体现时间和意图。
- Migration 在支持的部署窗口内应可安全回滚；不可逆时写明恢复步骤、备份要求和前向修复方案。
- 大表变更优先使用兼容的 Expand/Migrate/Contract 流程，避免长时间阻塞。
- 唯一性和单调性由数据库约束/原子更新兜底，不依赖先查后写。
- 外键、唯一索引、查询索引和删除策略必须在同一变更中说明。
- 所有时间使用 UTC `timestamptz`；外部 ID 使用 UUIDv7 或明确的稳定格式。
- 软删除必须定义唯一索引、查询过滤和数据保留语义。

## 10. RabbitMQ、Outbox 与 BullMQ

- 数据库事务内禁止 Publish RabbitMQ。
- Outbox Event 必须有稳定 Event ID、类型、版本、Routing Key 和可追踪 Header。
- Publisher 使用 Persistent Message、Confirm 和 `mandatory=true`。
- Consumer 使用 Manual ACK，在副作用事务提交后 ACK。
- 关键 Queue 使用 Quorum Queue，必须配置有限 Retry、DLQ 和告警。
- 禁止无限 `nack(requeue=true)`，禁止把 RabbitMQ 当长期离线存储。
- Consumer 必须幂等；Inbox 插入和数据库副作用在同一事务完成。
- BullMQ 只用于未来执行或耗时任务；禁止用于 `message.created` 领域事件、消息 Fan-out 和客户端离线队列。
- Job 必须可重复执行，设置超时、有限重试、指数退避、抖动、失败告警和历史清理。

## 11. Redis 与缓存

- Realtime 与 Jobs 使用不同 Connection、ACL、Prefix 和指标；生产建议独立实例。
- Key 只能由统一 Factory 生成，禁止在业务代码拼接 `im:*` 字符串。
- 每个 Key 类型必须定义 TTL、Value Schema、容量上限和失效策略。
- Cache Miss 或 Redis 故障不得改变权限与消息事实；应回源 PostgreSQL 或显式降级。
- Presence、Typing 和 Connection 是临时状态，必须依赖 TTL 自动清理。
- 禁止在 Redis 中保存唯一消息、唯一 Sync Cursor 或不可重建业务事实。

## 12. 命名与代码风格

- TypeScript 文件使用 kebab-case；Class/Type/Enum 使用 PascalCase；函数和变量使用 camelCase；常量使用 UPPER_SNAKE_CASE。
- Module、Service、Repository、Handler、Consumer、Processor 名称包含明确业务意图，避免 `Manager`、`Helper`、`UtilService` 等模糊名称。
- Event Type 使用小写点分名和版本，例如 `message.created.v1`。
- RabbitMQ 资源使用 `im.<capability>.<kind>`；Redis Key 使用 `im:<capability>:...` 并由 Factory 产生。
- 数据库表和列使用 snake_case；外部 JSON 使用 camelCase。
- Error Code 使用稳定 UPPER_SNAKE_CASE，禁止客户端依赖自然语言 Message。
- 注释解释决策、约束和非显然原因，不复述代码。

## 13. 日志、指标与隐私

- 使用结构化日志；优先记录 ID、状态、耗时、计数和错误码。
- 允许的关联字段见 [technical-design.md §12](./technical-design.md#12-可观测性和告警)。
- 禁止记录密码、Access/Refresh Token、API Secret、验证码、完整私聊正文、原始 Webhook Secret 和完整预签名 URL。
- 用户、设备、会话、消息等 ID 按可观测性需求记录，但日志访问受权限和保留策略控制。
- Error Stack 只进入服务端受控日志，不直接返回客户端。
- 核心写链路必须记录成功/失败指标；重试、重复、DLQ、Outbox Lag 和 Job Failure 必须可见。
- 管理员查看消息正文和治理操作必须写审计日志，不得仅写普通应用日志。

## 14. 安全规范

- 所有外部输入在边界做 Schema、大小和枚举验证，在业务层做权限和资源归属验证。
- 密码使用 Argon2id；Token/API Secret 只存哈希；密钥通过安全配置注入并支持轮换。
- 所有生产链路使用 TLS/WSS；内部基础设施使用最小权限账号。
- Webhook 必须验证签名、时间窗、Nonce/Event ID，并执行 DNS/重定向感知的 SSRF 防护。
- 对象存储 Bucket 私有，上传/下载 URL 短期有效，Object Key 不接受客户端输入。
- 文件类型不能只信任扩展名或 MIME；校验 Magic Bytes、大小、Checksum 并进行病毒扫描。
- Rich Card 和自定义 Payload 不允许任意脚本或可执行 HTML。
- 管理后台使用 MFA；高风险动作需要显式权限和审计。

## 15. 测试规范

### 15.1 单元测试

覆盖 Token Rotation、权限矩阵、Payload Schema、Conversation Seq 服务、Delivered/Read 游标、Webhook 签名、Bot Scope、媒体状态机和纯 Mapper。

### 15.2 集成测试

使用 Testcontainers 或等价真实依赖启动 PostgreSQL、Redis、RabbitMQ 和 MinIO，覆盖事务、唯一约束、Outbox Claim/Confirm、Consumer Inbox、ACK/NACK、BullMQ Retry、Presigned Upload 和多消费者幂等。

### 15.3 契约测试

为 REST、WebSocket、Event、Message Payload、Error 和 SDK 序列化建立兼容测试。协议变更必须证明旧消费者可继续工作，或通过新版本隔离。

### 15.4 E2E 测试

至少覆盖注册/刷新、多设备、单聊、在线接收、离线恢复、重复 Client Message ID、Delivered/Read、多设备已读、群权限/移除、撤回、文件上传、Bot Webhook/重放、Session Revoked 和过期 Cursor Snapshot。

### 15.5 故障与压测

故障测试覆盖 Commit/Publish/ACK 边界、节点退出、Redis/RabbitMQ 暂停、重复 Job、Complete 丢响应和多设备并发游标。压测门槛以 [../plan.md §3 P10](../plan.md#p10--第-14-周压测与上线) 为准。

测试用例名称应描述行为和条件，不绑定私有实现。禁止通过删除断言、增加无界重试或跳过关键测试来绕过失败。

## 16. 健康检查、关闭和部署

- 每个进程独立提供 Liveness 和 Readiness；Readiness 只检查当前进程关键依赖。
- 收到终止信号后停止接收新流量，等待在途事务/ACK 到有界超时，再关闭连接池。
- Event Worker 退出前停止 Claim/Consume 并完成或放弃可安全重领的工作。
- Job Worker 退出前停止领取新 Job；未完成 Job 必须可由稳定 ID 重新执行。
- 部署配置不能依赖本地状态；Secret 不进入镜像、仓库或日志。
- Schema 和应用部署顺序遵循向前/向后兼容，灰度期间新旧版本必须共存。

## 17. 代码评审检查清单

### 需求与接口

- [ ] 变更关联 `FR/NFR/INV/AC`，范围标签明确。
- [ ] REST、WS、Event、Message 或 Job 变更已更新 Contracts 和兼容测试。
- [ ] 稳定错误码、幂等键、Cursor 和 ACK 语义一致。

### 架构与数据

- [ ] 代码位于正确 Feature 和进程，未跨模块访问 Repository。
- [ ] Controller/Gateway/Consumer/Processor 保持薄层。
- [ ] 事务只使用 Transaction Manager，事务内无 MQ/Redis/Storage 网络副作用。
- [ ] 唯一约束、索引、Migration、回滚/恢复和数据保留已评估。
- [ ] Consumer/Processor 可重复执行，Retry/DLQ/失败状态有边界。

### 安全与运维

- [ ] 身份、权限、资源归属、输入大小和 SSRF/文件风险已验证。
- [ ] 日志、错误和 Trace 不包含敏感信息。
- [ ] 关键路径日志、指标、告警和健康检查已按风险补齐。
- [ ] 进程关闭和故障降级不会丢失已提交事实。

### 验证与文档

- [ ] 对应单元、集成、契约、E2E 或故障测试已通过。
- [ ] 性能影响已验证或说明。
- [ ] `spec.md`、ADR、`plan.md` 和 `AGENTS.md` 中的权威内容保持一致。

## 18. 明确禁止项

1. 生产启用 TypeORM `synchronize`。
2. 在数据库事务内发布 RabbitMQ 或调用外部网络服务。
3. 以 Redis、RabbitMQ、BullMQ 或 WebSocket 保存唯一消息事实。
4. 以 `created_at` 作为消息唯一顺序。
5. 为群消息做每成员 Fan-out Write 或逐消息永久回执。
6. Consumer 无限 Requeue，或没有幂等保护就 ACK/重试。
7. BullMQ 承载消息领域事件或客户端离线队列。
8. 业务代码手写 Redis Key。
9. Controller、Gateway、Consumer、Processor 实现核心业务逻辑。
10. 跨模块直接使用 Entity Repository。
11. Entity 直接返回客户端。
12. Offset 分页用于外部列表接口。
13. 无版本外部协议或修改已发布字段语义。
14. 无稳定错误码的写命令。
15. 日志记录密码、Token、Secret、完整私聊正文或完整预签名 URL。
16. 无 Migration 的 Schema 变更。
17. 用无业务意义的 BaseService/BaseRepository 掩盖依赖关系。
18. 为绕过循环依赖而滥用 `forwardRef`。

