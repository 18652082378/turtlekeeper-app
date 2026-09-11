# 构建 103 上传，继续支持 1.0.7

本地版本为 1.0.8（103），公开版本仍为 1.0.7（99）。服务器不执行旧版损耗账本迁移；新版客户端自行完成新版功能的数据处理。

以下命令按已有部署约定使用 `/www/turtlekeeper-app` 和 PM2 进程 `turtlekeeper-api`。实际目录不同需替换。此文档不表示已经上传或部署。

## Windows 本地 PowerShell

构建 103 的功能代码已在 `c5d932b` 提交，以下提交其后的兼容修复：

```powershell
cd "C:\Users\Administrator\Documents\Codex\2026-06-02\apple-store\outputs\turtlekeeper-app"
git add -- server/server.js scripts/test-api-workflows.js docs/loss-accounting.md docs/deploy-build-103.md
git commit -m "Preserve 1.0.7 server compatibility for build 103"
if ($LASTEXITCODE -eq 0) { git push origin main }
```

## Linux 服务器

```bash
cd /www/turtlekeeper-app &&
git pull --ff-only origin main &&
npm ci --omit=dev &&
node --check server/server.js &&
npm run build &&
MIN_SUPPORTED_APP_BUILD=95 LATEST_APP_BUILD=99 pm2 restart turtlekeeper-api --update-env &&
pm2 save &&
curl --fail --silent --show-error http://127.0.0.1:8787/api/app/version
```

返回值应包含 `minimumBuild: 95` 和 `latestBuild: 99`。通过 PM2 更新环境变量可覆盖之前错误设置为 103 的门槛；`pm2 save` 保存重启后的进程配置。如果以后重新创建进程，也需保持这两个变量，不能在 `server/.env` 中设置为 103。

此更新会重启 API，可能短暂中断请求。服务器也提供网页，因此网页资源会更新；已安装的 1.0.7 iOS 客户端仍使用其随包资源。不要清空或覆盖 `server/.env`、运行数据目录及上传目录，不执行数据库迁移。

同一账号在新版中修改并同步的数据会被旧版读到；旧版不具备批次聚合界面及新版损耗撤销逻辑。版本兼容意味着保留旧版 API 和原有请求语义，不意味着同账号的新旧设备数据彼此隔离。
