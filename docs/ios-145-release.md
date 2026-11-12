# 龟友手账 iOS 1.2.3（145）

基于 GitHub 上的 1.2.2（144）构建整理。iOS 主应用和通知扩展的 Debug、Release 均为 1.2.3（145）。本次合入固定导航、窄屏布局、表单和档案筛选优化，以及新版品种图鉴。

新建档案和收购记账的品种下拉框只显示已加入的常用品种。用户可在图鉴按名称、学名、别名或代码搜索，点「加入并使用」返回表单。返回时选中该品种并保留已填写的内容。

在解压后的源码目录打开 Git Bash，运行以下命令。

```bash
bash scripts/upload-ios-145.sh --check
bash scripts/upload-ios-145.sh
```

第二条命令在临时目录中检出 GitHub 的 `main`，确认仍是已检查的构建 144，然后提交清单内的变更并推送。脚本输出新提交后，在 Codemagic 的 **iOS TestFlight** 工作流选择该提交。App Store Connect 处理完构建后可查看 **1.2.3 (145)**。

源码包保留现有 Android 版本、签名配置和服务端策略。Windows 可以验证资源和浏览器测试，IPA 的 Xcode 编译、签名和上传由 Codemagic 完成。
