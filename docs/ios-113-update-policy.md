# 1.1.3 正式上线后停止支持 1.1.2

2026-10-03，按用户确认 1.1.3 已正式发布。版本记录中 1.1.2 最后构建为 121，1.1.3 从 122 开始，当前已提交发布构建为 124。

最低支持构建为 122，最新发布构建为 124。更新提示：“龟友手账 1.1.3 已正式上线。1.1.2 及更早版本已停止支持，请前往 App Store 更新后继续使用。”更新按钮继续打开 https://apps.apple.com/app/id6783481335。构建 120/121 需更新，122/123/124 可继续使用；更旧版本也需更新。

发布策略只修改 iOS。现有 Android、网页和 Harmony 响应保留；旧版不带 platform 的 iOS 请求仍收到更新策略。旧生产环境 MIN_SUPPORTED_APP_BUILD=117 / LATEST_APP_BUILD=119 不再降低 122/124 的发布边界。未来更高边界的环境配置仍允许；此安装脚本发现生产已经设置更高版本则拒绝安装，避免覆盖未来策略。

2026-10-03 的生产只读检查返回 minimumBuild=117、latestBuild=119 和 1.1.1 提示。此文档和代码生成不表示生产已更新，须在服务器执行下述安装命令并以 SUCCESS 输出和正式接口为准。

安装器兼容实际生产的内联 handleAppVersion 处理器和源码中的 app-update-policy.js 模块。只替换审核过的版本策略，不覆盖整个 server.js，不修改账号、聊天、商品、推荐模块、.env 或 PM2 环境变量。备份后短暂重启 API，检查默认 iOS、显式 iOS、两种 Android 通道、网页、Harmony、匿名认证；失败尝试回滚并验证原响应。首次安装、重复安装、CRLF、未知源码拒绝、载荷校验、备份和失败回滚均使用隔离夹具验证。

本地客户端策略测试覆盖 114–124 构建的阻断边界、提示内容、App Store 按钮、Android 通道隔离、原生版本检测、无效 URL 和网页绕过；完整本地 API 工作流通过。没有在生产写入测试数据，未对真实 iPhone 验收。

本地 Git Bash：

```bash
(
set -e
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app
git add --pathspec-from-file=scripts/ios-113-policy-release-files.txt
git diff --cached --check
git -c gc.auto=0 -c maintenance.auto=false commit --only -m "Require iOS 1.1.3 update for older versions [skip ci]" --pathspec-from-file=scripts/ios-113-policy-release-files.txt
git -c gc.auto=0 -c maintenance.auto=false push origin main
node scripts/copy-ios-113-policy-command.cjs --clipboard
)
```

最后一条把完整服务器安装命令复制到剪贴板。到已登录服务器终端粘贴执行即可；不需要公网 IP、手工上传文件或 GitHub Raw 下载。若已执行过此次 Git 提交，仅运行最后一条生成命令即可。

服务器安装成功后验证：

```bash
curl -fsS --connect-timeout 5 --max-time 15 'https://api.turtleworld.cn/api/app/version?platform=ios&build=121'
```

应返回 minimumBuild=122、latestBuild=124 和上述 1.1.3 提示。使用已有 1.1.2 手机客户端重新进入 App，确认更新界面及商店跳转；1.1.3 客户端应继续使用。这次仅调整服务器策略，无需重新打包客户端或提交新 App Store 版本；提交消息含 [skip ci] 避免重复构建相同客户端版本。

本地测试：

```bash
node scripts/test-app-update-policy.cjs
node scripts/test-ios-113-policy-deploy.cjs
node scripts/test-api-workflows.js
```
