# 磁盘空间保护：2026-09-19

现场：40GB 系统盘用满，自动备份 29GB、上传文件 3.2GB。清理旧自动备份后剩余 13GB。

## 已实现，部署后生效

- 默认保留 7 天、最多 3 份完整自动备份，优先保护最近 2 份完整备份。
- 自动备份容量预算 10GiB。预计旧备份加新备份超过预算时，先淘汰允许清理的旧副本；仍无法满足则跳过并记录告警。
- 新备份完成后预计至少剩余 5GiB 才开始，每个媒体文件复制前再次检查空间。此预留约束只控制备份，不能阻止其他进程写满磁盘。
- 先写 `.partial` 临时目录，数据及文件清单完成后再更名。复制失败立即清理本次临时目录；缺失/损坏清单的目录不再被当成当天成功的备份。
- 仅清理 `YYYY-MM-DD-HHMMSS-daily/startup/scheduled` 自动备份目录。迁移备份、手动备份、代码备份、账户恢复快照、当前数据库及原始上传文件不在清理范围。
- 已有受保护的两份备份即使超过预算也保留，暂停创建新备份并告警；因此预算不是强制删除所有超限数据的硬配额。
- 备份暂停或持续增长时，需要归档到其他存储或扩容。不能仅凭本地副本保证灾难恢复。

已验证：保留策略、容量不足、拷贝中途容量不足、模拟 EIO、失败目录清理、缺失清单、保护迁移目录；真实隔离 API 的注册/登录及业务接口回归。未连接生产数据库，未部署。

## 1. 电脑 Git Bash 上传

只上传备份相关文件；不包括尚未发布的注册界面修复及其他 MySQL 修改。

```bash
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app &&
files=(
  server/server.js
  server/backup-storage.js
  scripts/test-backup-storage.cjs
  scripts/deploy-backup-storage.cjs
  docs/disk-space-protection.md
) &&
git add -- "${files[@]}" &&
git -c gc.auto=0 -c maintenance.auto=false commit --only -m "Limit automatic backups and preserve disk reserve" -- "${files[@]}" &&
git -c gc.auto=0 -c maintenance.auto=false push origin main
```

## 2. 服务器 SSH 安装

先完成上一步。安装器只更新备份模块，不运行 `git pull` 覆盖线上工作目录。
会备份原 server.js，检查已知旧备份代码；不匹配时停止，不要绕过。重启后会按新规则清理旧自动备份。

```bash
cd /www/turtlekeeper-app &&
git -c 'url.https://github.com/18652082378/turtlekeeper-app.insteadOf=https://github.com/18652082378/turtlekeeper-app' fetch origin main &&
backup_patch=$(mktemp /tmp/turtle-backup-policy.XXXXXX.cjs) &&
git show origin/main:scripts/deploy-backup-storage.cjs > "$backup_patch" &&
node "$backup_patch" --check &&
node "$backup_patch" --apply &&
node --check server/server.js &&
BACKUP_RETENTION_DAYS=7 BACKUP_MAX_COUNT=3 BACKUP_MAX_GB=10 BACKUP_MIN_FREE_GB=5 \
  pm2 restart turtlekeeper-api --update-env &&
pm2 save &&
curl --fail --silent --show-error --retry 10 --retry-delay 2 --retry-connrefused \
  http://127.0.0.1:8787/api/app/version
```

检查：

```bash
df -h /www/turtlekeeper-app
sudo du -sh /www/turtlekeeper-app/server/backups
pm2 logs turtlekeeper-api --lines 40 --nostream
```

版本接口仍应返回 `minimumBuild:114`、`latestBuild:114`。备份相关提示不可长期忽略：空间不足时业务优先，但本地备份会暂停。
使用原有 ecs-user 的 PM2，不要另用 sudo 创建第二套进程。PM2 保存当前配置；将来重建进程时也要保留上述策略参数。模块默认值与此处一致。

## 3. PM2 日志轮转

在同一个服务器 ecs-user 终端执行一次：

```bash
pm2 install pm2-logrotate &&
pm2 set pm2-logrotate:max_size 20M &&
pm2 set pm2-logrotate:retain 7 &&
pm2 set pm2-logrotate:compress true &&
pm2 save
```

每条日志流达到阈值后轮转，保留 7 份历史压缩文件。检查按间隔执行，20MB 不是瞬时硬限额。此设置不管理 `/var/log`；系统日志应使用系统自己的 logrotate/journald 策略。
官方文档：https://pm2.keymetrics.io/docs/usage/log-management/

## 4. 阿里云云监控

为当前 ECS 安装并启用云监控 Agent，给根挂载点 `/` 设置磁盘使用率告警：75% 预警、85% 紧急、95% 严重；inode 使用率 80% 预警。设置可接收通知的联系人，并测试通知。
监控数据库所在的其他挂载点（如有），并关注磁盘 I/O 错误。
云监控需要在控制台完成，本次没有代为配置告警或通知渠道。
官方说明：https://www.alibabacloud.com/help/en/cms/cloudmonitor-1-0/user-guide/host-monitoring/

## 5. 后续容量规划

业务图片、视频、数据库及账户恢复快照仍会增长。安排异地备份及恢复演练；需要时将媒体迁移到对象存储，再核验引用和完整性后按保留策略清理本地副本。不要直接删除 uploads。
仅扩容会延缓无限备份造成的占满，必须同时保留容量限制与告警。以上策略降低风险，不能保证磁盘永远不会满。
