# 安卓 1.1.8（17）

2026-10-15。包名 com.turtlekeeper.app，versionName 1.1.8、versionCode 17，使用原 release 签名，可覆盖同签名 1.1.0（15）和 1.1.8（16）并保留数据。iOS 仍为 1.1.8（134）。

## 功能与边界

同步全部 203 个共享业务资源，保留搜索、咨询码、找回密码、养护布局、缺失档案提醒过滤/取消等修改。Android 保留原生窗口/键盘、折叠屏、返回键、中文字体和支付宝插件。

新增 Aliyun Push 3.10.1、通知用途说明、Android 13+ 授权、固定通知通道、独立注册、退出关闭及通知点击。Android 不再加载 Capacitor Firebase 推送依赖，iOS 继续使用原推送插件。SDK AppSecret 从本机忽略配置注入原生 BuildConfig，验证器确认未进入 WebView 资源。

服务器补丁按平台和会话分别注册、分发，发送前核对设备所有权。支持已配置设备的私信、关注、养护、天气、公告和精选帖。点赞/评论仍只在应用内显示；APNs 角标同步不向安卓发空通知。天气和精选不保存离线旧通知。客户端与原生接收器均过滤其他账号的旧通知。

根据用户提供的服务器执行截图，推送补丁与 RAM 配置已保存，API 健康检查通过；尚未连接真机。未配置各手机厂商通道，进程被清理后的送达率仍待验证。咨询码、找回密码如未部署其独立后端补丁，也仍需更新服务器。

2026-10-15 后续页面检查又修复了菜单区域与批次排版，详见 docs/android-prelaunch-layout-audit.md。以下 APK 为之前构建的 17 号包，不含后续页面修复；上线需重新构建并进行真机验收。

## 验证

- test-android-push.cjs：RPC 参数/签名、路由、APNs 隔离、角标排除、撤销会话与所有权。
- test-android-push-api.cjs：独立 HTTP 服务器认证、注册、账号迁移、平台解绑、会话绑定、持久化及记录保留。
- test-android-push-client.cjs：插件选择、旧服务安全路径、延迟回调、冷启动点击与账号隔离、退出、iOS 兼容。
- TurtlePushReceiverTest：Android API 33 通知通道、PendingIntent 点击数据、重复覆盖、退出/切换账号拦截；现有原生测试一并通过。
- test-android-ui.cjs：真实打包资源多尺寸/主题、折叠窗口、键盘、返回/弹层与业务数据保留。
- test-android-push-deploy.cjs：精确补丁、重复安装、未知源拒绝、安装回滚、隐藏凭据保存/重启/回滚，以及短信、Apple、WeatherKit、原有版本策略与业务记录保留。
- 原有温度规则（含当天）、每日精选及通知深链回归通过。

构建：PowerShell 执行 scripts/build-android-release.ps1 -UpdateChannel store。

APK：output/android/guiyou-shouzhang-1.1.8-17-store-release.apk。

服务器归档：deploy/patches/turtlekeeper-android-push.tar.gz，不含真实密钥。

签名证书 SHA-256：0ce73316902085e90fd3c2bb96555dea76b0db9793903547f73f11e77b86b7cb，与旧版本一致。APK 文件校验值以同目录 .sha256 文件为准。
