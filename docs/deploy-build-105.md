# 构建 105 上传说明

版本：1.0.8（105）。启动交易指南引导页按设备本地日期每天展示一次，当天重启、刷新、跳过或自动关闭后不重复展示；次日首次正常启动再次展示。推送/分享链接直达页面不消耗展示次数，手动进入交易指南不受限制。无法保存展示日期时跳过引导，不阻塞启动。

包括本地尚未提交的批次详情样式、批次售出/损耗汇总、繁殖/批量购入/龟池业务校验、旧版数据兼容与同步保护修复。跨设备同时修改后的自动合并尚未实现，真实冲突仍会保留本机修改并暂停同步。

已执行网页构建、iOS 构建号/资源校验，以及引导页同日重启、跨本地午夜、重复调用、跳过、自动关闭、推送取消、存储失败和手动查看的浏览器测试。此处构建结果为代码与网页资源；签名 iOS 安装包需要在现有 Apple 构建流程中生成。

## 本地 PowerShell

```powershell
cd "C:\Users\Administrator\Documents\Codex\2026-06-02\apple-store\outputs\turtlekeeper-app"
git add -- app.js styles.css config.js assets/turtle-batches.js assets/trade-guide.js server/server.js ios/App/App.xcodeproj/project.pbxproj scripts docs/account-sync-recovery.md docs/core-business-audit-2026-09-11.md docs/upgrade-1.0.7-to-1.0.8.md docs/deploy-build-105.md
if ($LASTEXITCODE -ne 0) { throw "暂存失败" }
git commit -m "Release 1.0.8 build 105: daily intro, batch UI and business fixes"
if ($LASTEXITCODE -ne 0) { throw "提交未完成，请检查上方输出" }
git push origin main
```

## Linux 服务器

以下使用已有部署目录、Git 仓库和 PM2 进程。精确地址重写用于绕开之前报 403 的 gh-proxy 下载代理配置。

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

版本接口应返回 minimumBuild 95、latestBuild 99，继续支持 1.0.7，不将测试构建 105 设为公开强制升级版本。这些命令不执行数据库迁移，也不覆盖环境配置、账号数据和上传目录；重启 API 期间可能短暂中断请求。网站页面随服务器代码更新；手机内置页面需安装新构建 105 才能更新。

本次只准备了代码、构建和命令，没有代为提交、推送或部署。
