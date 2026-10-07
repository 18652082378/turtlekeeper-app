# iOS 1.1.5（127）构建

日期：2026-10-07。版本号保持 1.1.5，网页构建号、客户端及通知扩展的 Debug/Release 构建号统一为 127。包含此前 126 的侧滑返回、成长提醒取消，以及商品详情返回时保留列表、封面、滚动位置和分页的修复。

聊天打开先显示本地记录、后台同步：按账号与联系人分别保存最近会话，返回、切换联系人及重开 App 后可直接显示已有消息与商品卡片；相同同步结果保留聊天页节点、输入草稿和工具栏。缓存最多 40 个会话，每个最多 200 条近期消息，总序列化内容限制为 100 万字符。缓存只包含服务端确认的记录，不写入账号云备份；首次尚无本地记录的会话仍需同步一次，完整历史保留在服务端。

删除会话立即清除对应缓存，删除失败可恢复；跨设备清除版本变化会使旧缓存失效，退出账号删除该账号的聊天设备缓存。快速切换联系人时，旧响应只更新自己的会话缓存，不能覆盖当前聊天或释放新请求的锁。相同消息 ID 的撤回状态变化也会更新。

服务器无需补丁，不调整正式最低支持版本。消息已读仅在用户主动打开会话时按原接口同步，本次没有增加后台批量拉取并标记已读的行为。

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

本地验证聊天缓存与并发、删除、发送与侧滑返回、商品视频封面，以及网页构建与 iOS 资源、版本一致性。Windows 不执行 Xcode 编译、签名或上传；新构建仍需真机检查聊天首次同步、已有会话快速切换、重开 App、删除后再次聊天和商品详情侧滑返回的显示效果。
