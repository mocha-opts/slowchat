# 中型 IM 平台系统规格

> 状态：基线（Baseline）  
> 版本：v2.0  
> 日期：2026-07-20  
> 原始需求：[prd.md](./prd.md)  
> 架构决策：[adr/architecture.md](./adr/architecture.md)  
> 技术设计：[adr/technical-design.md](./adr/technical-design.md)  
> 实施计划：[plan.md](./plan.md)

## 1. 文档约定

本文是产品能力、外部接口、业务不变量和验收条件的权威规格。架构实现与工程约束分别以 `adr/` 下的设计文档和 [AGENTS.md](./AGENTS.md) 为准。

范围标签：

- **MVP**：首次生产发布必须交付。
- **POST-MVP**：v2.0 完整范围内允许延期交付。
- **预留**：只保证兼容方向，不承诺首版实现。
- **非目标**：第一阶段明确不实现。

编号规则：

- `FR-*`：功能需求。
- `NFR-*`：非功能需求。
- `INV-*`：任何实现都不得破坏的业务或数据不变量。
- `AC-*`：可验证的系统级验收条件。

## 2. 产品目标与范围

建设一套面向 Web、桌面端、移动端和第三方应用的中型 IM 平台，支持账号与多设备、联系人、单聊和群聊、多模态消息、可靠投递、离线恢复、多端同步、SDK、Bot、开放平台、基础治理及上线所需的运维能力。

核心目标：

1. 网络断开、客户端重试和进程重启不能造成已接受消息丢失或重复。
2. 同一会话中的消息具有确定且可恢复的顺序。
3. WebSocket 丢失不是数据丢失，客户端可通过数据库同步链路恢复。
4. 多设备最终看到一致的会话、消息、已读和用户级设置。
5. API、WebSocket、事件、消息 Payload 和 SDK 可稳定版本化。

### 2.1 目标容量

| 编号 | 指标 | 目标 |
| --- | --- | ---: |
| NFR-CAP-001 | 注册用户 | 20,000 |
| NFR-CAP-002 | 日活用户 | 3,000～8,000 |
| NFR-CAP-003 | 峰值在线连接 | 3,000～5,000 |
| NFR-CAP-004 | 普通消息持续峰值 | 500 msg/s |
| NFR-CAP-005 | 短时突发 | 1,000 msg/s |
| NFR-CAP-006 | 单群成员 | 默认 500，最高可配置 2,000 |
| NFR-CAP-007 | 单用户设备 | 默认 5，最高 10 |

### 2.2 性能与可用性

| 编号 | 指标 | 目标 |
| --- | --- | ---: |
| NFR-PERF-001 | 消息接受 ACK P95 | < 200 ms |
| NFR-PERF-002 | 在线消息投递 P95 | < 500 ms |
| NFR-PERF-003 | REST API P95 | < 300 ms |
| NFR-AVL-001 | 服务可用性 | 99.9% |
| NFR-DATA-001 | Sync Event 默认保留 | 90 天 |
| NFR-AUTH-001 | Access Token 有效期 | 15 分钟 |
| NFR-AUTH-002 | Refresh Token 有效期 | 30 天 |

### 2.3 用户角色

| 角色 | 核心权限 |
| --- | --- |
| 普通用户 | 登录、联系人、单聊、群聊、多模态消息、设备管理 |
| 群主 | 群资料、成员、管理员、禁言、转让和解散 |
| 群管理员 | 成员审批、邀请、移除、禁言和公告 |
| Bot | 在授权会话中接收事件和发送消息 |
| 开放平台应用 | 使用 API Key 或 OAuth 访问授权 API |
| 平台管理员 | 用户治理、群治理、Bot 管理、审计和系统配置 |

### 2.4 非目标

第一阶段不实现百万长连接、万人级实时聊天室、跨地域多活、数据库分库分表、端到端加密、实时音视频通话、完整企业组织架构、推荐流/朋友圈/频道、独立 Elasticsearch 集群或十几个细粒度微服务。

## 3. 功能需求

### 3.1 认证、账号与设备

- `FR-AUTH-001` **MVP**：支持邮箱或手机号注册、密码登录、Access Token 和 Refresh Token；注册前必须完成 6 位验证码校验，验证码有效 10 分钟、最多尝试 5 次且 60 秒后才可重发。
- `FR-AUTH-002` **MVP**：Access Token 使用 RS256 JWT，固定包含 `sub/userId`、`sessionId`、`deviceId`、`jti`、`iss`、`aud` 和 `kid`，可用于 HTTP 和 WebSocket 鉴权。
- `FR-AUTH-003` **MVP**：Refresh Token 使用高熵随机值，服务端仅保存哈希，并与 Session、Device、Token Family 绑定。
- `FR-AUTH-004` **MVP**：刷新时轮换 Refresh Token；检测已使用 Token 重放时撤销整个 Token Family。
- `FR-AUTH-005` **MVP**：支持查看会话和设备、移除指定设备、单设备登出及全设备登出；被撤销设备不能继续刷新并收到 `session.revoked`。
- `FR-AUTH-006` **MVP**：支持修改和找回密码；修改密码可选择撤销其他设备 Session。
- `FR-AUTH-007` **MVP**：用户状态为 `ACTIVE`、`FROZEN`、`DISABLED` 或 `DELETED`；封禁后 HTTP 和 WebSocket 均失效。
- `FR-AUTH-008` **MVP**：登录失败限流并记录可疑登录；验证码登录和 MFA 为预留能力，管理后台 MFA 属上线安全要求。
- `INV-AUTH-001`：每个受保护 HTTP 请求及 WebSocket 握手均以 PostgreSQL 中 User、Session、Device 状态为最终依据；Redis 撤销标记和在线事件只用于加速或通知。
- `INV-AUTH-002`：Refresh Token 格式为 `tokenId.secret`，服务端仅保存带 Pepper 的 HMAC-SHA256；轮换必须在行锁事务内完成，已使用 Token 的任何重放都撤销整个 Family。
- `INV-AUTH-003`：用户注销必须验证密码并匿名化为不可冲突墓碑，清除凭证和资料、撤销 Session/Device、删除好友/申请/Block，同时保留 User UUID 和必要治理引用；原邮箱或手机号可重新注册。

### 3.2 用户、隐私与联系人

- `FR-USER-001` **MVP**：维护用户名、昵称、头像、签名、地区、状态、最后在线时间、用户类型和扩展字段。
- `FR-USER-002` **MVP**：用户类型支持 `USER`、`BOT`、`SYSTEM`。
- `FR-PRIV-001` **MVP**：支持搜索、加好友、群邀请、陌生人消息、在线状态、最后在线时间和 Bot 私聊权限设置。
- `FR-CONTACT-001` **MVP**：支持好友申请、接受、拒绝、删除、备注和联系人列表。
- `FR-CONTACT-002` **MVP**：支持黑名单和举报；黑名单阻止新建及已有单聊发送，但不影响共同群聊，并隐藏精确在线状态。
- `FR-CONTACT-003` **MVP**：联系人和黑名单变化同步到用户其他设备。

### 3.3 会话与用户视图

- `FR-CONV-001` **MVP**：支持 `DIRECT`、`GROUP`、`SYSTEM` 会话；Bot 可作为特殊用户参与单聊或群聊。
- `FR-CONV-002` **MVP**：会话列表提供最后消息、未读数、@未读数、置顶、免打扰、归档和隐藏。
- `FR-CONV-003` **MVP**：置顶、免打扰、归档为用户级同步状态；本地背景、草稿等 UI 状态可保持设备级。
- `FR-CONV-004` **MVP**：隐藏会话收到新消息后重新出现；用户可隐藏本地会话或清空自己的历史视图，不影响其他成员。
- `INV-CONV-001`：任意两个普通用户最多存在一个有效单聊，`direct_key = min(userAId,userBId) + ':' + max(userAId,userBId)`。

### 3.4 群聊

- `FR-GROUP-001` **MVP**：群角色支持 `OWNER`、`ADMIN`、`MEMBER`，权限按角色验证。
- `FR-GROUP-002` **MVP**：支持建群、更新资料和公告、邀请/申请/审批、退群、移除成员、管理员设置、转让群主和解散。
- `FR-GROUP-003` **MVP**：支持全员禁言、成员禁言、群昵称、@成员、@所有人和成员游标分页。
- `FR-GROUP-004` **MVP**：成员及群资料变化同步，并产生与普通消息共享会话序号的系统消息。
- `FR-GROUP-005` **MVP**：系统消息类型至少覆盖成员加入、离开、移除、群资料更新、群主转让、管理员和禁言变化。
- `INV-GROUP-001`：非成员不得读取或发送群消息；成员被移除后立即失去发送权限。
- `INV-GROUP-002`：群消息不做每成员 Fan-out Write，不为每条消息永久写入每成员回执；200 人以上默认只展示已读人数。

### 3.5 消息

- `FR-MSG-001` **MVP**：支持 `TEXT`、`IMAGE`、`FILE`；`AUDIO`、`VIDEO`、`LOCATION`、`CONTACT`、`RICH_CARD`、`CUSTOM`、`SYSTEM` 属完整范围。
- `FR-MSG-002` **MVP**：每条消息包含服务器 ID、会话 ID、`seq`、发送者及设备、`clientMessageId`、类型、`contentVersion`、Payload 和创建时间。
- `FR-MSG-003` **MVP**：支持发送、失败重试、回复、引用、转发、撤回、用户级删除、清空历史、表情回应、@成员和举报。
- `FR-MSG-004` **POST-MVP**：消息编辑、收藏和定时消息可延期；编辑能力实现后必须同步到全部设备。
- `FR-MSG-005` **MVP**：客户端状态支持 `LOCAL_PENDING`、`UPLOADING`、`SENDING`、`ACCEPTED`、`FAILED`、`RECALLED`。
- `FR-MSG-006` **MVP**：服务端语义支持 `ACCEPTED`、`DELIVERED`、`READ`、`RECALLED`、`DELETED_FOR_USER`。
- `INV-MSG-001`：`ACCEPTED` 仅表示消息事务已提交 PostgreSQL；WebSocket Emit 或推送成功不得解释为 `DELIVERED`。
- `INV-MSG-002`：消息顺序仅由 `conversationId + seq` 决定，不得使用 `createdAt` 作为唯一顺序。
- `INV-MSG-003`：客户端重试必须复用同一 `clientMessageId`；`requestId` 可随每次网络命令变化。
- `INV-MSG-004`：消息协议由 `type + contentVersion + payload` 定义，不兼容变更必须提升版本且不得改变旧字段语义。

默认内容限制：文本 8 KB、Custom Payload 32 KB、图片 20 MB、语音 20 MB、视频 500 MB、普通文件 1 GB、单个 Rich Card 最多 10 个 Action。

### 3.6 可靠性、送达与同步

- `FR-SYNC-001` **MVP**：WebSocket 仅承担低延迟通知，离线和断线恢复使用 PostgreSQL 中的用户同步事件与会话消息序号。
- `FR-SYNC-002` **MVP**：每个设备维护独立 `lastSyncEventId`；服务端按单调递增游标返回事件和缺失消息范围。
- `FR-SYNC-003` **MVP**：消息、回执、会话、成员、群、联系人、设备撤销和媒体就绪变化均可生成用户同步事件。
- `FR-SYNC-004` **MVP**：游标超过 90 天保留窗口时返回 `SYNC_CURSOR_EXPIRED` 和 `fullSyncRequired=true`，客户端通过快照重建后继续增量同步。
- `FR-RECEIPT-001` **MVP**：送达和已读使用 `last_delivered_seq`、`last_read_seq` 游标，更新只能通过 `GREATEST` 向前推进。
- `FR-RECEIPT-002` **MVP**：任一设备已读后推进用户级已读游标，并同步到该用户全部设备。
- `INV-REL-001`：系统语义是“至少一次投递 + 幂等处理 + 数据库同步恢复”，不宣称跨组件 Exactly Once。
- `INV-REL-002`：RabbitMQ、Redis、Worker 或 WebSocket 短暂故障不能改变 PostgreSQL 中已提交的消息事实。
- `INV-REL-003`：RabbitMQ 重复投递、Outbox 重发和 Job 重试不得产生重复业务副作用。

### 3.7 多模态与对象存储

- `FR-MEDIA-001` **MVP**：客户端通过短期 Presigned URL 将文件直传私有 MinIO/S3 Bucket，文件字节不经过 API Server。
- `FR-MEDIA-002` **MVP**：服务端生成 Object Key，Complete 时使用 HEAD 校验大小、MIME、Magic Bytes 和 Checksum。
- `FR-MEDIA-003` **MVP**：附件状态支持 `UPLOADING`、`UPLOADED`、`PROCESSING`、`READY`、`FAILED`、`QUARANTINED`、`DELETED`；仅 `READY` 附件可发送。
- `FR-MEDIA-004` **MVP**：未完成上传自动清理，下载前检查会话和附件访问权限，预签名 URL 不写入日志。
- `FR-MEDIA-005` **POST-MVP**：视频转码、语音波形等高级衍生处理允许延期；病毒扫描和基础图片/文件处理保留在安全基线。

### 3.8 Bot、开放平台与 SDK

- `FR-BOT-001` **MVP**：支持 Bot 账号、授权会话中的事件订阅和消息发送、Webhook Endpoint、签名、重试、投递记录及重放。
- `FR-BOT-002` **MVP**：Bot 与开放应用按 Scope 授权，Scope 至少覆盖用户、会话、成员、消息、媒体和 Webhook 管理。
- `FR-BOT-003` **MVP**：Webhook 使用 App ID、Event ID、Timestamp、Nonce 和 HMAC-SHA256 签名；2xx 成功，429/5xx 重试，普通 4xx 不重试。
- `FR-BOT-004` **MVP**：Webhook URL 必须防 SSRF；事件按 `eventId` 幂等；Bot 默认不消费自身事件并受 `hopCount` 限制。
- `FR-SDK-001` **MVP**：提供 `@im/contracts`、`@im/sdk-core` 和 Web SDK，封装 REST、Token 刷新、重连、ACK、消息重试、同步游标、事件去重和上传。
- `FR-SDK-002` **MVP**：Web SDK 支持 IndexedDB、BroadcastChannel、多标签页协调和网络恢复。
- `FR-SDK-003` **POST-MVP**：Node、React、React Native、Swift 和 Kotlin 等扩展 SDK 可按计划后置；React 包只负责 Provider、Hooks 和 Store Binding。

### 3.9 管理、治理和通知

- `FR-ADMIN-001` **MVP**：平台管理员可封禁用户、治理群、禁用 Bot、处理举报和发布系统通知。
- `FR-ADMIN-002` **MVP**：管理员操作全部审计；查看消息正文必须产生审计记录。
- `FR-NOTIFY-001` **MVP**：在线投递与离线推送分离，APNs/FCM 成功不等于应用层送达。
- `FR-SEARCH-001` **MVP**：提供基础消息搜索；独立搜索引擎属于非目标。

## 4. 外部接口

### 4.1 REST API

统一前缀为 `/api/v1`。列表使用 `cursor`、`limit`、`nextCursor`、`hasMore`；消息历史使用 `beforeSeq`。写接口接受 `Idempotency-Key` 和 `X-Request-Id`，并返回稳定错误码。

核心路由：

```text
POST   /auth/registration-challenges
POST   /auth/register              POST   /auth/login
POST   /auth/refresh               POST   /auth/logout
POST   /auth/logout-all            GET    /auth/sessions
DELETE /auth/sessions/:sessionId
POST   /auth/password/change
POST   /auth/password-reset/challenges
POST   /auth/password-reset/confirm

GET    /users/me                   PATCH  /users/me
DELETE /users/me
GET    /users/:userId              GET    /users/search
GET    /devices                    DELETE /devices/:deviceId
GET    /privacy-settings           PATCH  /privacy-settings

POST   /friend-requests            GET    /friend-requests
POST   /friend-requests/:id/accept POST   /friend-requests/:id/reject
GET    /contacts                   PATCH  /contacts/:userId
DELETE /contacts/:userId
POST   /blocks/:userId             DELETE /blocks/:userId
GET    /blocks
POST   /reports

POST   /conversations/direct       POST   /conversations/groups
GET    /conversations              GET    /conversations/:id
PATCH  /conversations/:id/settings
DELETE /conversations/:id/view     POST   /conversations/:id/read
GET    /conversations/:id/members  POST   /conversations/:id/members
DELETE /conversations/:id/members/:userId
POST   /conversations/:id/leave    POST   /conversations/:id/transfer-owner
DELETE /conversations/:id

POST   /conversations/:id/messages
GET    /conversations/:id/messages?beforeSeq=:seq&limit=:limit
GET    /messages/:messageId        PATCH  /messages/:messageId
POST   /messages/:messageId/recall POST   /messages/:messageId/reactions
DELETE /messages/:messageId/reactions/:reaction
POST   /messages/:messageId/forward
DELETE /messages/:messageId/view   GET    /messages/:messageId/readers
GET    /messages/search

POST   /files/uploads              POST   /files/uploads/:uploadId/complete
GET    /files/:attachmentId        POST   /files/:attachmentId/download-url
DELETE /files/uploads/:uploadId

POST   /sync                       GET    /sync/events
GET    /sync/snapshot              GET    /conversations/:id/messages/range

POST   /apps                       GET    /apps
POST   /apps/:appId/credentials    POST   /bots
PATCH  /bots/:botId                POST   /bots/:botId/webhooks
POST   /bots/:botId/messages       GET    /bots/:botId/deliveries
POST   /bots/:botId/deliveries/:deliveryId/replay
```

统一错误结构：

```json
{
  "requestId": "req_...",
  "code": "MESSAGE_FORBIDDEN",
  "message": "The message cannot be sent",
  "details": {},
  "timestamp": 1784520000000
}
```

### 4.2 WebSocket

客户端命令：

```text
connection.auth       message.send          message.delivered
message.edit          message.recall        reaction.add
reaction.remove       conversation.read     conversation.sync
typing.start          typing.stop           presence.heartbeat
```

服务端事件：

```text
connection.ready      message.accepted      message.created
message.updated       message.recalled      receipt.updated
conversation.created  conversation.updated  conversation.removed
member.updated        typing.updated        presence.updated
sync.required         session.revoked       media.ready
system.notice
```

```ts
export interface WsCommand<T = unknown> {
  version: 1;
  event: string;
  requestId: string;
  deviceId: string;
  timestamp: number;
  data: T;
}

export interface WsServerEvent<T = unknown> {
  version: 1;
  event: string;
  eventId: string;
  serverTimestamp: number;
  traceId?: string;
  data: T;
}

export interface WsAck<T = unknown> {
  requestId: string;
  ok: boolean;
  code: string;
  message?: string;
  data?: T;
  serverTimestamp: number;
}
```

所有改变业务状态的命令必须返回 ACK。

P3 已发布的单聊与文本消息协议固定为：

```ts
interface SendTextMessageRequest {
  clientMessageId: string;
  type: "TEXT";
  contentVersion: 1;
  payload: { text: string }; // UTF-8 非空且不超过 8 KiB
}

interface MessageAccepted {
  status: "ACCEPTED";
  messageId: string;
  conversationId: string;
  seq: number;
  duplicate: boolean;
  serverTimestamp: number;
}
```

- `POST /conversations/direct` 接受目标 `userId`；联系人可以创建，陌生人仅在接收方允许陌生人消息时可以创建，任一方向 Block 都拒绝。
- 消息历史的 `beforeSeq` 为排他上界，默认 20、最大 50；响应按 Seq 正序返回并携带 `nextBeforeSeq` 和 `hasMore`。
- P3 的 WS 写命令为 `message.send`、`message.delivered`、`conversation.read`；Envelope 的 `event` 和 Socket.IO 事件名必须一致，`deviceId` 必须匹配认证 Session。
- P5 已在 P3 的消息事务之上开放 `GROUP + TEXT`，并以 `SYSTEM` 消息记录成员加入/离开、移除、资料更新、群主转让、管理员和禁言变化；Image/File 与高级消息仍按 [plan.md](./plan.md) 的后续阶段交付。

P5 群聊接口位于 `/api/v1`：

```text
POST   /conversations/groups
GET    /conversations/:conversationId/group
PATCH  /conversations/:conversationId/group
GET    /conversations/:conversationId/members
POST   /conversations/:conversationId/members
PATCH  /conversations/:conversationId/members/:userId
DELETE /conversations/:conversationId/members/:userId
POST   /conversations/:conversationId/leave
POST   /conversations/:conversationId/transfer-owner
DELETE /conversations/:conversationId
POST   /conversations/:conversationId/invites
POST   /group-invites/:inviteId/decision
POST   /conversations/:conversationId/join-requests
GET    /conversations/:conversationId/join-requests
POST   /group-join-requests/:requestId/decision
```

群资料和成员变更均在 Command Service 事务内完成。`OWNER` 可转让群主、管理管理员和解散；`OWNER/ADMIN` 可审核申请、移除成员和禁言；成员是否可邀请由 `allowMemberInvites` 控制。非成员读取/发送均拒绝，被移除成员立即失去权限。群系统消息与文本消息共享同一会话 Seq，且 `countsUnread=false`；群消息不进行逐成员 Fan-out Write。

### 4.3 Sync API

`POST /api/v1/sync` 接受 `deviceId`、`userSyncCursor`、各会话 `lastSeq` 和不超过服务端上限的 `limit`，返回下一用户游标、`hasMore`、同步事件、缺失消息范围与服务器时间。客户端必须先顺序落地事件，再原子更新本地游标。

P4 已实现的同步接口语义：

- `GET /api/v1/sync/events` 使用 `deviceId + after + limit`，`after` 为排他游标；事件按用户过滤并按 `user_sync_events.id` 正序返回。
- `GET /api/v1/sync/snapshot` 使用 `deviceId` 返回当前用户、设备、联系人、黑名单、会话摘要和最新用户游标；快照不修改消息、Outbox 或投影事实。
- `GET /api/v1/conversations/:conversationId/messages/range` 使用排他的 `afterSeq`、`beforeSeq` 和 `limit`，只允许活动成员读取，消息按 `seq` 正序返回。
- 同步游标超过 90 天保留窗口时返回 `SYNC_CURSOR_EXPIRED`、HTTP 410 和 `details.fullSyncRequired = true`；客户端必须先获取快照再继续增量同步。
- 每台设备的同步游标独立保存；设备不属于当前用户、已撤销或已删除时返回 `SYNC_DEVICE_FORBIDDEN`。
- `message.created.v1` 事件只携带消息 Payload 和 `conversationId + seq` 索引，不复制消息永久事实；客户端发现事件缺口时使用 Message Range 补齐。

P4 SDK 约定：`@im/sdk-core` 提供可注入 Storage、REST/Socket Transport、Refresh Token 串行刷新、`eventId` 去重和游标顺序应用；`@im/sdk-web` 使用 IndexedDB 与 BroadcastChannel 协调多标签页。核心 SDK 不依赖 NestJS、TypeORM 或 Node-only 基础设施。

### 4.4 Contracts 和 SDK

协议统一由无框架依赖的 `@im/contracts` 发布，并通过 `/api`、`/websocket`、`/events`、`/messages`、`/errors` 子路径导出。Contracts 仅包含类型、Schema、Envelope、错误码、枚举、版本及序列化规则，不得依赖 NestJS、TypeORM、Redis、RabbitMQ、BullMQ 或对象存储 SDK。

## 5. 系统不变量汇总

| 编号 | 不变量 |
| --- | --- |
| `INV-CONV-001` | 有效单聊按 `direct_key` 唯一 |
| `INV-MSG-001` | PostgreSQL 提交后才可返回 `ACCEPTED` |
| `INV-MSG-002` | 会话消息顺序只由 `conversationId + seq` 确定 |
| `INV-MSG-003` | 同一用户意图的重试复用 `clientMessageId` |
| `INV-MSG-004` | 不兼容协议变更提升版本，不篡改旧语义 |
| `INV-GROUP-001` | 成员关系和权限在每个写命令中验证 |
| `INV-GROUP-002` | 群聊不采用每成员消息写扩散或逐消息永久回执 |
| `INV-REL-001` | 至少一次投递，所有副作用幂等 |
| `INV-REL-002` | Redis、MQ 和 WebSocket 不保存唯一消息事实 |
| `INV-REL-003` | 重投、重试和重启不产生重复副作用 |

实现机制详见 [技术设计](./adr/technical-design.md)。

## 6. 非功能需求

### 6.1 安全

- `NFR-SEC-001`：密码使用 Argon2id；Refresh Token 与 API Secret 仅保存哈希。
- `NFR-SEC-002`：外部链路使用 TLS/WSS，校验 WebSocket Origin 和消息大小。
- `NFR-SEC-003`：PostgreSQL、Redis、RabbitMQ、对象存储使用最小权限；Redis 使用 ACL，RabbitMQ 使用独立 VHost。
- `NFR-SEC-004`：私有 Bucket 配合短期上传/下载 URL，Webhook 防 SSRF，Rich Card 禁止可执行 HTML。
- `NFR-SEC-005`：日志不得记录密码、Token、API Secret、完整私聊正文或完整预签名 URL。
- `NFR-SEC-006`：管理后台启用 MFA，管理员读取消息正文和治理操作必须审计。

### 6.2 可运维性

- `NFR-OPS-001` **MVP**：四个进程提供独立 Liveness、Readiness 和优雅关闭。
- `NFR-OPS-002` **MVP**：输出结构化日志并包含可用的 request/trace/user/device/conversation/message/event/job/queue/error 关联字段。
- `NFR-OPS-003` **MVP**：采集连接数、消息接受/投递延迟、重复消息、同步延迟、Outbox、RabbitMQ、BullMQ、PostgreSQL 和 Redis 核心指标。
- `NFR-OPS-004` **MVP**：对 Outbox 老化、Queue 持续增长、DLQ、数据库连接池、Redis 内存和消息延迟配置关键告警。
- `NFR-OPS-005` **MVP**：PostgreSQL 自动备份开启，上线前完成至少一次可恢复性验证。
- `NFR-OPS-006` **POST-MVP**：完整 Grafana 仪表盘、全链路 Trace 覆盖、全面故障演练与高级分析可以后置。

### 6.3 降级行为

- PostgreSQL 不可用时不得返回 `ACCEPTED`，客户端保留 Pending 并重试。
- RabbitMQ 不可用时业务事务仍可提交，Outbox 保持 Pending，恢复后追平。
- Redis Realtime 不可用时 Presence/Typing 和跨节点广播降级，消息可通过 Sync 恢复。
- Redis Jobs 不可用时耗时任务暂停，文本消息主链路不受影响。
- Event Worker 不可用时 RabbitMQ 积压，恢复后幂等追平。
- MinIO/S3 不可用时文本消息可用，媒体上传和下载降级，消息元数据不丢失。

## 7. MVP 与延期范围

### 7.1 MVP 发布范围

MVP 必须交付：注册登录、多设备、用户资料、联系人和黑名单、单聊、基础群聊、文本/图片/文件消息、消息持久化、Conversation Seq、Client Message ID、Outbox、RabbitMQ、Delivered、Read、离线恢复、多端同步、撤回、Web SDK、REST/WS 协议、Bot Webhook、管理员封禁，以及基础日志、核心指标、自动备份和关键告警。

### 7.2 可延期能力

消息编辑、视频转码、语音波形、群详细已读成员、React Native/Swift/Kotlin SDK、独立搜索引擎、高级内容审核、频道、超大群、OAuth 用户授权模式、高级仪表盘、完整链路追踪和全面故障演练可延期，但不得破坏已经发布的 Contracts 与数据兼容性。

## 8. 系统级验收条件

- `AC-AUTH-001`：被移除或封禁设备的 HTTP、WebSocket 和刷新能力均失效，Refresh Token 重放撤销整个 Token Family。
- `AC-MSG-001`：相同 `clientMessageId` 重试不生成重复消息，同一会话 `seq` 严格递增且唯一。
- `AC-MSG-002`：API 在提交后、ACK 前崩溃，客户端重试仍只能得到原消息。
- `AC-EVT-001`：Outbox 发布后、标记前崩溃以及 Consumer 提交后、ACK 前崩溃均不产生重复副作用。
- `AC-SYNC-001`：丢弃部分或全部 WebSocket 通知后，客户端仍能通过 Sync 恢复到一致状态。
- `AC-SYNC-002`：任一设备推进已读后，其他设备最终收到一致游标；游标过期后可用快照重建。
- `AC-GROUP-001`：群角色权限完整，非成员不可访问，被移除成员立即失去发送权限，500 人群消息可正常投递和恢复。
- `AC-MEDIA-001`：大文件不经过 API，未 Ready 附件不可发送，重复 Complete 和 Worker 重试不生成重复产物。
- `AC-BOT-001`：Webhook 签名可验证、Scope 生效、失败可重试/重放、重复事件不重复执行且 URL 通过 SSRF 防护。
- `AC-PERF-001`：5,000 长连接、500 msg/s 持续 30 分钟和 1,000 msg/s 突发 60 秒达到目标延迟且无消息事实丢失。
- `AC-OPS-001`：四进程健康检查和优雅关闭有效，关键告警可触发，PostgreSQL 备份能够恢复。

测试分层和执行门槛见 [plan.md](./plan.md) 与 [adr/standards.md](./adr/standards.md)。

## 9. PRD 覆盖矩阵

| PRD 章节 | 权威拆分位置 |
| --- | --- |
| 1 项目概述 | 本文 §2；`adr/architecture.md` |
| 2 容量与性能目标 | 本文 §2.1～2.2 |
| 3 用户角色 | 本文 §2.3 |
| 4 认证与账号 | 本文 §3.1、§4.1 |
| 5 用户、隐私与联系人 | 本文 §3.2 |
| 6 会话管理 | 本文 §3.3；`adr/technical-design.md` |
| 7 群聊 | 本文 §3.4 |
| 8 消息系统 | 本文 §3.5 |
| 9 消息可靠性 | 本文 §3.6、§5；`adr/technical-design.md` |
| 10 消息发送链路 | `adr/technical-design.md` |
| 11 Transactional Outbox | `adr/technical-design.md` |
| 12 RabbitMQ | `adr/architecture.md`、`adr/technical-design.md` |
| 13 BullMQ | `adr/architecture.md`、`adr/technical-design.md` |
| 14 Redis | `adr/architecture.md`、`adr/technical-design.md` |
| 15 离线与多端同步 | 本文 §3.6、§4.3；`adr/technical-design.md` |
| 16 送达与已读 | 本文 §3.6；`adr/technical-design.md` |
| 17 多模态与对象存储 | 本文 §3.7；`adr/technical-design.md` |
| 18 Bot 与开放平台 | 本文 §3.8；`adr/technical-design.md` |
| 19 REST API | 本文 §4.1 |
| 20 WebSocket 协议 | 本文 §4.2；`adr/standards.md` |
| 21 SDK | 本文 §3.8、§4.4 |
| 22 PostgreSQL 数据模型 | `adr/technical-design.md` |
| 23 核心表设计 | `adr/technical-design.md` |
| 24 总体架构 | `adr/architecture.md` |
| 25 多进程职责 | `adr/architecture.md`、`AGENTS.md` |
| 26 代码目录 | `adr/standards.md` |
| 27 单模块目录 | `adr/standards.md` |
| 28 Composition Module | `adr/architecture.md`、`adr/standards.md` |
| 29 Gateway 规范 | `adr/standards.md`、`AGENTS.md` |
| 30 Contracts 规范 | 本文 §4.4；`adr/standards.md` |
| 31 工程强制规范 | `adr/standards.md`、`AGENTS.md` |
| 32 安全设计 | 本文 §6.1；`adr/technical-design.md` |
| 33 可观测性 | 本文 §6.2；`adr/technical-design.md` |
| 34 故障降级 | 本文 §6.3；`adr/architecture.md` |
| 35 测试策略 | `adr/standards.md`、`plan.md` |
| 36 压测场景 | 本文 §8；`plan.md` |
| 37 14 周计划 | `plan.md` |
| 38 MVP 定义 | 本文 §7；`plan.md` |
| 39 上线检查 | `plan.md`、`adr/standards.md` |
| 40 最终架构总结 | `adr/architecture.md` |
