# iOS 1.1.0（116）：修正图标

115 已在苹果后台出现，图标修改使用构建号 116；市场版本保持 1.1.0。

Xcode AppIcon 资源已经换为此前用户确认的“龟中介”图片，导出为 1024×1024 RGB PNG，无透明通道。桌面名称保持“龟友手账”。新增构建校验直接核对 Xcode 引用的图标文件及其 SHA256，避免误把安卓图片视为苹果图标。

本地同步与资源校验完成不代表云端签名 IPA 已生成。Windows 不执行 Xcode 编译；继续沿用 Git Bash 上传及 Codemagic 构建。

在 Git Bash 执行：

```bash
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app &&
node scripts/verify-ios-build.js --native &&
mapfile -t files < <(node -e "console.log(require('./scripts/ios-116-release-files.json').join('\n'))") &&
git add -- "${files[@]}" &&
git -c gc.auto=0 -c maintenance.auto=false commit --only -m "Fix iOS icon: release 1.1.0 build 116" -- "${files[@]}" &&
git -c gc.auto=0 -c maintenance.auto=false push origin main
```

随后在 Codemagic 的 main 分支运行 ios-testflight。处理完成后，在 App Store Connect 中选择 1.1.0（116）并核对图标，再由用户提交审核。115 不会随本地改动自动变更。
