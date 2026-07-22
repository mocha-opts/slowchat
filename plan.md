# 中型 IM 平台 14 周实施计划

> 状态：执行中（P1、P2、P3 已完成）  
> 版本：v2.0  
> 需求规格：[spec.md](./spec.md)  
> 架构决策：[adr/](./adr/)  
> 工程约束：[AGENTS.md](./AGENTS.md)

## 1. 计划原则

- 实施顺序固定为：工程基线 → 认证与设备 → 会话与消息事务 → 幂等和 Seq → Outbox/MQ → 实时投递 → 离线与多端同步 → 群聊 → 多模态 → 高级消息 → SDK/Bot → 治理与可观测性 → 压测上线。
- 每个阶段必须满足本阶段退出门槛后才能进入依赖它的阶段；日历周数不能代替质量门槛。
- MVP 首发范围以 [spec.md §7.1](./spec.md#71-mvp-发布范围) 为准。
- 基础结构化日志、核心指标、自动备份和关键告警属于 MVP 上线阻断项；高级仪表盘、完整 Trace 覆盖和全面演练可后置。
- 所有功能必须关联至少一个需求编号；可靠性工作同时关联相应 `INV-*` 和 `AC-*`。

## 2. 阶段总览

| 阶段 | 周期 | 依赖 | 主要交付 | 发布属性 |
| --- | --- | --- | --- | --- |
| P1 工程基线 | 第 1 周 | 无 | Monorepo、四进程、基础设施适配、CI | MVP |
| P2 认证与用户 | 第 2～3 周 | P1 | Auth、Session、Device、Profile、Privacy | MVP |
| P3 消息核心 | 第 4～5 周 | P1、P2 | 会话、消息事务、Seq、幂等、Outbox、回执 | MVP |
| P4 同步与 SDK Core | 第 6～7 周 | P3 | Sync Projection、Snapshot、重连、多端同步 | MVP |
| P5 群聊 | 第 8～9 周 | P3、P4 | 群成员、角色、禁言、系统消息 | MVP |
| P6 多模态 | 第 10 周 | P1、P3 | 直传、附件、基础媒体任务 | MVP/部分延期 |
| P7 高级消息 | 第 11 周 | P3～P6 | 回复、转发、撤回、Reaction、编辑 | MVP/部分延期 |
| P8 开放平台 | 第 12 周 | P3、P4、P6 | Contracts、Web SDK、Bot、Webhook | MVP/部分延期 |
| P9 治理与运维 | 第 13 周 | P2～P8 | 管理、审计、关键指标和告警 | MVP |
| P10 上线验证 | 第 14 周 | 全部 MVP 阶段 | 压测、安全、备份恢复、灰度回滚 | MVP Gate |

## 3. 详细计划

### P1 — 第 1 周：工程基线（已完成，2026-07-21）

状态：✅ 已通过阶段退出门槛，后续工作可进入 P2。

需求：`NFR-OPS-001`、`NFR-OPS-002`、`NFR-SEC-003`、`INV-REL-002`

任务：

- 初始化 pnpm Workspace、Turborepo、共享 TypeScript/ESLint 配置和根 scripts。
- 创建 API、Realtime、Event Worker、Job Worker 四个 Entry Point 与 Composition Module。
- 接入 PostgreSQL/TypeORM Migration、Redis Realtime、Redis Jobs、RabbitMQ、BullMQ 和 S3 兼容 Storage Adapter。
- 建立统一配置校验、结构化日志、Request ID/Trace ID、错误响应、Liveness/Readiness 和优雅关闭。
- 创建本地 Docker Compose 和 CI，CI 至少执行 lint、typecheck、test、build。

交付物：可启动的四进程骨架、真实基础设施 Adapter、Migration 工具链与集中目录、开发环境编排、CI。按 P1 边界不创建无业务价值的正式 DDL，首份业务 Migration 留给 P2。

测试：配置单测、每种基础设施连接集成测试、四进程启动冒烟测试。

退出门槛：

- 一条已记录命令可启动完整开发环境，四个进程可独立启动和停止。
- Migration 可执行；RabbitMQ 测试事件可确认发布/消费；BullMQ 测试 Job 可执行；MinIO 可生成短期上传 URL。
- CI 全部通过，日志包含请求/追踪 ID，四进程健康检查有效。

完成记录：

- Workspace 固定 Node `24.13.0`、pnpm `11.13.0`、原生 ESM、TypeScript `6.0.3`，锁文件和精确依赖版本已提交到工作树。
- API、Realtime、Event Worker、Job Worker 可独立构建和运行；各自 Liveness/Readiness 按依赖矩阵检查。
- PostgreSQL、双 Redis、RabbitMQ、BullMQ、MinIO/S3 和跨实例 Socket.IO 已通过真实容器集成测试。
- Smoke 使用动态空闲端口，验证四进程启动、健康、SIGTERM 退出，以及 Redis Jobs 停止/恢复时仅 Job Worker Readiness `200 → 503 → 200`。
- 阶段验证命令：`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke`、`docker compose -f deploy/docker/compose.yml config`、`pnpm db:migration:show`、`pnpm db:migration:run`。

### P2 — 第 2～3 周：认证、用户和设备（已完成，2026-07-21）

状态：✅ 已通过阶段退出门槛，后续工作可进入 P3。

依赖：P1  
需求：`FR-AUTH-001`～`FR-AUTH-008`、`FR-USER-001`～`FR-USER-002`、`FR-PRIV-001`、`FR-CONTACT-001`～`FR-CONTACT-003`、`NFR-AUTH-001`～`NFR-AUTH-002`、`NFR-SEC-001`、`AC-AUTH-001`

任务：

- 建立 `users`、`user_credentials`、`auth_sessions`、`devices`、`user_privacy_settings`、`friendships`、`friend_requests`、`blocks` Migration 和 Repository。
- 实现注册、登录、JWT、Refresh Token Rotation、Token Family 重放检测、登出和密码修改/找回。
- 实现设备/Session 列表、指定设备移除、全设备登出和 `session.revoked`。
- 为 HTTP 与 WebSocket 建立共享 Session 校验和封禁策略。
- 实现用户资料、隐私设置、登录限流和可疑登录日志。
- 实现好友申请、接受/拒绝、联系人备注、删除、黑名单和多设备联系人变化同步。

交付物：Auth/Users/Devices 模块、Contracts、Migration、HTTP/WS Guard、撤销事件。

测试：Token Rotation 单测；Repository/事务集成测试；多设备、重放、封禁和撤销 E2E。

退出门槛：多设备登录正常；移除设备立即禁止刷新并断开连接；Token 重放撤销 Family；封禁同时阻断 HTTP 和 WS；联系人及黑名单规则生效并同步到其他设备。

完成记录：

- 已交付邮箱/手机验证码注册、Argon2id 密码、RS256 Access Token、严格 Refresh Rotation/重放撤销、密码修改/找回、Session 与 Device 管理。
- 已交付用户资料、隐私、搜索、匿名化注销、好友申请与双向关系、备注、删除、拉黑原子清理、举报和 Cursor 列表。
- HTTP 与 WebSocket 共用 PostgreSQL 权威的 User/Session/Device 校验；Redis Emitter 只承担 `session.revoked`、联系人及拉黑的最佳努力在线通知，未越界引入 P3 Outbox。
- 首份业务 Migration 覆盖 P2 全部表、部分唯一索引、状态约束和回滚；`synchronize` 保持关闭。
- 已增加 Contract 与 E2E 测试入口；注册、登录、好友接受、Refresh 严格重放及账号枚举防护通过真实 PostgreSQL、Redis、MinIO 容器验证。
- 阶段验证命令：`pnpm install --frozen-lockfile`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:contract`、`pnpm test:e2e`、`pnpm build`、`pnpm db:migration:run`、`pnpm db:migration:revert`、`pnpm smoke`、`docker compose -f deploy/docker/compose.yml config`。

### P3 — 第 4～5 周：单聊与消息核心（已完成，2026-07-22）

依赖：P1、P2  
需求：`FR-CONV-001`～`FR-CONV-004`、`FR-MSG-001`～`FR-MSG-006`、`FR-RECEIPT-001`、`INV-CONV-001`、`INV-MSG-001`～`INV-MSG-004`、`INV-REL-001`～`INV-REL-003`、`AC-MSG-001`、`AC-MSG-002`、`AC-EVT-001`

任务：

- 建立 conversations、members、user states、messages、Outbox 和 Consumer Inbox 表及唯一索引。
- 实现单聊唯一性、成员/黑名单/禁言校验、Conversation Seq 原子分配和 Client Message ID 幂等。
- 实现 HTTP/WS 共用 Message Command Service、消息历史 Seq Cursor 和统一 ACK/错误码。
- 在同一事务中提交消息、会话最后消息和 Outbox；API/Realtime 不直接发布 RabbitMQ。
- 实现 Outbox Relay、Publisher Confirm、Retry/DLQ、Consumer Inbox 和 Realtime Dispatch。
- 实现 Delivered/Read 只前进游标。

交付物：消息主链路、Outbox Relay、RabbitMQ 拓扑、实时 Consumer、基础回执。

测试：事务和唯一约束集成测试；重复发送、并发 Seq、发布/ACK 崩溃边界故障测试；两用户收发 E2E。

退出门槛：重复请求不重复写入；Seq 严格递增；MQ 停止时消息仍提交并保持 Outbox Pending；恢复后追平；重复消费无重复副作用。

完成记录：

- 已交付活动单聊唯一约束、联系人/陌生人隐私准入、双向 Block 校验、成员与禁言校验，以及会话视图、设置和隐藏后新消息恢复。
- 已交付 HTTP/WS 共用的文本消息事务链路、`conversation_id + seq` 原子顺序、Client Message ID 内容指纹幂等、Seq 历史查询和 Delivered/Read 单调游标。
- 已交付 Transactional Outbox Relay、Persistent Mandatory Confirm Publish、RabbitMQ Quorum Queue、三级有限 Retry、DLQ、Consumer Inbox 租约和 Redis Realtime Dispatch。
- 已验证并发 Seq、数据库唯一约束、Migration 正反执行、跨进程实时收发、回执、重复发送、Block、隐藏恢复，以及 RabbitMQ 停止时提交、恢复后自动追平。
- 阶段边界：P3 只开放 `DIRECT + TEXT`；Group/System、Image/File、持久多端 Sync 和高级消息分别由 P5/P9、P6、P4、P7 交付。
- 阶段验证命令：`pnpm install --frozen-lockfile`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:contract`、`pnpm test:e2e`、`pnpm build`、`pnpm db:migration:run`、`pnpm db:migration:revert`、`pnpm smoke`、`docker compose -f deploy/docker/compose.yml config`。

### P4 — 第 6～7 周：离线、多端同步与 SDK Core

依赖：P3  
需求：`FR-SYNC-001`～`FR-SYNC-004`、`FR-RECEIPT-002`、`FR-CONV-003`、`FR-SDK-001`～`FR-SDK-002`、`NFR-DATA-001`、`AC-SYNC-001`～`AC-SYNC-002`

任务：

- 建立 `user_sync_events` 和 `device_sync_states`；Event Worker 从 Outbox 事件幂等投影用户同步事件。
- 实现增量 Sync API、Message Range、Snapshot 和 `SYNC_CURSOR_EXPIRED`。
- 实现发送者其他设备同步、已读状态同步、置顶/免打扰/归档同步。
- 建立 `@im/contracts`、`@im/sdk-core`、`@im/sdk-web` 的最小可用版本。
- SDK 实现 Token 自动刷新、重连、ACK、去重、顺序应用事件、游标原子持久化和 IndexedDB/BroadcastChannel 适配。

交付物：同步投影、Sync/Snapshot API、SDK Core、Web SDK。

测试：投影重复消费集成测试；丢事件、断线、多设备并发已读、游标过期 E2E；SDK 本地状态恢复测试。

退出门槛：完全丢弃实时通知后仍可恢复；任一设备已读后其他设备一致；90 天游标过期可用快照重建。

完成记录：

- 已交付 `user_sync_events`、`device_sync_states` 及可回滚 P4 Migration；用户游标使用 PostgreSQL `bigint` 单调 ID，设备游标按 `(user_id, device_id)` 独立保存。
- 已交付 Event Worker Sync Projection Consumer：从 P3 Outbox 事件幂等生成用户事件，使用独立 RabbitMQ Queue、Consumer Inbox 和 90 天过期时间。
- 已交付 `/sync` 增量事件、快照、消息范围 API；同步查询严格校验 Device 归属，游标过期返回 `SYNC_CURSOR_EXPIRED` 和 `fullSyncRequired`。
- 已交付 `@im/sdk-core` 的 Token 刷新锁、事件去重、游标持久化、REST/Socket 抽象和文本发送；`@im/sdk-web` 提供 IndexedDB 与 BroadcastChannel 适配。
- 已补充中文边界注释和 SDK TSDoc；未引入群聊、媒体、Bot 或高级消息能力。
- 阶段验证命令：`pnpm install --frozen-lockfile`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:contract`、`pnpm test:e2e`、`pnpm build`、`pnpm db:migration:run`、`pnpm db:migration:revert`、`pnpm db:migration:run`、`pnpm smoke`、`docker compose -f deploy/docker/compose.yml config`。

### P5 — 第 8～9 周：群聊

依赖：P3、P4  
需求：`FR-GROUP-001`～`FR-GROUP-005`、`INV-GROUP-001`～`INV-GROUP-002`、`AC-GROUP-001`

任务：

- 建立群资料、加入申请、邀请和群成员状态模型。
- 实现邀请/申请/审批、退群、移除、解散、转让、管理员与禁言。
- 实现群资料/成员同步、群系统消息、@成员和 @所有人。
- 实现成员 Cursor 分页和群已读人数聚合，不建立逐消息逐成员回执。

交付物：Groups 模块、权限矩阵、系统消息 Contracts、群同步投影。

测试：角色/状态机单测；权限与并发成员变更集成测试；完整群生命周期 E2E；500 人群基准测试。

退出门槛：非成员不可访问；移除立即生效；群主/管理员权限完整；500 人群投递和恢复正常。

状态：✅ 已实现并通过阶段验证门槛。

- 已交付 `Groups` 模块、`group_profiles`、`group_join_requests`、`group_invites` 可回滚 Migration。
- 已交付 OWNER/ADMIN/MEMBER 权限、邀请/申请审批、退群、移除、转让群主、解散、全员/成员禁言和成员 Cursor 分页。
- 群生命周期变化使用与普通消息共享的 `conversationId + seq` SYSTEM 消息；P5 仅开放 `DIRECT/GROUP + TEXT/SYSTEM`，群广播不写逐成员消息 Fan-out 或永久 Receipt。
- 已补充群聊 Contracts、权限/状态集成测试和群生命周期 E2E；P7 高级消息与 P9 治理仍未提前实现。
- 阶段验证命令：`pnpm install --frozen-lockfile`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:contract`、`pnpm test:e2e`、`pnpm build`、`pnpm db:migration:run`、`pnpm db:migration:revert`、`pnpm db:migration:run`、`pnpm smoke`、`docker compose -f deploy/docker/compose.yml config`。

### P6 — 第 10 周：多模态和媒体

依赖：P1、P3、P5
需求：`FR-MEDIA-001`～`FR-MEDIA-005`、`NFR-SEC-004`、`AC-MEDIA-001`

任务：

- 建立上传会话、附件和衍生文件模型及状态机。
- 实现 Presigned Upload、Complete HEAD 校验、访问控制和短期下载 URL。
- 实现 `IMAGE`/`FILE` MVP；音频元数据、视频封面/转码等高级 Processor 延后。
- 实现病毒扫描、幂等媒体 Job、临时上传清理和 `media.ready` 事件。

交付物：Media 模块、Storage Adapter、Media Job Worker、媒体 Contracts。

测试：状态机单测；MinIO/BullMQ 集成测试；重复 Complete、重复 Job、越权下载和无效文件 E2E。

退出门槛：文件字节不经过 API；未 Ready 附件不可发送；重复处理不重复产物；越权用户无法取得下载 URL。

状态：✅ 已实现并通过阶段验证门槛。

- 已交付 `upload_sessions`、`attachments`、`media_variants` 可回滚 Migration，以及私有 S3/MinIO 直传、Complete HEAD/Magic Bytes/Checksum 校验和短期下载授权。
- 已交付 IMAGE/FILE Contracts、消息引用校验、确定性开发扫描器、生产扫描器强制配置、BullMQ 稳定 Job ID、重复处理幂等和媒体状态 Outbox 事件。
- `UPLOADING -> PROCESSING -> READY` 为主链路；扫描感染进入 `QUARANTINED`，扫描不可用或永久校验错误进入 `FAILED`，取消/过期进入 `DELETED`。
- 阶段验证命令：`pnpm install --frozen-lockfile`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:contract`、`pnpm test:e2e`、`pnpm build`、`pnpm db:migration:run`、`pnpm db:migration:revert`、`pnpm db:migration:run`、`pnpm smoke`、`docker compose -f deploy/docker/compose.yml config`。

### P7 — 第 11 周：高级消息

依赖：P3～P6  
需求：`FR-MSG-003`～`FR-MSG-004`、`FR-SEARCH-001`、`INV-MSG-004`

任务：实现回复、引用、转发、撤回、Reaction、用户级删除、清空历史、举报和基于 PostgreSQL 的基础消息搜索；消息编辑属于 POST-MVP，可在不影响首发门槛时实现。

交付物：高级消息命令、同步事件、权限与时间窗口规则。

测试：权限/状态机单测；Reaction 幂等集成测试；撤回、删除和多设备同步 E2E。

退出门槛：撤回同步到所有设备；Reaction 幂等；用户级删除不影响其他成员；若交付编辑，旧 Payload 版本保持兼容。

状态：✅ 已实现并通过阶段验证门槛。

- 已交付回复/引用字段、文本转发、发送者和群管理员撤回、用户级消息隐藏、清空个人历史、Reaction 幂等和 PostgreSQL 游标搜索。
- `message_recalled.v1`、`message.reaction.updated.v1`、`message.hidden.v1` 与既有 Outbox、Realtime Dispatch、Sync Projection 链路复用稳定 `eventId`；用户级隐藏只改变当前用户视图，不改写消息事实。
- 撤回默认窗口由 `MESSAGE_RECALL_WINDOW_SECONDS` 控制（默认 120 秒）；编辑、收藏、定时消息和高级搜索引擎仍为 POST-MVP。
- 阶段验证命令：`pnpm install --frozen-lockfile`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:contract`、`pnpm test:e2e`、`pnpm build`、`pnpm db:migration:run`、`pnpm db:migration:revert`、`pnpm db:migration:run`、`pnpm smoke`、`docker compose -f deploy/docker/compose.yml config`。

### P8 — 第 12 周：开放平台、Web SDK 和 Bot

依赖：P3、P4、P6  
需求：`FR-BOT-001`～`FR-BOT-004`、`FR-SDK-001`～`FR-SDK-003`、`AC-BOT-001`

任务：

- 发布 API/WS/Event/Message/Error Contracts 和 OpenAPI。
- 完成 Web SDK 的可靠收发、上传和同步流程；Node/React 等扩展包按 POST-MVP 处理。
- 实现 API App、Credential、Scope、Bot Account、Subscription 和 Webhook Endpoint。
- 实现 HMAC 签名、防重放、SSRF 防护、BullMQ 重试、投递日志、重放、Rich Card、Command Bot 和防循环。

交付物：版本化 Contracts、Web SDK、Bot/Open Platform 模块、Webhook Job Worker。

测试：契约兼容测试；签名/Scope/SSRF 单测和集成测试；Webhook 失败、重复、重放和 Bot 循环 E2E。

退出门槛：第三方可通过 SDK 收发；Bot 只能访问授权会话；签名可验证；重复事件不重复执行；失败投递可审计和重放。

### P9 — 第 13 周：管理、治理与 MVP 运维基线

依赖：P2～P8  
需求：`FR-ADMIN-001`～`FR-ADMIN-002`、`FR-NOTIFY-001`、`NFR-OPS-001`～`NFR-OPS-005`、`NFR-SEC-005`～`NFR-SEC-006`、`AC-OPS-001`

任务：

- 实现管理 API、用户封禁、群治理、举报处理、Bot 禁用、系统通知和不可抵赖审计。
- 为管理后台启用 MFA，并为高风险治理操作建立显式权限和审计策略。
- 补齐结构化日志和核心指标：HTTP/WS、消息、Sync、Outbox、RabbitMQ、BullMQ、PostgreSQL、Redis、媒体与 Bot。
- 配置关键告警：Outbox 老化、Queue 增长、DLQ、连接池、Redis 内存、延迟和失败率。
- 配置 PostgreSQL 自动备份、恢复步骤和最小 Runbook。
- OpenTelemetry、Sentry、完整 Grafana 和高级 Dashboard 可作为 POST-MVP 增强，但不得阻塞基础关联和告警。

交付物：Admin/Moderation/Audit、指标与告警、自动备份、最小 Runbook。

测试：管理员权限与审计 E2E；敏感日志扫描；告警触发测试；备份恢复验证。

退出门槛：管理员操作全部审计；关键链路可由 ID 关联；核心积压和故障可见；关键告警可触发；备份能够恢复。

### P10 — 第 14 周：压测与上线

依赖：所有 MVP 阶段  
需求：全部 `NFR-CAP-*`、`NFR-PERF-*`、`NFR-AVL-001`、`AC-PERF-001`、`AC-OPS-001`

任务：

- 执行 WebSocket、消息吞吐、群广播、同步、重连和文件 Complete 压测。
- 调优 SQL/索引、连接池、RabbitMQ Prefetch 和 Redis 内存。
- 执行安全扫描、权限复核、依赖检查和敏感信息扫描。
- 执行 API/Realtime/Worker 退出、Redis/RabbitMQ 暂停、重复 Job 等故障注入。
- 完成备份恢复、灰度发布和回滚演练；形成上线/回滚 Runbook。

退出门槛：

- 5,000 WebSocket 连接，每 25～30 秒心跳稳定。
- 500 msg/s 持续 30 分钟、1,000 msg/s 突发 60 秒达到性能目标。
- 500 人群广播、1,000 客户端同时重连、离线同步和 100 并发 Complete 通过。
- 单个 Realtime/Worker 退出不丢消息事实；RabbitMQ 暂停 10 分钟后可追平。
- PostgreSQL 备份恢复成功；关键告警、灰度和回滚步骤可执行。

## 4. 测试与发布门槛

| 层级 | 必测内容 | 阻断条件 |
| --- | --- | --- |
| 单元 | Token、权限、消息 Schema、游标、签名、Scope、媒体状态机 | 核心规则失败 |
| 集成 | PostgreSQL 事务、Outbox、Confirm、Inbox、BullMQ、MinIO | 幂等或事务边界失败 |
| 契约 | REST、WS、事件、消息 Payload、SDK | 已发布协议不兼容 |
| E2E | 登录、多设备、单聊、群聊、同步、媒体、Bot、封禁 | MVP 用户旅程失败 |
| 故障 | Commit/Publish/ACK 崩溃点、Redis/MQ 暂停、重复 Job | 消息丢失或重复副作用 |
| 压测 | 连接、吞吐、群广播、重连、同步、上传完成 | 未达到 `NFR-CAP/PERF` |
| 安全 | 鉴权、资源归属、SSRF、敏感日志、依赖扫描 | 高危问题未处置 |
| 运维 | 健康检查、告警、备份恢复、灰度回滚 | `AC-OPS-001` 未通过 |

## 5. MVP 上线清单

### 数据与可靠性

- [ ] 生产关闭 TypeORM `synchronize`，所有 Schema 变更均有 Migration。
- [ ] Conversation Seq、Client Message ID 和 Consumer Inbox 唯一约束生效。
- [ ] Outbox Confirm、Manual ACK、Retry、DLQ 和 DLQ 告警已验证。
- [ ] RabbitMQ 关键队列使用 Quorum Queue；Redis/BullMQ 不保存唯一消息事实。
- [ ] BullMQ 使用稳定 Job ID，Processor 可重复执行。

### 接口、安全与媒体

- [ ] WSS、Origin 和消息大小限制已启用；所有写命令有 ACK。
- [ ] Session Revoked、自动重连和 Sync 恢复已验证。
- [ ] 密码使用 Argon2id，Token/API Secret 只存哈希。
- [ ] Bucket 私有、Object Key 服务端生成、URL 短期有效、Complete 验证对象。
- [ ] Bot Webhook 签名和 SSRF 防护有效；日志无敏感凭证和完整预签名 URL。
- [ ] 管理后台 MFA 已启用，管理员查看消息正文和高风险治理操作均有审计记录。

### 运维与发布

- [ ] 四进程独立健康检查和优雅关闭通过。
- [ ] 结构化日志、核心指标、关键告警已部署并验证。
- [ ] PostgreSQL 自动备份开启并完成恢复验证。
- [ ] 上线、灰度、回滚和最小故障 Runbook 完成。
- [ ] P10 的性能与可靠性门槛全部通过。

## 6. POST-MVP Backlog

按优先级评估消息编辑、高级媒体处理、群详细已读成员、React Native/Swift/Kotlin SDK、OAuth 用户授权、高级内容审核、完整 Trace/仪表盘和更广泛故障演练。任何延期项进入开发前，先在 `spec.md` 中确认其范围标签和兼容策略，再补充本计划的独立里程碑。
