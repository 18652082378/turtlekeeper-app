# 全应用 UI 检查范围

检查入口：`scripts/test-ui-consistency.cjs`。它直接读取 `app.js` 的 `render()` 路由映射，当前发现 **49 个路由**；新增路由会自动进入检查，避免只测几个主页面后声称覆盖全应用。

所有页面使用 `scripts/ui-audit-fixture.cjs` 的虚构数据。浏览器请求被拦截，本地资源直接从工作区读取，API 由测试返回固定响应；外部域名请求全部阻断。没有使用正式账号、正式数据库或真实用户数据。

## 页面清单

| 模块 | 路由 |
|---|---|
| 看板、档案、成长 | `home`、`list`、`growth`、`turtleDetail`、`turtleReward`、`add` |
| 品种 | `species`、`breeds` |
| 养护与提醒 | `memos`，额外覆盖养护列表、养护表单、提醒列表、提醒表单 |
| 繁殖与龟池 | `breeding`、`breedingAdd`、`breedingDetail`、`pools`、`poolAdd` |
| 账本 | `ledger`、`ledgerDetail`，额外覆盖收购、售出、损耗、日常支出表单 |
| 龟集市 | `market`、`marketAdd`、`marketDetail`、`marketSeller`、`marketMy`、`marketFavorites`、`marketHistory` |
| 龟友圈 | `community`、`communityPostDetail`、`communityAdd`、`following`、`followingProfile`、`communityProfile` |
| 消息 | `messages`、`communityActivity`、`communityFriends`、`communityChat` |
| 我的空间与账户 | `mine`、`account`、`sync`、`reports`、`calendar`、`about` |
| 反馈、评分与政策 | `satisfaction`、`feedback`、`feedbackAdd`、`feedbackDetail`、`rules`、`privacy` |
| 管理入口 | `moderation`、`announcements`、`operations`，额外覆盖增长、集市、反馈、安全、服务、聊天标签 |
| 团队 | `team`，额外覆盖概览、账本、报表、孵化、护理、任务、成员、记录、审批、设置的功能预览 |

## 自动检查内容

- 320、390、430、1280 像素宽度，浅色和深色主题。
- 49 个基础路由及 44 个表单、空列表、错误、团队预览和强制更新状态，共 93 个页面状态。
- 页面成功渲染、浏览器运行异常、文档横向溢出、可见底栏位于视口底部。
- 表单是否有可访问名称、图标按钮是否有名称，记录尺寸过小的点击目标供人工复核。
- 选择品种与档案弹窗：搜索、结果数量、关闭、弹窗语义及视口边界。
- 客服、平台客服、商品菜单、聊天菜单、账号注销、成交确认、图片预览、帖子可见范围、协议确认、评分邀请、系统公告、交易指南买方/卖方/完整条款：弹窗边界、名称、初始焦点、Tab 和 Shift+Tab 焦点限制及关闭；协议确认另查 Escape 不会绕过必选步骤。
- 集市、龟友圈真实浏览器请求由测试延迟，返回模拟 503，点击“重新加载”，再返回虚构内容；确认加载提示、失败提示和恢复。此处测试的是本地前端处理模拟响应的能力。

报告写到 `output/ui-consistency/report.json` 和 `report.md`，每个宽度/主题/页面状态各一行，不能将某个页面的通过结果代替其他页面。390 像素下每个状态保留截图，其他宽度在失败时保留截图。`output/ui-consistency/index.html` 可按页面与主题浏览截图。原始基线报告与关键截图保留于 `output/ui-consistency/baseline`。

## 运行方式

```powershell
$env:PLAYWRIGHT_MODULE='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:BROWSER_EXECUTABLE='C:/Program Files/Google/Chrome/Application/chrome.exe'
node scripts/test-ui-consistency.cjs
```

可用 `UI_AUDIT_ROUTES`（逗号分隔状态名）、`UI_AUDIT_WIDTHS`、`UI_AUDIT_THEMES` 缩小排查范围。默认将无可访问名称的表单字段作为失败；仅采集旧界面基线时可指定 `UI_AUDIT_STRICT_NAMES=0`。`UI_AUDIT_SCREENSHOTS=all` 保留全部宽度的截图。

2026-09-28 本地完整执行结果：**880 个场景通过，0 个渲染/几何/焦点检查失败，0 个缺少名称的表单字段，0 个无名称的可见操作控件**。其中 744 个是页面状态与宽度/主题的组合，8 个是档案选择器场景，112 个是公共弹窗场景，16 个是模拟接口加载/失败/重试场景。该数量是检查组合数量，不代表 880 个不同功能。

同日全面复查时纠正了状态覆盖：集市、社区和消息错误页现在使用独立的合成云配置，显式核对错误提示或重试控件；不再把本地离线模式下的空态当成云端失败页。消息空态会同时清空合成聊天缓存。账本表单截图滚动到真实表单。修正后完整 880 场景重新通过；28 项共享交互回归及 14 项 320px 长文本/大列表/错误表单附加检查也通过，详见 `docs/ui-reinspection-20260928.md`。

## 独立验证与边界

此测试主要验证**本地页面呈现与公共交互**，不是全应用所有业务分支的证明。

- 真正的返回/手势取消、滚动恢复、键盘视口变化：由导航专项测试验证，不能从静态路由渲染结果推断。
- 本矩阵的团队页面只覆盖功能预览；本次另行执行 `scripts/test-team-ui.cjs`，40 个场景通过，使用隔离的本地 API 检查已开通会员的权限工作区。两者都不代表生产环境或真机验证。
- 支付、系统相册/相机、通知权限、原生分享、真实视频解码和系统键盘没有在本脚本中通过真实设备操作。
- 浏览器缩放、屏幕阅读器、真实 iPhone 安全区和不同 iOS 版本上的交互，需要真机复核。
- 自动检查未对全部文字、图片和叠层执行完整的颜色对比度认证；点击目标列表属于复核线索。
- 本地工作区截图不是 App Store 已发布客户端截图。本脚本不构建签名包，不部署服务器，也不声称正式环境 UI 已更新。
