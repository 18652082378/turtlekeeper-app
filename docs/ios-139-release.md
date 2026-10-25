# 1.1.9（139）重新构建

本次保留版本号 1.1.9，将苹果主应用和通知扩展 Debug/Release 四处构建号从 138 升至 139。功能沿用已核查的 138；包含本地修正的旧部署回归测试。上一轮发现的私信聊天页滑动收起键盘遗漏未在本次构建号调整中修改。

安卓仍为独立构建号 28；已上线的 138 网页包和服务器版本策略不变，无需重新部署网站。

电脑 Git Bash 上传：

```bash
bash "C:/Users/Administrator/.codex/worktrees/e76e/turtlekeeper-app/scripts/upload-ios-139.sh"
```

加 --check 只准备资源和检查，不提交或上传。默认运行将验证资源、139 配置、显式发布清单、评论/图片/页面回归和版本兼容，随后拉取 origin/main，仅提交清单内文件并正常推送 HEAD:main。远端分叉时停止，不强推。

上传成功后，在 Codemagic 的 iOS TestFlight 工作流选择 main 最新提交，新建构建；不要重试绑定旧提交的 138 构建。最终以 Xcode/签名/TestFlight 成功、App Store Connect 显示 1.1.9（139）为准。Windows 检查不能代替签名编译和真机验收。
