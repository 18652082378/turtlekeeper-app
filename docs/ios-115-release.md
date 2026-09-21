# iOS 1.1.0（115）

本次为苹果客户端发布准备。Windows 已同步 iOS 网页资源和本地插件；签名 IPA 需由现有 Codemagic 工作流编译生成。本地准备完成不代表云端构建、TestFlight 上传或 App Store 提审完成。

## 内容

- 桌面名称为龟友手账，使用当前已准备的龟中介图标；同步应用内品牌和交易指南图片。
- 交易指南费率为 0.68%，每笔最低 6.8 元。
- 已拥有团队的主账号也能看见、接受或拒绝其他团队邀请。
- 团队十个模块顶部显示当前龟场；关联多个龟场时点击名称可切换。
- iOS 团队会员保持 Apple 订阅，原月度/年度商品 ID 不变；不显示安卓支付宝购买入口。
- 使用平台独立的更新入口。此次不调整服务器最低支持版本，不部署服务器、不构建安卓。

## 上传源码并构建

在本项目的 PowerShell 终端执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\publish-ios-115.ps1
```

脚本先同步、校验 1.1.0（115），再仅提交 `scripts/ios-115-release-files.json` 清单中的客户端文件并推送 `origin/main`。不提交当前工作区的服务器、数据库和安卓改动。仅检查时在命令末尾加 `-CheckOnly`。

推送成功后在 Codemagic 选择 `main` 分支、`ios-testflight` 工作流并开始构建。现有工作流会生成签名 IPA 并上传 TestFlight。构建日志应显示 `Verified iOS 1.1.0 (115)`。

待苹果处理完成后，在 App Store Connect 的 1.1.0 版本中选择构建 115，再由用户提交审核。不要重复上传已经被苹果接收的同一构建号。

## 本地验证范围

版本号、构建号、原生资源同步、StoreKit 插件、团队邀请/切换/权限、日期请求竞争、团队繁殖、平台更新入口、iOS/Android 付款入口隔离已通过本地检查。付款入口验证使用模拟支付，不代表新增了一次真实购买或退款测试。
