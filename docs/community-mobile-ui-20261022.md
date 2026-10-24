# 龟友圈手机端优化（2026-10-22）

2026-10-24 后续互动改进、两周运营安排与最新验证记录见 [互动试行说明](community-interaction-pilot-20261024.md)。下文描述 10 月 22 日页面改进，新增回复通知逻辑涉及服务器，不能继续套用下文“API 未改变”的历史范围描述。

用户最新澄清：优化目标是手机端，电脑网页只用于测试。本说明取代此前“仅网页端、不影响苹果与安卓”的本轮页面范围。先前网页原型和安装脚本保留作历史草稿，不能用于更新已安装的 App。

## 当前实现

新增 `assets/community-mobile-ui.js` 与 `assets/community-mobile-ui.css`，由共享 `index.html` 在 `app.js` 之后加载。脚本在 iOS、Android 原生桥存在时正常启用，不再使用网页原型的原生退出条件。根类为 `community-mobile-ui`，修订为 `20261022-mobile`。

页面始终按手机单列呈现，不启用电脑端左右分栏：

- 首页保留搜索、四个发布入口、可展开分类和五个排序入口；压缩重复操作，增加帖子类型及求助回应提示。
- 详情页统一作者、圈子、标题、正文、图片和互动的顺序，单图按完整比例展示，多图可查看大图。
- 点赞、评论和分享保持主操作；举报、屏蔽、删除收进“更多”，管理员操作另行折叠，原权限条件保持。
- 无回复时可直接聚焦输入框。底部回复框支持安全区、既有键盘偏移及 Android 适配样式；输入字号为 16px。
- 回复草稿按当前登录会话和帖子分开保留，切换回复对象或展开讨论不会清空正文。发送过程中阻止重复提交，服务器确认成功后清空，失败可保留内容重试；旧账号迟到响应不覆盖新账号。
- 保留求助及鉴定的可选描述提纲，不覆盖已有正文。

服务器 API、数据库、原生 Swift/Kotlin 插件、商品规则和强制更新门槛没有因为本次手机页面调整而改变。

## 打包与上线状态

`node scripts/build-web.js` 已重新生成 `www`。该脚本复制全部 `assets`，因此新的 JS/CSS 与 `index.html` 引用已进入 App 使用的网页资源目录，后续按仓库原有 Capacitor iOS/Android 构建流程同步、打包。

本机没有项目 `node_modules/@capacitor/cli`，npm 本地缓存也没有对应包；未执行原生同步、签名或上传商店，未生成可安装的 IPA/APK。此次完成的是共享 App 页面源码及 `www` 构建，不能称为已安装 App 已更新。

仅更新网站或重启 API 服务不会更新已安装 App 的随包页面。要让手机用户使用本轮页面，需要通过原有流程生成并安装/发布新安装包；本轮未擅自提高版本门槛。

## 验证方式与边界

使用 `scripts/test-web-community-detail.cjs` 的手机模式加载实际 `www/index.html`、`www/app.js` 和新资源，不手动注入功能；分别模拟 iOS 与 Android 原生桥。Android 模式还加载仓库中的平台样式、字体及共享代码适配。

```powershell
$env:COMMUNITY_MOBILE_PLATFORM='ios'
node scripts/test-web-community-detail.cjs
$env:COMMUNITY_MOBILE_PLATFORM='android'
node scripts/test-web-community-detail.cjs
```

每个平台均通过 10 组交互检查，包括真实发布入口、详情返回、单列布局、图片预览、管理权限、评论聚焦、草稿、发送失败/重试、重复提交、账号切换及键盘偏移。每个平台还覆盖 320/360/390/430 像素、浅色/深色、横图/竖图/多图/多回复/长文本共 40 个详情布局。

两端检查均为 Windows Chrome 中的原生桥模拟，不等于 iOS WebKit、Android WebView 或真机验收。所有账号、帖子和发送请求均为本地合成并被拦截，没有在线发布回复。

手机预览位于 `output/community-mobile-ui/ios/` 与 `output/community-mobile-ui/android/`，最新结果记录在 `output/community-mobile-ui-ios.json` 和 `output/community-mobile-ui-android.json`。
