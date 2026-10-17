# App Store 1.1.5：最低支持构建 132

2026-10-12，用户提供 App Store Connect 截图确认：商店页面的发布版本为 1.1.5（Ready for Distribution），所选安装包 Version 为 1.1.7，Build 为 132。公开中国区 Apple 查询也返回商店版本 1.1.5。因此强制更新按实际安装包构建号 132 判断，提示展示商店版本 1.1.5；不能按原先源码 1.1.5 的 126–128 构建设置边界。

## 目标规则

- iOS minimumBuild=132、latestBuild=132；131 及更低构建必须更新，132 及之后可继续使用。
- 提示：“龟友手账 1.1.5 已正式上线。当前版本已停止支持，请前往 App Store 更新后继续使用。”
- App Store 链接保持 https://apps.apple.com/app/id6783481335。
- 132 是已发布的安装包，尚在测试/审核的 133/134 不作为最低支持构建。
- Android 两通道、网页、Harmony 策略保持原有行为；账号记录、凭据与其他业务模块不修改。

## 当前状态

本地源码和专用安装器已完成并通过验证。生产接口只读检查仍返回 minimumBuild=125、latestBuild=125 和 1.1.4 提示；本地改动不代表生产生效。没有可用的服务器登录连接，需在已登录服务器终端执行安装命令。

## 安装

在本机 Git Bash 运行下面两行，完整的服务器安装命令会复制到剪贴板：

```bash
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app
node scripts/copy-ios-115-policy-command.cjs --clipboard
```

到已登录服务器终端粘贴并回车执行。不需要重新构建客户端。脚本在 /tmp 解包并核对压缩载荷 SHA-256，先运行 --check 再 --apply；只修改已审查的内联版本策略或 app-update-policy.js 模块。未知代码与高于 132 的未来生产策略拒绝安装。服务器代码在 server/backups/ios-115-policy-* 备份，短暂重启唯一运行的 PM2 turtlekeeper-api，安装验证失败恢复旧策略。默认/显式 iOS 接口需返回 132 和 1.1.5 提示，其他平台响应保持安装前一致，匿名账号接口仍返回 401。

成功输出：SUCCESS: iOS builds below 132 stopped; minimumBuild=132, latestBuild=132, update prompt=1.1.5. Other platform policies unchanged.

之后在服务器运行：

```bash
curl -fsS --connect-timeout 5 --max-time 15 'https://api.turtleworld.cn/api/app/version?platform=ios&build=125'
```

预期包含 minimumBuild:132、latestBuild:132 和 1.1.5 提示。用旧手机安装包重新打开软件确认出现更新页；从 App Store 下载到的构建 132 应正常使用。

## 验证

- test-app-update-policy.cjs：旧构建 114–131 必须更新，132/133/134 不被拦截，商店跳转、旧环境不能降低边界、未来更高环境仍可配置及多平台隔离。
- test-ios-115-policy-deploy.cjs：生产内联/模块化策略、CRLF、准确代码拒绝未知修改、压缩载荷校验、只读预检、备份、重复安装、未来策略与匿名认证拒绝、健康失败回滚。
- test-api-workflows.js：隔离真实 HTTP 的更新接口、账号、保存、社区、聊天与商品流程。
- 历史 1.1.4 安装测试改为对照冻结的 app-update-policy-114.js 夹具，保留旧版本验证。

## 源码上传（不重新构建 iOS）

```bash
(
set -e
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app
git add --pathspec-from-file=scripts/ios-115-policy-release-files.txt
if ! git diff --cached --quiet -- $(cat scripts/ios-115-policy-release-files.txt); then
  git -c gc.auto=0 -c maintenance.auto=false commit --only -m "Require build 132 for App Store 1.1.5 update [skip ci]" --pathspec-from-file=scripts/ios-115-policy-release-files.txt
fi
git -c gc.auto=0 -c maintenance.auto=false push origin main
)
```
