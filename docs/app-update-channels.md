# 分平台更新配置

苹果继续使用 `MIN_SUPPORTED_APP_BUILD`、`LATEST_APP_BUILD` 和 `IOS_APP_STORE_URL`。

安卓的构建号来自 Gradle `versionCode`，客户端优先读取已安装 APK 的原生构建号，不与苹果构建号比较。

当前安卓包仅供本人通过文件安装自测，默认 `beta` 通道。不配置 beta 更新策略时，不触发强制更新。正式包使用 `store` 通道，两者互不影响。

| 通道 | 最低构建 | 最新构建 | 更新地址 |
| --- | --- | --- | --- |
| 安卓商店 | `ANDROID_STORE_MIN_BUILD` | `ANDROID_STORE_LATEST_BUILD` | `ANDROID_STORE_UPDATE_URL` |
| 安卓自测 | `ANDROID_BETA_MIN_BUILD` | `ANDROID_BETA_LATEST_BUILD` | `ANDROID_BETA_UPDATE_URL` |

安卓更新地址必须为 HTTPS 且不能指向 Apple 域名。地址缺失时最低版本要求不生效，避免用户被拦住又无法更新。自测阶段保持 beta 变量未配置。商店正式上架并验证可下载安装后，才配置商店更新地址与最低构建号；多个商店可使用官网安卓下载选择页作为统一入口，不假设尚未上架的商店链接已可用。

生成自测包：`powershell -File scripts/build-android-release.ps1 -UpdateChannel beta`。

生成正式商店包：`powershell -File scripts/build-android-release.ps1 -UpdateChannel store`。

旧客户端未发送 platform 时，服务端根据 Android User-Agent 避免下发苹果拦截；旧苹果客户端仍保留原有响应字段。新安卓客户端会忽略旧服务端返回的苹果策略。鸿蒙和网页目前不套用苹果或安卓的强制升级规则。

服务端上线必须同时包含 `server/server.js` 与 `server/app-update-policy.js`。仅替换前端或重新安装 APK 不等于服务端已经部署；旧安卓包也无法通过更新后端改变其内置的按钮文字，需要安装修复后的 APK。

本次没有更改 App Store 名称或图标，也没有启用任何支付功能。
