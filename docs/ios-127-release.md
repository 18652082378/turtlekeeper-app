# iOS 1.1.5（127）构建

日期：2026-10-07。版本号保持 1.1.5，网页构建号、客户端及通知扩展的 Debug/Release 构建号统一为 127。包含此前 126 的侧滑返回、成长提醒取消，以及商品详情返回时保留列表、封面、滚动位置和分页的修复。

本次只递增构建号，服务器无需补丁，不调整正式最低支持版本。

在 Git Bash 上传，然后在 Codemagic 使用 main 最新提交启动 iOS TestFlight：

```bash
(
set -e
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app
git add --pathspec-from-file=scripts/ios-127-release-files.txt
git diff --cached --check
git -c gc.auto=0 -c maintenance.auto=false commit --only \
  -m "Prepare iOS 1.1.5 build 127" \
  --pathspec-from-file=scripts/ios-127-release-files.txt
git -c gc.auto=0 -c maintenance.auto=false push origin main
)
```

本地验证网页构建及 iOS 资源、版本一致性。Windows 不执行 Xcode 编译、签名或上传；新构建仍需检查真机商品详情侧滑返回的显示效果。
