# 安卓 1.1.8（18）发布包

2026-10-15。包名 `com.turtlekeeper.app`，版本 `1.1.8`，构建号由17递增至18，正式更新渠道 `store`。沿用原发行签名，供旧版用户覆盖安装。苹果版本号未修改。

本包包含最近的档案菜单区域、批次长名称与金额排版、账本分类栏、运营中心分类栏修复，并同步当前公共页面、搜索、养护提醒和找回密码功能。

构建前执行 `scripts/check-mobile-release.cjs` 与 `scripts/verify-android-build.cjs`，检查双端资源同步、安卓/苹果页面布局、卡片、表单、分类栏、搜索交互，以及推送和更新规则。版本与渠道以最终 APK 元数据和校验报告为准。

APK：`output/android/guiyou-shouzhang-1.1.8-18-store-release.apk`。

构建与成品校验已通过。文件大小85,055,050字节（约81.1 MiB），APK内223项资源与当前构建目录逐项校验一致；包名、版本、构建号、非调试标志和发行签名均已确认。

APK SHA-256：`225e387ccf1402bb08c7fe37e3cafcd8af0a1528fe3c058de0e9cfb8cd347c05`。同目录保存 `.sha256` 和 `.verification.json` 校验报告。

沿用证书 SHA-256：`0ce73316902085e90fd3c2bb96555dea76b0db9793903547f73f11e77b86b7cb`。

安装时直接覆盖原应用，不要先卸载；卸载可能清除尚未同步的本地记录。本次未进行真实安卓手机安装、支付和通知送达验证；页面测试与原生单元测试结果见 `docs/android-prelaunch-layout-audit.md`。
