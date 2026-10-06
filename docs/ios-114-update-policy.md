# 1.1.4 正式上线后停止支持 1.1.3

2026-10-06，用户确认 1.1.4（125）正式上线并要求停止支持 1.1.3。最低支持构建与最新发布构建均设置为 125，构建 122、123、124 和更早版本需更新；125 及以后继续使用。

更新提示：“龟友手账 1.1.4 已正式上线。1.1.3 及更早版本已停止支持，请前往 App Store 更新后继续使用。”按钮继续打开 https://apps.apple.com/app/id6783481335。

本次只调整服务器 iOS 更新策略，不重新构建客户端。旧环境的较低构建号不会降低发布边界，未来较高环境配置仍保留。部署前发现高于 125 的已生效策略则拒绝安装，避免覆盖未来发布。

本次正式接口只读检查仍返回 minimumBuild=122、latestBuild=124 及 1.1.3 提示。生成补丁不表示已经在生产生效；须执行服务器命令并验证正式接口。

部署器兼容生产内联的已审查 1.1.3 handleAppVersion 函数和源码中的 app-update-policy.js 模块。只修改对应策略文件，备份后原子替换并短暂重启唯一运行的 PM2 turtlekeeper-api。默认 iOS 和构建 124/125 显式请求必须返回新策略；Android 两通道、网页、Harmony 响应与安装前一致，匿名账号接口仍拒绝访问。安装或健康验证失败尝试恢复原文件并验证旧策略。账号、聊天、商品、推荐模块及环境变量不修改。

本地验证已通过：客户端构建 114–124 显示强制更新、125/126 可继续使用、商店链接、Android 通道隔离；内联及模块化部署、CRLF、未知源码拒绝、载荷和校验和、只读检查、备份、重复安装、未来策略拒绝、匿名认证预检拒绝和健康失败回滚；隔离真实 HTTP 的完整 API 工作流回归。旧 1.1.3 部署测试改用冻结夹具，保留其历史验证而不与新的发布策略混淆。

## 本机 Git Bash

```bash
(
set -e
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app
git add --pathspec-from-file=scripts/ios-114-policy-release-files.txt
git diff --cached --check
git -c gc.auto=0 -c maintenance.auto=false commit --only -m "Require iOS 1.1.4 update for older versions [skip ci]" --pathspec-from-file=scripts/ios-114-policy-release-files.txt
git -c gc.auto=0 -c maintenance.auto=false push origin main
node scripts/copy-ios-114-policy-command.cjs --clipboard
)
```

最后一条将完整服务器安装命令复制到剪贴板。在已登录服务器终端粘贴执行，无需公网 IP、手工上传或 GitHub Raw 下载。若此次 Git 上传已完成，只需执行生成命令，不重复提交。

看到 `SUCCESS: iOS 1.1.3 and earlier stopped; minimumBuild=125, latestBuild=125, update prompt=1.1.4.` 后，在服务器检查：

```bash
curl -fsS --connect-timeout 5 --max-time 15 'https://api.turtleworld.cn/api/app/version?platform=ios&build=124'
```

应返回 minimumBuild=125、latestBuild=125 及 1.1.4 提示。旧 1.1.3 手机客户端重新打开 App，确认显示更新页面并能跳转 App Store；1.1.4（125）应正常使用。没有在本机完成正式服务器写入或真实 iPhone 验收。
