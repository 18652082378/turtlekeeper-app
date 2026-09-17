# iOS 1.0.9（112）完整更新 V15

包含孵化完成标识、确认孵化、保存返回立即更新、团队会员首屏购买，以及每次冷启动和后台返回显示开屏。保留 2 秒自动关闭、跳过及通知/分享直接跳转。系统弹窗的临时失焦不重复触发开屏。

## 本地 Git Bash

```bash
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app &&
mapfile -t files < <(node -e "console.log(require('./scripts/ios-iap-release-files.json').join('\n'))") &&
git add -- "${files[@]}" &&
git -c gc.auto=0 -c maintenance.auto=false commit --only -m "Release 1.0.9 build 112: show intro on each app entry" -- "${files[@]}" &&
git -c gc.auto=0 -c maintenance.auto=false push origin main
```

仅提交发布清单中的文件，排除独立 MySQL 修改。Codemagic 选择 main 和 ios-testflight，编译、签名并上传 1.0.9（112）。本地已经同步 iOS 资源并校验版本，但没有生成签名 IPA。

## 服务器 Workbench 终端

上传 output/turtlekeeper-ios-112-v15.tar.gz 到服务器 /tmp/，执行：

```bash
cd /tmp &&
tar -xzf turtlekeeper-ios-112-v15.tar.gz &&
node /tmp/turtlekeeper-ios-112-v15/deploy.cjs --check &&
node /tmp/turtlekeeper-ios-112-v15/deploy.cjs --apply
```

V15 包含此前 V11～V14，不需逐个安装或删除旧目录。预检发现未知服务器代码会停止，不要绕过。安装器备份代码、重启并检查 API，失败尝试回退。包内不含服务器配置、数据库、上传文件和苹果私钥，不修改旧版最低版本要求。

服务器包保留线上 config.js；iOS 安装包的构建号由本地 config.js 与 Xcode 工程共同设为 112。新开屏逻辑也已加入服务器静态资源更新。

本次只同步/校验 iOS。浏览器模拟测试不能代替 iPhone 上的正式购买、恢复购买和前后台切换测试。
