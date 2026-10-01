# 龟友手账 iOS 1.1.2（121）

2026-10-01按用户要求将当前客户端准备为1.1.2（121）。主App与TurtleNotificationService扩展的Debug/Release构建号均为121；客户端配置与同步后的网页资源必须一致。Bundle ID分别为`com.turtlekeeper.app`和`com.turtlekeeper.app.NotificationService`。

本次包含短距离边缘返回手势、返回过程与页面恢复的现有修复，以及管理员选定帖子的推荐确认、真实通知标题和配图附件扩展。iOS通知附件下载失败时保留标题和文字。构建121必须同时包含扩展源文件、Xcode嵌入与依赖关系、隐私清单和验证脚本。

## 本地准备

在Git Bash的项目根目录执行：

```bash
npm run cap:sync:ios
node scripts/verify-ios-build.js --native
node scripts/test-ios-release-readiness.cjs
node scripts/package-ios-source.cjs --check
```

完整源码包为`output/turtlekeeper-ios-1.1.2-build-121-source.zip`。打包使用`node scripts/package-ios-source.cjs`，Python不在PATH时需设置`PYTHON`。包内逐文件校验清单与旁边ZIP的SHA256可核对源文件；生成资源由云构建重新同步。源码包不是签名IPA。

## Git与Codemagic

`scripts/ios-121-release-files.txt`列出本次客户端及相关回归代码。仅提交这份清单内的文件，避免其他平台工具或本机输出进入发布提交。不要将整个最新服务器源码直接覆盖正式服务器；此次服务端定向补丁已经单独安装。

```bash
git add --pathspec-from-file=scripts/ios-121-release-files.txt
git diff --cached --check
git -c gc.auto=0 -c maintenance.auto=false commit --only -m "Release iOS 1.1.2 build 121" --pathspec-from-file=scripts/ios-121-release-files.txt
git -c gc.auto=0 -c maintenance.auto=false push origin main
```

提交通过`--only --pathspec-from-file`限定清单，保留此前暂存的其他文件。推送后在Codemagic选`main`与`ios-testflight`工作流运行，生成签名IPA并上传TestFlight。正式App Store审核由用户在App Store Connect提交。

Codemagic需提供主App和`com.turtlekeeper.app.NotificationService`扩展各自匹配的App Store签名描述文件；只配置主App描述文件可能导致扩展签名失败。

## 验证边界

用户本次服务器截图已显示community-recommendation-v3补丁校验、代码核对、备份与安装成功，意味着服务端已安装管理员审核覆盖关键词、选定帖子标题与配图载荷逻辑。它不证明真实APNs送达、图片显示或iPhone跳转成功。

Windows本地仅验证资源、版本、工程配置及模拟浏览器/接口回归，不能执行Xcode编译签名。121签名IPA仍待Codemagic构建，TestFlight仍需验收短手势返回、系统通知标题、图片、点击跳转及保存后重进。没有修改正式最低支持构建号或当前App Store升级提示。
