# 安卓下拉时固定导航栏

2026-10-15。用户视频显示下拉或回弹时底部导航被拉伸、部分文字移出可视区域。导航本身已使用 CSS fixed；代码检查发现 WebView 没有关闭安卓边缘拉伸，因而整个原生渲染表面（包括网页固定栏）仍会参与回弹。此行为与 [Android 12 起的边缘拉伸效果](https://developer.android.com/about/versions/12/behavior-changes-all)一致。

## 修复

- `MainActivity.applyWebScrollPolicy()` 对实际 Bridge WebView 设置 `View.OVER_SCROLL_NEVER`。启动、恢复和窗口配置变化后均恢复该策略，不替换 WebView，不丢弃页面或输入。
- 仅安卓样式在根 `html` 禁止纵向边缘效果。`body` 和 `.phone-shell` 继续允许滚动传递；这些容器因横向裁切可能形成自动滚动容器，若同时禁用其滚动传递，会阻断正常手势滚动，因此不应对其套用 overscroll:none。
- 应用既有的被动触摸监听与下拉刷新逻辑保持不变。苹果端弹性滚动策略不修改。

## 验证

- 新原生回归 `viewportNeverStretchesNavigationDuringEdgePull` 修复前失败（8项中1项失败），修复后8项全部通过。验证启动、恢复及窗口变化后的原生滚动策略和 WebView 保留。
- `scripts/test-android-fixed-navigation.cjs` 使用 Chromium 可信触摸输入，覆盖320/360/720px、六个页面（看板、账本、集市、龟友圈、消息、空间）、有无原生桥接路径，共36轮。逐次拖动与松手检查导航坐标/高度不变；检查正常滚动仍有效、支持页面仍能进入下拉刷新状态，以及底边拖动后导航不移位。
- 这些检查分别验证原生策略和浏览器交互，不能替代真机合成器效果验收。请使用新的19号APK在用户录制视频的手机上复测。

## 发布

安卓版本保持1.1.8，构建号递增为19，沿用原发行签名和store更新渠道。APK为 `output/android/guiyou-shouzhang-1.1.8-19-store-release.apk`，18号及更早APK不包含本修复。服务器与账号数据未修改。
