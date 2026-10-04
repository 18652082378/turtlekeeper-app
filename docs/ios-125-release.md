# iOS 1.1.4（125）：聊天发送、返回及龟集市切换修复

日期：2026-10-05。源码和本地验证已完成，尚未执行 Git 推送、正式服务器部署、Xcode 编译或 App Store 发布。

## 行为变化

- 修复新增数据页手势返回弹出未保存提示后，点击 OK 仍留在新增页的问题。先结束手势并恢复表单位置，再提示确认；同意后直接返回一次，取消保留字段和返回栈。避免原生提示关闭后的失焦/尺寸变化取消尚未完成的返回动画。
- 修复从其他底部模块切回龟集市时，先显示本地排序、再切换为服务器推荐排序而闪动的问题。切换模块保留当前推荐会话、商品顺序和已加载分页；首次进入仍加载，下拉刷新、搜索、筛选及发布后仍更新商品。
- 文字发送在等待响应时显示“发送中…”，同一会话连续点发送或按键盘发送只产生一个请求；完成后可继续发送。等待期间新输入的草稿不会被上一条消息的回执清空。
- 聊天发送、读取和撤回请求有 15 秒超时。发送超时保留草稿和本地请求标识；重试相同内容复用标识，服务端不重复保存或推送。正常完成后再次发送相同文字使用新标识，保留用户有意重复的消息。
- 服务端每个发送者保留最多 500 个请求回执，新插入时移除超过 7 天的回执；回执仅记录内容指纹及时间。服务重启后仍能识别重试，双方删除历史后重试也不能恢复已删除消息。
- 右滑方向确认后，聊天页保持手势所有权；手指随后偏向上下方向不会重新改判为滚动。只有返回手势已接管时才阻止原生上下滚动，普通竖向滚动、缩放和输入框交互保留。
- 聊天数据刷新延迟到返回拖动及动画结束后更新 DOM，避免刷新取消手势、页面抖动。取消或中断返回后恢复输入栏位置并显示期间到达的新消息。
- 增加 `TurtleEdgeBackPlugin`：iOS 聊天页使用原生左边缘手势；滚动手势等待边缘返回先判定。左边缘收到触摸时立即停止惯性滚动，原生手势识别后冻结纵向滚动并将拖动、速度、结束和取消交给现有页面返回动画。普通竖向滚动、输入区域、弹窗、其他页面和缩放保留原有交互。拖动中不重新配置原生手势，路由代次隔离防止迟到事件误退出新页面。

历史重复消息不会批量删除，因为同文消息可能是用户有意发送。老客户端未传 clientMessageId 时保留原协议；文字发送防重需要部署本次服务器补丁并安装本次客户端。媒体接口可接受该标识，但本次客户端改动集中于文字发送。

## 本地验证

- `node scripts/test-market-pagination-recovery.cjs`：Chromium 和桌面 WebKit 各 19 项通过。新增切回后顺序及 DOM 稳定、详情缓存不混入推荐、重复切换无重置请求、已加载分页及游标保留、主动下拉刷新和首次进入加载验证。修改前复现 3 项失败，修改后通过；包含原有 14 项分页及网络恢复验证。桌面 WebKit 不代表 iPhone 真机验收。
- `node scripts/test-chat-send-idempotency-api.cjs`：7 项真实 HTTP、隔离 JSON 存储测试，包括 20 个并发重试、服务重启、冲突标识、不同发送者和双方删除后的旧请求。
- `$env:CHAT_SEND_RECORDS='1'; node scripts/test-chat-send-idempotency-api.cjs`：8 项记录存储驱动替身测试，额外验证事务失败不成功应答、不持久化；不代表真实 MySQL 验收。
- `node scripts/test-chat-send-gesture-ui.cjs`：Chromium 20 项、桌面 WebKit 19 项。覆盖连按发送、失败重试身份、超时释放锁、草稿保留、账户切换、聊天刷新期间拖动/动画、反向取消、竖向滚动及中断清理。Chromium 额外通过 CDP 触摸模拟验证斜向滑动与刷新同时发生时能返回。新增 7 项原生桥接模拟，包括接管旧指针、短滑速度、取消、DOM 取消隔离、弹窗禁用、旧路由事件及桥接不可用时的网页回退；这些不代表在真机执行了 UIKit。
- `node scripts/test-navigation-lifecycle.cjs`：Chromium 和桌面 WebKit 完整导航回归各 41 项通过，包括短滑、取消、键盘、旋转及 49 个已注册页面的路由与滚动恢复。新增 5 项未保存确认测试，包含新增龟档案、养护表单、同意返回、取消后保留草稿及再次返回，模拟原生提示关闭时延迟到达的失焦/尺寸变化；修改前其中 3 项复现失败，修改后通过。桌面模拟不代表 iPhone 真机验收。
- `node scripts/test-chat-delete-ui.cjs`：12 项通过；`node scripts/test-chat-product-cover-ui.cjs`：8 项通过；`node scripts/test-chat-delete-api.cjs`：13 项通过。
- 聊天发送、聊天删除和城市权限部署脚本测试通过：代码匹配检查、重复执行、未知源码拒绝、CRLF、载荷校验、只读预检、备份、更新策略保留和失败回滚。发送补丁同时验证兼容尚未安装旧聊天删除补丁的已审查服务器函数。
- `npm run cap:sync:ios` 已同步；`node scripts/verify-ios-build.js --native` 通过：1.1.4（125），202 个一致资源、149 张品种图片、5 个本地插件。发布就绪回归 16 项通过，包含新增插件的注册及实际 Xcode Sources 阶段检查；语法及 `git diff --check` 通过。

这些均为本机验证。没有发送正式用户消息、删除正式聊天或调整生产数据库。

## 上传 Git

在本机 Git Bash 完整执行：

```bash
(
set -e
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app
git add --pathspec-from-file=scripts/ios-125-release-files.txt
git diff --cached --check
git -c gc.auto=0 -c maintenance.auto=false commit --only -m "Fix chat retries, swipe back and market tab flash for iOS 1.1.4 build 125" --pathspec-from-file=scripts/ios-125-release-files.txt
git -c gc.auto=0 -c maintenance.auto=false push origin main
node scripts/copy-chat-send-server-command.cjs --clipboard
)
```

提交列表只包含本次源码、版本、测试、文档及部署辅助脚本，避免上传其他输出、依赖或临时文件。不要使用 `git add .`。

## 服务器

上述最后一行将完整服务器补丁命令复制到剪贴板。在已登录的服务器终端粘贴执行，无需公网 IP、手动上传或服务器访问 GitHub。独立补丁以 gzip/Base64 传递并校验 SHA-256，依次执行只读 `--check` 和 `--apply`。

服务器要求 `/www/turtlekeeper-app/server/server.js` 和唯一运行的 PM2 `turtlekeeper-api` 进程。未知函数版本、符号链接或进程配置会拒绝安装。安装前备份到 `server/backups/chat-send-recovery-*`，原子替换代码后短暂重启 API；健康或版本策略检查失败时恢复原代码。脚本不改数据库、环境配置或已有推荐/媒体模块。

看到 `SUCCESS: chat send retry protection installed` 后，再去 Codemagic 用最新 main 启动 iOS TestFlight 构建。App 与通知扩展均为 1.1.4（125）。当前正式更新策略仍保持 1.1.3、最低 122、最新 124；新版本尚未发布前不提高最低版本。

## iPhone 验收

在新增龟档案和养护表单填写一个字段后右滑返回，点 OK 应返回上一层，点 Cancel 应保留当前输入且页面位置恢复正常；取消后再次右滑点 OK 也应成功。与左上角返回按钮的确认行为一致。

多次在龟友圈、账本与龟集市间切换：首屏商品顺序不应先跳到其他缓存商品，再换回推荐商品；已加载的第二页应仍存在，继续上滑应从原游标加载。下拉刷新、搜索、筛选和发布后仍能查看新的结果。

安装新构建后用测试账号验证：弱网连续按发送只能收到一条；超时后重试仍只一条；正常发送完成后再次发送相同文字能收到两条。聊天消息到达/刷新时，从左边缘短距离右滑，包含键盘打开、长聊天、关联商品、斜向移动和反向回弹。特别验证快速上滑后，在纵向惯性滚动仍进行时立即从左边缘右滑，不先点屏幕停止滚动；页面应立即跟手并仅返回一层。验证页面不抖动、普通上下滚动、取消后的继续滚动及再次进入聊天正常。Windows 本机无法编译 UIKit，需要 GitHub 的 macOS 编译检查和 Codemagic 构建通过后实测。

服务端部署及匿名健康检查不能代替这些双账号、真实网络和真机交互验收。
