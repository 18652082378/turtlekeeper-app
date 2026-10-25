# 手机评论输入与键盘调整（2026-10-25）

根据用户提供的手机截图及 31 秒录屏，对照录屏后段微信的输入栏行为调整龟友圈帖子详情。保留龟友圈原有功能与配色；没有加入不具备实际功能的语音、表情按钮。

## 改动

- 输入栏在键盘展开时仅保留 8px 下边距，收起时恢复底部安全区。修复社区专用 CSS 覆盖原键盘规则、造成安全区留白重复保留的问题。
- 接入官方 `@capacitor/keyboard` 8.0.0，iOS 固定使用 `native` 调整 WebView 高度。网页只补偿仍然被遮住的区域，避免重复上移；移除旧 document 高度造成的重复补偿。
- 在帖子详情和私信隐藏 iOS 的上一项／下一项／完成工具栏，离开时恢复。调用串行处理，避免快速切页时旧调用覆盖新页面。
- 上下拖动帖子或评论超过 12px 且以纵向移动为主时收起键盘，保留草稿和回复对象。不拦截默认滚动，不响应轻触、横滑、双指操作、程序滚动或输入框内部的拖动。
- 点选／取消回复对象时更新原输入栏，保留输入框 DOM、草稿和光标，不再重绘整页或对固定输入栏调用 `scrollIntoView`。
- 压缩回复对象提示与取消按钮，取消外层双重焦点框，以输入框边线表示焦点。保留 16px 输入字号及 44px 输入／发送控件高度。
- 根据输入栏的实际高度预留正文底部空间，避免回复对象行及安全区叠加后遮住最后一条评论。
- 安卓沿用现有 `TurtleAndroidWindow` 的键盘控制，官方 Keyboard 插件不加入安卓插件白名单。

## 本机检查与发布边界

已在 Windows 上以打包资源、合成帖子和拦截请求检查：iOS/WebKit 与 Android/Chromium 的评论交互、窄屏与深色布局，以及原有评论失败重试、重复提交和账号隔离行为。测试包含模拟键盘状态、WebView 缩小、滞后的 document 高度、34px 安全区、上下拖动及草稿恢复。

原生同步后核验 iOS 的 `KeyboardPlugin` 注册、Swift Package 链接、native resize 配置及两端共享资源。浏览器测试不能验证 iOS 原生工具栏或真实键盘动画。

本轮通过的检查：iOS/WebKit 18 组评论交互与 40 项布局，Android/Chromium 17 组评论交互与 40 项布局，两端各 280 项表单布局；导航生命周期、键盘几何单元检查、两端 220 项资源一致性、iOS 原生包资源与插件配置检查。评论测试报告为 `output/community-mobile-ui-ios-webkit.json` 与 `output/community-mobile-ui-android.json`，紧凑输入栏模拟截图为 `output/community-mobile-ui/{ios,android}/comment-keyboard-compact.png`。

本次没有上传服务器、推送 GitHub、编译签名或发布安装包。原生键盘插件需要重新构建并安装 iOS App，仅更新服务器无法带入插件。发布前需使用真机验证苹果及安卓的系统／第三方输入法、输入联想、横竖屏、滑动收起、重新唤起和发送行为；如 137 已上传 App Store Connect，应使用新的构建号。本次保留当前源码版本号。

```bash
npm ci
npm run cap:sync:ios
node scripts/verify-ios-build.js --native
```

以上源码准备命令可在 Git Bash／CMD 运行；iOS 编译签名仍需 Codemagic／macOS。
