# iOS 1.1.7（133）

日期：2026-10-11。版本保持 1.1.7，主应用和通知扩展的 Debug/Release 构建号统一为 133。

## 本次修复

- 单只乌龟在品种旁显示“公”或“母”；未知性别、空值及批次不增加性别后缀。长品种名称截断时保留性别可见。
- 关联档案不存在时，成长提醒和明确关联该档案的提醒不进入今日待办或提醒列表；普通未关联档案的养护提醒保留。
- 包含 132 的页面、搜索、养护记录和找回密码改动，详细记录见 ios-132-release.md。

## 验证与构建

性别显示已验证看板和档案列表，在浅色/深色主题和 320、390、1280px 下共 18 个场景，覆盖未知性别、批次、长名称及价格布局。

本次已同步并验证 213 个网页资源、149 张品种图片、5 个本地插件与隐私清单，主应用及通知扩展四处构建号均为 133。16 项发布检查、缺失档案提醒单元检查、成长提醒界面回归、7 项更新弹窗检查及 18 个性别布局场景全部通过。上传脚本 Bash 语法检查与 Git 差异空白检查通过。Windows 本地检查不执行 Xcode 编译或签名；最终 IPA 由 Codemagic 生成。

在 Git Bash 运行：

```bash
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app
bash <(tr -d '\r' < scripts/upload-ios-133.sh)
```

上传完成后，在 Codemagic 选择 main 最新提交，运行 iOS TestFlight。成功后在 App Store Connect 选择 1.1.7（133）。

找回密码及缺失档案系统推送过滤的服务器补丁已准备，尚未部署；客户端上传脚本不会执行服务器部署。分别见 password-recovery.md 和 orphan-reminders.md。
