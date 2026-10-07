# iOS 1.1.5（128）构建

日期：2026-10-07。版本号保持 1.1.5，网页构建号、客户端及通知扩展的 Debug/Release 构建号统一为 128。本次仅更新构建号，包含已提交的聊天本地缓存、侧滑返回、成长提醒取消与商品详情返回列表的修复。

已有本地记录的聊天立即显示，后台同步新消息；首次在本机打开且没有缓存的会话仍需同步一次。删除会话清除对应缓存，账号之间隔离缓存。

服务器无需补丁，不调整正式最低支持版本。

在 Git Bash 上传，然后在 Codemagic 使用 main 最新提交启动 iOS TestFlight：

```bash
(
set -e
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app
git add --pathspec-from-file=scripts/ios-128-release-files.txt
git diff --cached --check
git -c gc.auto=0 -c maintenance.auto=false commit --only \
  -m "Prepare iOS 1.1.5 build 128" \
  --pathspec-from-file=scripts/ios-128-release-files.txt
git -c gc.auto=0 -c maintenance.auto=false push origin main
)
```

版本调整后同步网页资源并检查 iOS 资源与版本一致性。此前聊天缓存、删除、发送、导航及商品封面已通过 Chrome 和 WebKit 回归测试。Windows 不执行 Xcode 编译、签名或上传；IPA 构建和真机体验仍需 Codemagic 与 iPhone 确认。
