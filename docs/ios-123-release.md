# 龟友手账 iOS 1.1.3（123）

2026-10-02。在已提交的 1.1.3（122）搜索修复基础上，修复龟集市偶发不能加载更多的问题。主 App 与通知图片扩展的 Debug/Release 构建号，以及 config.js，同步为 123；版本号保持 1.1.3。

修复请求忙碌时漏掉底部加载触发、请求中返回列表后监听丢失，以及失败后不能在底部重试的情况。保留原有商品、排序和位置；增加上滑、点击与网络恢复重试，避免失败或分页位置异常造成重复自动请求。详情见 docs/market-pagination-recovery.md。

同一未提交构建中，增加指定账号 17302554044 与管理员的出售城市修改权限。发布、编辑出售可手动填写城市，服务器按已认证用户判断；指定账号不增加管理员权限。详情见 docs/market-manual-city.md。本次城市权限功能需要部署服务器补丁，与此前仅客户端的分页修复不同。

本地命令：

```bash
npm run cap:sync:ios
node scripts/verify-ios-build.js --native
node scripts/test-ios-release-readiness.cjs
node scripts/test-feed-loading-recovery.js
node scripts/test-market-ranked-feed.js
node scripts/test-market-pagination-recovery.cjs
node scripts/test-market-back-scroll.js
node scripts/test-market-search-interactions.cjs
node scripts/test-navigation-lifecycle.cjs
node scripts/test-navigation-freshness.cjs
node scripts/test-market-city-ui.cjs
node scripts/test-market-city-deploy.cjs
node scripts/test-api-workflows.js
```

浏览器测试需已安装 Playwright 及对应浏览器；可通过 PLAYWRIGHT_MODULE、BROWSER_EXECUTABLE、BROWSER_ENGINE 和 PLAYWRIGHT_BROWSERS_PATH 配置。Chromium 与桌面 WebKit 验证均属于本地模拟；Windows 原生资源检查不是 Xcode 归档或签名成功证明。123 尚未云构建、上传或在真实 iPhone 上验收。未修改正式数据。

本地结果：两个引擎各 14 项分页恢复、14 项搜索交互和 36 项导航生命周期回归通过，返回后数据展示回归也通过。Chromium 详情返回位置、排序分页、请求超时/失败恢复检查通过；123 的 202 项网页与原生资源一致性及 14 项发布检查通过。正式环境与真实 iPhone 未验证。

Git Bash 在项目目录执行：

```bash
git add --pathspec-from-file=scripts/ios-123-release-files.txt
git diff --cached --check
git -c gc.auto=0 -c maintenance.auto=false commit --only -m "Release iOS 1.1.3 build 123 with market fixes" --pathspec-from-file=scripts/ios-123-release-files.txt
git -c gc.auto=0 -c maintenance.auto=false push origin main
```

随后 Codemagic 选择最新 main 提交，运行 iOS TestFlight 工作流。城市功能需先安装后端补丁：在本地 Git Bash 运行 `node scripts/copy-market-city-server-command.cjs --clipboard`，到服务器终端粘贴并执行。补丁先校验、备份、修改城市校验与调用位置，再重启 API 并检查原有版本策略与匿名认证；失败时回滚。无需公网 IP、手动上传或下载 GitHub Raw；不改正式版本支持策略及数据库内容。仅安装服务器补丁不能使旧客户端城市输入框可编辑，还需更新客户端。
