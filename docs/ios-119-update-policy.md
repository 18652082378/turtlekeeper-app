# App Store 1.1.9 苹果更新策略

用户已确认新版本可在大陆 App Store 搜索到；本机公开接口核实中国大陆返回 1.1.9。1.1.8 对应 build 136，1.1.9 从 build 137 开始（最新源码及商店发布工作流为 build 139）。

本次最低苹果构建改为 137，最新构建为 139；1.1.8 及更早版本在下次启动并成功检查更新时显示强制更新页，1.1.9 的 137/138/139 可继续使用。Android 的 beta、store 与旧 Android User-Agent 默认请求、网页和 Harmony 的返回保持原样。不删除旧用户数据，不重新构建客户端。已在前台运行的旧客户端没有后台推送退出能力，需要重新启动 App 触发原有检查。

电脑 Git Bash：

```bash
bash "C:/Users/Administrator/.codex/worktrees/e76e/turtlekeeper-app/scripts/upload-ios-119-policy.sh"
```

脚本检查后仅提交明确清单并正常推送，自动复制服务器命令。若只需重新复制：

```bash
node "C:/Users/Administrator/.codex/worktrees/e76e/turtlekeeper-app/scripts/copy-ios-119-policy-command.cjs" --clipboard
```

在已登录的阿里云 Shell 粘贴执行。命令含校验过的安装器，不下载 GitHub 文件。安装器只接受核对过的 136 策略原文或相同的新策略，检查唯一 PM2 服务及全部平台接口基线，备份后原子替换 server/app-update-policy.js，短暂重启 API，核对 iOS 新边界及其他平台原样保留，失败尝试回滚。不改 .env、数据库、网页入口、其他服务端模块。看到 SUCCESS 或 ALREADY ACTIVE 才能认定服务器生效，再核对公开版本接口。
