# 构建 104 上传，继续支持 1.0.7

应用版本为 1.0.8（104）。包含账本批次选择、分次孵化、损耗饲养天数、同步保护和 iOS 文件导出修改。以下是上传命令，不表示已经提交、推送或部署。

## Windows 本地 PowerShell

```powershell
cd "C:\Users\Administrator\Documents\Codex\2026-06-02\apple-store\outputs\turtlekeeper-app"
git add -- app.js styles.css config.js assets/turtle-batches.js server/server.js ios/App/App/TurtleMediaPickerPlugin.swift ios/App/App.xcodeproj/project.pbxproj scripts docs/account-sync-recovery.md docs/deploy-build-104.md
if ($LASTEXITCODE -ne 0) { throw "暂存失败" }
git commit -m "Release 1.0.8 build 104: batch ledger, hatching, sync and export fixes"
if ($LASTEXITCODE -ne 0) { throw "提交未完成，请检查上方输出" }
git push origin main
```

## Linux 服务器

使用已有部署目录和 PM2 进程。仓库级 origin 使用 GitHub 地址，本次 pull 的精确地址重写用于绕开之前导致 403 的 gh-proxy 下载代理规则。

```bash
cd /www/turtlekeeper-app &&
git remote set-url origin https://github.com/18652082378/turtlekeeper-app.git &&
git -c 'url.https://github.com/18652082378/turtlekeeper-app.insteadOf=https://github.com/18652082378/turtlekeeper-app' pull --ff-only origin main &&
npm ci --omit=dev &&
node --check server/server.js &&
npm run build &&
MIN_SUPPORTED_APP_BUILD=95 LATEST_APP_BUILD=99 pm2 restart turtlekeeper-api --update-env &&
pm2 save &&
curl --fail --silent --show-error http://127.0.0.1:8787/api/app/version
```

版本接口应返回 `minimumBuild: 95`、`latestBuild: 99`，保留 1.0.7 的服务端支持，不提高最低版本或公开版本。不覆盖服务器环境配置、账号数据及上传目录，不执行数据库迁移。API 重启期间可能短暂中断请求；服务器网页会随代码更新。

同账号的新旧客户端共享云端数据；兼容不代表数据隔离。已安装的 iOS 应用需要重新打包、签名并安装 1.0.8（104）才能使用新的随包页面及原生文件导出。Windows 上的 Web 构建和版本检查不等于生成了签名 IPA；原生导出需在 iPhone 上验证。
