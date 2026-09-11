# MySQL 分记录存储：迁移和回滚

本次改造在服务器增加 `MYSQL_STORAGE_MODE=records`。只有完成数据迁移并启用该配置，才会停止日常请求对整站 JSON 的重写。代码上传本身不会自动切换正式数据库。

## 改了什么

- 原来任何账号改动都序列化全站并更新 `turtlekeeper_app_state` 的一大条 JSON。
- 新模式按账号隔离变更范围，将档案、账本、繁殖等列表的成员分别存成数据库记录，只写发生变化的记录及必要的目录。聊天、商城等全局列表也按成员拆分。
- 一次保存的档案状态、账本等相关变更在同一个 InnoDB 事务中提交，成功响应等待提交完成。失败不会返回保存成功，后续读写暂停，避免未提交的内存状态覆盖数据库。
- 使用数据库版本检查和单写入进程锁。保留现有 HTTP 接口、账号数据格式和客户端版本支持策略；本次改造不需要重新构建 iOS 包。
- 旧表保留。迁移验证全部字段、数组顺序、历史重复 ID 和图片引用可原样还原，不重新创建购入/孵化业务记录，也不自行推断旧龟池数量。

模拟数据测试：1000 个账号、50000 只龟，修改其中一只的体重，原整站序列化数据为 6,833,785 字节；新模式写入 1 条记录、152 字节。这是记录 JSON 的大小，不包含 SQL、索引、事务日志等开销，不代表真实 RDS 吞吐量。

## 当前边界

这是记录级增量持久化，尚未改为每个接口按需查询业务表。启动时仍加载全站数据到内存，并缓存各记录的序列化结果；修改一个账号时仍比较该账号的数据。大型全局列表仍需扫描其所属列表，但不会因此扫描其他账号。

因此只支持 **一个 API 进程，PM2 fork 模式**；不要使用 PM2 cluster、多实例或滚动 reload。启动第二个新版写入进程会被拒绝。它解决整站重写，但不能据此保证 3000 日活的容量。后续仍需用接近真实账号、照片引用和业务操作比例的数据测量内存、响应延迟和数据库负载。

定时完整备份仍会生成完整 JSON，客户端仍沿用原来的账号同步协议；本次不删除备份能力，也不改成客户端逐条增量协议。

## 本地检查和上传

PowerShell，在项目目录运行：

```powershell
node scripts/test-mysql-records.js
node scripts/test-mysql-record-api.js
node scripts/test-api-workflows.js
$env:TURTLE_TEST_RECORD_DRIVER = '1'
node scripts/test-api-workflows.js
Remove-Item Env:TURTLE_TEST_RECORD_DRIVER
```

以上默认使用隔离的事务模拟驱动或临时文件，不连接正式 RDS。新存储测试覆盖迁移、增量写入、排队保存、事务失败、版本冲突、删除、重启和回滚。HTTP 测试覆盖提交延迟、失败响应和既有接口。

本次后端相关文件可单独提交；先查看暂存内容再推送，避免混入本机备份和媒体：

```powershell
git add -- package.json server/server.js server/mysql-record-store.js scripts/migrate-mysql-records.js scripts/migrate-json-to-mysql.js scripts/migrate-local-media-to-oss.js scripts/migrate-legacy-videos-for-ios.js scripts/mysql-record-test-driver.js scripts/mysql-record-test-preload.js scripts/test-mysql-records.js scripts/test-mysql-record-api.js scripts/test-api-workflows.js docs/mysql-record-storage.md
git diff --cached --stat
git commit -m "Persist MySQL changes by record with verified migration and rollback"
if ($LASTEXITCODE -eq 0) { git push origin main }
```

## 必须先在测试 MySQL 演练

配置 `TEST_MYSQL_URL` 为专用测试 MySQL 8 的连接地址，再执行 `node scripts/test-mysql-records.js`。不要使用生产连接信息。测试账号需要创建和删除测试数据库的权限：脚本生成随机 `tk_record_test_*` 库，仅在这个库中操作，结束时删除它。脚本不会读取 `server/.env`。

真实 MySQL 测试验证迁移、读回、提交和重启读取；失败注入由模拟驱动验证。再在测试环境用生产备份的脱敏副本运行下面的迁移、API 和回滚流程，核对收购、售出、损耗、批次、龟池及繁殖数量/金额，并记录响应耗时、ECS 内存和 RDS CPU/IOPS。未做这些检查前，不把模拟测试当成真实 RDS 上线验收。

## 正式服务器切换

以下沿用 `/www/turtlekeeper-app`、`turtlekeeper-api`。需要短暂维护窗口。不要在旧进程仍运行时迁移，旧代码不认识新模式和进程锁。

1. 上传后端代码、安装依赖并预检。脚本读取 `server/.env` 中已有 MySQL 配置；不要把密码贴进聊天。

```bash
cd /www/turtlekeeper-app &&
git pull --ff-only origin main &&
npm ci --omit=dev &&
node --check server/server.js &&
node --check server/mysql-record-store.js &&
node scripts/migrate-mysql-records.js
```

预检不修改数据库，显示账号数、拆分记录数、最大记录大小和数据指纹。当前代码默认 `legacy`，此阶段仍兼容旧存储。如果 Git 拉取失败，先解决仓库连接，不继续后面的步骤。

2. 在阿里云控制台完成 RDS 备份，确认备份可用。确认 PM2 只有一个 `turtlekeeper-api`、使用 fork 模式；设置足够的停止等待时间，例如 `kill_timeout: 30000`，再停止 API。其他直接写此库的脚本也必须停止。

```bash
pm2 stop turtlekeeper-api &&
node scripts/migrate-mysql-records.js --apply
```

脚本从当前 RDS 取数据，先写入完整、校验过的本机备份，再在事务中迁移并全量还原比较；通过后标记启用新表。备份路径会打印出来，默认在 `server/backups/mysql-record-cutover/`，配置了 `TURTLE_RUNTIME_DIR` 则在其 `backups/mysql-record-cutover/` 下。保留该备份并拷贝到另一安全存储位置。

迁移失败时不要盲目启用新模式。再次执行不带 `--apply` 的预检，确认当前模式；事务失败会回滚，旧表保留。新表已启用则不能直接恢复旧二进制。

3. 迁移明确成功后，在 `server/.env` 添加或修改 `MYSQL_STORAGE_MODE=records`。同时更新 PM2 的同名环境变量，避免旧环境值覆盖配置。保留服务器当前的 `MIN_SUPPORTED_APP_BUILD` 和 `LATEST_APP_BUILD`，不要因这次优化强制旧客户端升级。

```bash
MYSQL_STORAGE_MODE=records pm2 restart turtlekeeper-api --update-env &&
pm2 save &&
curl --fail --silent --show-error http://127.0.0.1:8787/api/app/version
```

启动日志必须显示 `MySQL 分记录增量写入（单 API 实例）`。版本接口只是存活检查；还需要用测试账号登录，保存一条档案/账本，重启后核对，再用另一端验证同步。对照迁移前的业务总量。观察日志没有写入失败或版本冲突，旧整站表不再因这些操作更新。

若数据库写入失败，API 会报错并暂停后续读写。先排查 RDS 空间、连接和错误日志，再重启 API，从已提交的数据恢复；不要清理用户本机数据。

## 带最新数据的回滚

**不能仅切换配置或退回旧代码**：旧整站表在分记录模式启用后不会持续更新，直接使用会漏掉期间新增的数据。

停止 API 后，执行：

```bash
cd /www/turtlekeeper-app &&
pm2 stop turtlekeeper-api &&
node scripts/migrate-mysql-records.js --rollback --apply
```

脚本先备份新表的最新完整数据，再用带版本校验的事务重建旧表并切换模式。失败则不切换；成功后把 `server/.env` 改为 `MYSQL_STORAGE_MODE=legacy`，启动本次新版服务：

```bash
MYSQL_STORAGE_MODE=legacy pm2 restart turtlekeeper-api --update-env &&
pm2 save
```

新表仍保留以便核对。再次迁移会拒绝覆盖非空新表，需由维护人员备份核对后安排下一次迁移，不应直接删表重试。

`node scripts/migrate-mysql-records.js --export` 可从当前存储导出完整数据。原来的 `restore-server-backup.js` 恢复的是服务器文件，**不恢复 RDS**；不要把它当成新存储的数据库恢复命令。原 JSON 入库、OSS 历史媒体迁移和历史视频迁移脚本在新存储启用后会拒绝写旧表，需要后续改造这些维护工具再使用。
