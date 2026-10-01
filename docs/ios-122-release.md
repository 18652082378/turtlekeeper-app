# 龟友手账 iOS 1.1.3（122）

2026-10-02：用户提供的 Codemagic 构建 166 发布日志返回 90062：上传包的 CFBundleShortVersionString 为 1.1.2，苹果提示此前已批准的版本也为 1.1.2，新版本必须更高。此前签名检查和 IPA 构建已通过，并生成 App.ipa；这不表示上传或正式发布成功。

当前源码调整为 1.1.3（122）：package.json、锁文件根包版本、主 App 和 TurtleNotificationService 扩展的 Debug/Release 版本及构建号同步更新，config.js 构建号同步为 122。第三方依赖版本保持原值。保留通知图片扩展与签名检查。

本次同时修复龟集市搜索的交互问题：后台刷新保留正在编辑的输入框；从搜索区开始的触摸不能因为后续点击落点变化而触发其他页面导航；品种建议点击保留输入焦点；中文组合输入尚未确认时不提交搜索。详细复现方式和验证边界见 docs/market-search-navigation-fix.md。

## 本地检查与源码包

```bash
npm run cap:sync:ios
node scripts/verify-ios-build.js --native
node scripts/test-ios-release-readiness.cjs
node scripts/test-ios-signing.cjs
node scripts/test-market-search-interactions.cjs
node scripts/package-ios-source.cjs --check
```

源码包为 `output/turtlekeeper-ios-1.1.3-build-122-source.zip`，打包命令为 `node scripts/package-ios-source.cjs`；Python 不在 PATH 时设置 PYTHON。包内 SOURCE-MANIFEST.json 以及 ZIP 旁的 SHA256 校验文件用于核对源码。源码包不是签名 IPA。

## Git、云构建与 App Store

在 Git Bash 的项目目录使用 `scripts/ios-122-release-files.txt` 提交本次发布文件：

```bash
git add --pathspec-from-file=scripts/ios-122-release-files.txt
git diff --cached --check
git -c gc.auto=0 -c maintenance.auto=false commit --only -m "Release iOS 1.1.3 build 122" --pathspec-from-file=scripts/ios-122-release-files.txt
git -c gc.auto=0 -c maintenance.auto=false push origin main
```

推送后选择 Codemagic 的最新 main 提交与 iOS TestFlight 工作流重新运行。沿用已添加的主 App 与通知扩展签名配置；扩展描述文件的添加步骤保留在 docs/ios-121-signing-fix.md。

正式提交审核时，在 App Store Connect 的现有龟友手账 App 内创建 iOS 版本 1.1.3，选取处理完成的 1.1.3（122）构建并填写更新说明。不另建 App 记录。

## 验证边界

本地验证版本一致性、网页资源同步、通知扩展工程结构和模拟签名回归；Windows 无法执行 Xcode 归档签名，也无法证明此次上传通过。122 的真实云构建、App Store Connect 上传处理及 iPhone 验收仍待完成。

龟集市搜索的 14 项回归，以及既有导航生命周期、返回后数据展示回归，已在本地 Chromium 和桌面 WebKit 中通过。触摸、键盘缩放和中文输入事件为模拟，不能代替 iPhone 原生键盘及正式客户端验收。未对正式服务器数据执行任何测试修改。

本次不部署服务器、不变更正式版本支持策略。上传成功后仍需验收通知标题与图片、点击跳转、短边缘返回、保存后重进。
