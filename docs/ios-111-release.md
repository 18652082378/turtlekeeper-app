# iOS 1.0.9（111）完整更新 V14

## 内容

- 繁殖详情分为“孵化完成”和“确认孵化”，仅手动完成的窝计入最终孵化率；列表显示完成标识。
- 保存、完成孵化后返回上一页立即显示新数据；包含此前消息缓存、单账号单会话更新。
- 会员购买套餐位于首屏，成员设置说明折叠；价格继续从 StoreKit 获取。
- 本次只同步与验证 iOS。版本为 1.0.9，构建号为 111。

## 本地 Git Bash

孵化与返回刷新修改已经在本地提交 74b6d82 中。提交这次排版与发布说明后推送 main，即包含之前的修改。不要使用 git add .，工作区还存在独立的 MySQL 修改。

```bash
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app &&
git add -- assets/team-space.js assets/team-space.css scripts/test-team-ui.cjs scripts/package-ios-111-update.cjs scripts/ios-iap-release-files.json docs/ios-111-release.md &&
git -c gc.auto=0 -c maintenance.auto=false commit --only -m "Release 1.0.9 build 111: membership purchase layout and cumulative update" -- assets/team-space.js assets/team-space.css scripts/test-team-ui.cjs scripts/package-ios-111-update.cjs scripts/ios-iap-release-files.json docs/ios-111-release.md &&
git -c gc.auto=0 -c maintenance.auto=false push origin main
```

Codemagic 选择 main 和 ios-testflight。Windows 本地完成资源同步和校验；IPA 编译、签名与上传由云构建完成。若 Apple 已接收过构建 111，不能再次上传同一个构建号，需要另行确定更大的构建号。

## 服务器（阿里云 Workbench 终端）

将 output/turtlekeeper-ios-111-v14.tar.gz 上传到服务器 /tmp/。V14 为累积更新，包含 V11、V12、V13，不需要逐个安装。不要在 Windows Git Bash 执行下面的服务器命令。

```bash
cd /tmp &&
tar -xzf turtlekeeper-ios-111-v14.tar.gz &&
node /tmp/turtlekeeper-ios-111-v14/deploy.cjs --check &&
node /tmp/turtlekeeper-ios-111-v14/deploy.cjs --apply
```

安装器核对已审核代码、备份代码并重启 API，失败尝试恢复。未知服务器代码差异会停止；不要绕过检查。包中不含 .env、用户数据库、上传照片或 .p8 密钥。保留既有服务器配置，未修改旧版最低版本要求。

本地模拟测试不能替代线上健康检查和 iPhone 实机内购测试。正式送审前确认 Apple 商品、版本和服务器均已就绪。
