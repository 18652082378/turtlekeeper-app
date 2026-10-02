# 龟友手账 iOS 1.1.3（124）

2026-10-02。修复删除聊天后会话仍显示、可以打开旧记录，以及重新聊天恢复历史记录的问题。主 App 与通知图片扩展的 Debug/Release 构建号、config.js 同步为 124，版本号保持 1.1.3。

同一尚未提交的构建还修复聊天顶部商品卡的视频缩略图：使用视频首帧封面图片取代不预加载的视频元素，进入卖家聊天时读取 mediaItems 内的封面，缺失或失效时复用 /api/market/video-poster 补生成并复用结果。商品卡本身不下载或播放视频；普通图片和已售出标记保持原样。上传时直接抓取第一帧，不再跳到 0.16 秒。

## 删除行为

确认删除后立即移除会话，清空当前聊天、商品卡、草稿与返回页面缓存。删除期间和删除前发出的旧请求不能把会话恢复；删除失败会恢复这一条会话，并保留其他会话的新变化。切换账号后迟到的删除回复不能修改新账号。

服务器按参与人清空聊天副本，包括文字、图片、视频和商品卡。删除后重新聊天仅向删除者返回新消息，对方保留其副本；双方均删除后移除共享消息记录。附件文件不直接删除，因为对方可能仍需访问。删除状态由服务器维护，旧设备上传账号数据不能恢复已删记录。旧版本只隐藏会话的删除状态，在下一次打开该聊天或发送新消息时升级为清空历史记录。

API 在持久化完成后才返回删除成功。列表、未读和聊天接口返回清空版本与隐藏状态，新客户端可同步另一设备的删除并清空已打开的旧聊天。旧客户端的本地界面缓存问题仍需安装 124 才能完整修复。

## 本地验证

使用隔离测试账号、临时数据目录与模拟浏览器接口；未修改正式数据。修复前 5 项界面复现全部失败；修复后 Chromium 与桌面 WebKit 各 12 项通过，覆盖立即删除、迟到回复、失败恢复、账号切换、登录凭证更新、再次聊天、跨设备清空、返回缓存、取消删除和迟到发送回复。

真实本地 HTTP 接口：JSON 存储 13 项通过，records 存储的事务驱动替身 14 项通过，包括重启持久化、旧账号上传不能复活历史、各类消息清空、对方副本保留、双方删除、旧删除状态升级和提交失败不返回成功。事务驱动替身不是真实 MySQL 验收。

部署补丁测试覆盖精确源码匹配、重复安装、CRLF、未知代码拒绝、剪贴板载荷校验、只读检查、备份、健康检查失败回滚，以及不改数据库、推荐推送模块和原有版本支持策略。完整 API 工作流与现有城市/单商品统计补丁回归通过。

聊天缓存与账号隔离、返回后的数据更新检查通过；WebKit 的 36 项导航生命周期回归通过。124 的 202 项资源一致性和 14 项发布检查通过。云端归档、正式服务器认证测试和真实 iPhone 尚未验收。

商品卡封面 Chromium/WebKit 各 8 项通过，覆盖已有封面、初次聊天、仅 mediaItems 的旧快照、缺失/坏封面修复、重绘复用、迟到修复、失败重试边界与普通图片/已售出行为。使用首帧红色、后续蓝色的真实视频，验证服务器与 Chromium 本地上传封面都取红色首帧。现有视频封面服务与 100 次重绘缓存检查通过。封面修复复用已有后端接口，本次没有额外封面服务器补丁；前述聊天删除仍需部署服务器改动。

运行命令：

```bash
node scripts/test-chat-delete-deploy.cjs
node scripts/test-chat-delete-api.cjs
CHAT_DELETE_RECORDS=1 node scripts/test-chat-delete-api.cjs
node scripts/test-chat-delete-ui.cjs
BROWSER_ENGINE=webkit node scripts/test-chat-delete-ui.cjs
node scripts/test-chat-product-cover-ui.cjs
BROWSER_ENGINE=webkit node scripts/test-chat-product-cover-ui.cjs
node scripts/test-chat-product-first-frame.cjs
node scripts/test-video-poster.js
node scripts/test-market-poster-repair.js
node scripts/test-message-cache-ui.cjs
node scripts/test-navigation-freshness.cjs
node scripts/test-navigation-lifecycle.cjs
node scripts/test-api-workflows.js
npm run cap:sync:ios
node scripts/verify-ios-build.js --native
node scripts/test-ios-release-readiness.cjs
```

浏览器测试需 Playwright 及对应浏览器，可配置 NODE_PATH、PLAYWRIGHT_MODULE、BROWSER_EXECUTABLE、BROWSER_ENGINE 和 PLAYWRIGHT_BROWSERS_PATH。Windows 原生资源一致性检查不是 Xcode 归档、签名、上传或 iPhone 实机验收。

## 发布命令

在本地 Git Bash 中执行：

```bash
(
set -e
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app
git add --pathspec-from-file=scripts/ios-124-release-files.txt
git diff --cached --check
git -c gc.auto=0 -c maintenance.auto=false commit --only -m "Fix chat deletion and video covers for iOS 1.1.3 build 124" --pathspec-from-file=scripts/ios-124-release-files.txt
git -c gc.auto=0 -c maintenance.auto=false push origin main
node scripts/copy-chat-delete-server-command.cjs --clipboard
)
```

最后一条命令会把完整服务器安装命令复制到剪贴板。在已经登录的 Linux 服务器终端粘贴执行即可，不需要 IP、手动传文件或访问 GitHub Raw。安装程序只更新指定聊天函数，备份 server.js，重启 turtlekeeper-api，验证匿名认证与版本策略；失败会尝试恢复原源码并验证 API。它不批量清空历史记录，实际清空由用户删除或上述旧状态升级触发。

先部署后端，再在 Codemagic 对最新 main 运行 iOS TestFlight。正式账号和真实 iPhone 仍需验收：打开有文字/媒体/商品卡的聊天，返回列表左滑删除，确认后行立即消失；重启与重新登录保持消失；重新发送消息只见新记录；对方旧记录仍在；断网删除失败提示并恢复会话。
