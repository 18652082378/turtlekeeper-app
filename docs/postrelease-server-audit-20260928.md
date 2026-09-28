# 上线后后端专项检查（2026-09-28）

本报告只记录本轮后端代理实际执行的检查，不代表正式环境验收，也不包含其他代理的客户端、UI 或真实本地 MySQL 检查。

## 隔离条件

- HTTP 测试复制当前 JavaScript 源码到系统临时目录，不复制 `.env`、数据库、上传文件或备份。
- 子进程只继承 Windows 运行所需环境变量；数据库、短信、推送、OSS、支付配置均不继承；服务器只监听 `127.0.0.1`。
- 所有账号、聊天、图片字节、验证码和数据库故障均为合成数据。未访问正式接口，未调用真实短信、支付、推送或 OSS。
- 保留本轮开始前 `server.js` 的龟池数量上限修复和养护计数修复；未更改既有 `app-update-policy.js` 修改。

## 已复现与修复

| 问题 | 修复前证据 | 处理 |
| --- | --- | --- |
| 社区、私信和头像接收可执行协议或属性注入字符串 | 真实 HTTP 返回 200 并写入 `javascript:` 或包含双引号的媒体地址 | 新增 `server/media-url.js`，在社区发布、聊天发送、集市创建/编辑和头像保存入口验证 URL；允许现有 `/uploads/`、`/assets/`、HTTP(S)、合法栅格头像数据；保留签名查询串 |
| 全平台达到 5000 条私信后永久删除最旧消息 | 5000 条合成历史加一次发送后仍只有 5000 条；无关用户的最早会话被删除 | 移除 `newMessages.slice(-5000)` 隐式删除；保留明确的撤回/注销业务 |
| 媒体后缀 Range 处理错误 | 10 字节文件请求 `bytes=-4` 得到前 5 字节；HEAD 长度错误；`bytes=-0` 返回 206 | 正确计算最后 N 字节，并保持 206、Content-Range、HEAD、416 一致 |
| 非对象和损坏 JSON 错当鉴权/服务器异常 | `null` 和坏 JSON 返回 500，数组和字符串返回 401 | 请求入口只接受 JSON 对象，格式错误 400、超过既有 25 MiB JSON 请求上限 413 |
| 流式媒体无限写磁盘，JSON 媒体与流式限制不一致 | 低限额配置下大于限额的流式数据仍返回 200 并写盘 | Content-Length 提前检查和实际字节计数双重限制；413 明确提示；超限分块上传停止写盘并在文件关闭后清理残留；JSON 媒体采用相同媒体限额 |
| 成长记录删除未检查云端版本 | 旧 revision 的真实 HTTP 删除仍会执行 | 可选 `baseDataRevision` 冲突返回 409；明确错误格式返回 400；119 等省略此字段的旧客户端继续支持；保存采用 `await`、失败 503、时间戳单调递增 |
| JSON 数据库在等待远程注册验证码期间被旧快照覆盖 | 注入延迟验证码时，另一个账号新保存的养护记录被删除；同手机号先完成的注册被覆盖 | 验证码返回后重读数据库，并再次检查该手机号是否已注册，随后在同步段中创建用户 |

URL 验证是新写入入口保护，**不会扫描或删除已有数据库内容**。旧客户端展示已有恶意媒体的防护仍依赖客户端输出转义，需结合主任务的客户端修复发布。

成长删除的异步失败/等待断言使用独立 handler 与故障注入。原版全局 `sendJson` 已有 MySQL flush 等待；本轮不能据此声称正式 MySQL 曾提前返回成功。真实 HTTP 已验证 revision 检查、磁盘保存、重新加载和旧客户端省略字段兼容。

## 上传兼容范围

- 当前客户端及已发布 build 119 的社区/私信原图均允许 10 MiB，直接走 `/api/upload/media`。新的 `MAX_MEDIA_IMAGE_UPLOAD_BYTES` 默认 10 MiB，与此保持一致。
- 档案/头像 `/api/upload/image` 继续采用原有 `MAX_UPLOAD_BYTES` 默认 2 MiB。对应客户端会压缩到约 260000 个 data URL 字符。
- 视频原来只检查 30 秒，没有文件大小限制。`MAX_MEDIA_UPLOAD_BYTES` 默认 128 MiB 是**新增限制**；超过此值的高码率视频会得到明确 413 提示。119 已有显示服务端错误并不重试 413 的处理；新客户端前置检查由主任务实施。
- 上述媒体限额可通过环境配置调整；没有改变 JSON 整体 25 MiB 限制。JSON base64 需先读入既有受限 body，视频大文件继续使用流式通道。

## 回归证据

初始 HTTP 红测：21 项中 15 项失败、6 项通过，见 `output/postrelease-server-audit/red.json`。

最终专项：**34 个定向场景通过，另有 1 组既有完整 API 工作流通过**（不是声称只含 35 个底层断言）：

- `node scripts/test-postrelease-server-audit.cjs --workflows`：27 个真实 HTTP 场景 + 1 组既有 API workflows，28/28 通过。覆盖上述输入、归属、文件清理、Range、成长 revision、磁盘重读；既有组覆盖管理员三设备、登录/注销、账户保存、上传、社区、聊天、未读和集市售出关联。
- `node scripts/test-postrelease-growth-delete.cjs`：5/5 handler 场景通过；红测为 4 失败、1 通过。
- `node scripts/test-postrelease-registration-race.cjs`：2/2 并发 handler 场景通过；红测为 2 失败。
- `node --check server/server.js`、`node --check server/media-url.js` 和指定修改文件的 `git diff --check` 通过。

JSON 报告位于 `output/postrelease-server-audit/` 的 `report.json`、`growth-report.json`、`registration-report.json`；红测分别保留为 `red.json`、`growth-red.json`、`registration-red.json`。

## 未验证与剩余边界

- 本轮无正式环境验证：正式服务器实际源码/配置、正式 RDS、真实短信延时、OSS 故障、APNs、支付平台回调、真实 iPhone/Safari 仍未验证。
- 注册竞态使用可控异步验证码注入；没有通过真实短信服务测试并发。JSON 模式旧快照问题与 MySQL 共享内存模式不同，报告不将两者混为一谈。
- 删除聊天隐式上限可保护历史，但没有新增聊天分页和长期归档。大量历史消息的全量扫描/响应、JSON 模式全库读写性能仍需独立负载测试与后续分页设计。
- 新增单文件限额不等于账户总配额、上传频率限制或全面防滥用。没有在本轮擅自引入影响正常用户操作的全站限流。
- 已存在的恶意媒体数据、历史错误/丢失数据没有被自动迁移或恢复；生产恢复需另行核对备份。
- 线上部署必须同时包含新的 `server/media-url.js` 和更新后的 `server/server.js`，不能只复制主服务文件。
