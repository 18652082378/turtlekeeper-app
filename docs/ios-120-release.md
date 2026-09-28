# 龟友手账 iOS 1.1.2（120）

用户于 2026-09-28 授权将当前修复版本准备为 **1.1.2（120）**。Bundle ID 为 `com.turtlekeeper.app`，安装名称为“龟友手账”。`package.json`、锁文件、Xcode Debug/Release 和客户端构建号一致。

本次包含当前已验收的界面一致性、返回及滚动恢复、养护与同步可靠性、成长记录删除竞态修复，以及视频缓存插件注册、原生隐私清单和发布资源完整性校验。完整范围和边界见 `docs/postlaunch-comprehensive-audit-20260928.md` 与 `docs/release-acceptance-20260928.md`。

## 本地构建

在项目根目录执行：

```powershell
npm.cmd ci
npm.cmd run cap:sync:ios
node scripts/verify-ios-build.js
node scripts/verify-ios-build.js --native
node scripts/test-ios-release-readiness.cjs
node scripts/package-ios-source.cjs --check
node scripts/package-ios-source.cjs
```

打包脚本需要可运行的 Python 3。若不在 PATH，可先设置 `$env:PYTHON` 为本机 `python.exe` 的完整路径。包名为 `output/turtlekeeper-ios-1.1.2-build-120-source.zip`，旁边生成逐文件 manifest 和 ZIP SHA256。

源码包排除 `node_modules`、生成的网页与原生 public、数据库、上传文件、备份、环境私密配置与密钥。解压后由 `cap:sync:ios` 重新生成网页和原生资源。不要将整个源码包覆盖到正式服务器；客户端与后端分别发布。

## 提交代码与云构建

当前分支为 `main`。Git Bash 中执行以下命令可按本轮文件清单提交并推送，避开其他平台产物和本机工具目录：

```bash
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app &&
git add --pathspec-from-file=scripts/ios-120-release-files.txt &&
git diff --cached --check &&
git -c gc.auto=0 -c maintenance.auto=false commit -m "Release iOS 1.1.2 build 120" &&
git -c gc.auto=0 -c maintenance.auto=false push origin main
```

提交前可用 `git diff --cached --stat` 查看暂存范围。如果此前手动暂存了其他内容，需先自行核对；本次准备没有执行 git add、commit 或 push。

推送后在已配置的 Codemagic 项目中选择 `main` 和 **`ios-testflight`** 工作流运行。该工作流使用配置的 App Store Connect 集成签名、生成 IPA 并上传 TestFlight；不会自动提交正式 App Store 审核。GitHub 的 `ios-check` 仅为未签名模拟器构建，不能替代 IPA。

## 验收状态

本地资源准备与回归结果记录于 `output/release-120/`。前一轮专用账号正式 API 的31项断言通过，但该结果不是120真机运行证明。本次版本准备没有部署服务器，没有变更正式最低支持版本或停用119。

Windows 不能完成 Xcode 编译/签名。本次交付为构建源码包，不能声称已生成或上传120的签名 IPA。TestFlight 包仍需在 iPhone 验证保存后杀进程重进、离线恢复、设备切换、手势/键盘与原生插件，再提交正式审核。
