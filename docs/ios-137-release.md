# 1.1.9 累计更新：苹果 137，安卓 28

2026-10-24。本包包括本次会话之前未上传的实际产品源码改动，不需要逐个执行此前的网页或商品小补丁。

## 已纳入版本

- 龟友圈手机列表与详情布局、完整图片预览、紧凑回复区、描述提纲和待回复筛选。
- 最新回复摘要、评论定位、被回复者站内提醒、草稿保留、账号隔离及原样重试去重。
- 商品 7 天提醒确认、30 天未确认下架；确认在售不提升排序，旧客户端刷新接口继续兼容。
- 全软件请求超时、异常回执处理、在售确认重复点击保护、搜索栏宽度、登录自动填充提示与模块统计归属修复。
- 苹果主应用和通知扩展的 Debug/Release 四处统一为 1.1.9（137）。安卓为 1.1.9（28），保持独立递增的安卓构建号。
- 新增 1.1.9 更新说明；CI 发布检查纳入新请求恢复和手机社区回归。

运营话题及两周试行文档是供运营人员执行的计划，不代表已自动发帖或已产生增长。旧网页原型、停留分析草稿不启用；正式 App 使用 `assets/community-mobile-ui.js/css`。

## 第一步：电脑上传完整发布代码

在当前项目的 Git Bash 执行：

```bash
bash scripts/upload-ios-137.sh
```

只核对源码和版本、不提交或推送：

```bash
bash scripts/upload-ios-137.sh --check
```

上传脚本按 `scripts/ios-137-release-files.txt` 提交本次累计改动，允许当前脱离分支的工作树，拒绝强制推送与远端历史分叉；只有核对 GitHub main 与新提交完全一致后才提示成功。不会向 GitHub 提交数据、密码、服务器 `.env`、签名密钥、`output`、`node_modules`、浏览器缓存或生成的原生资源目录。

## 第二步：服务器一次更新全部代码

第一步提示上传成功后，在服务器终端执行：

```bash
set -euo pipefail
cd /www/turtlekeeper-app
git fetch origin main
git show origin/main:scripts/deploy-server-137.sh | bash -s -- --apply /www/turtlekeeper-app
```

服务器脚本会核对版本、Node.js 22+、目标 PM2 进程和干净的代码目录；在项目旁的 `.turtlekeeper-release-backups` 保存上一版本已提交源码，再快进更新代码、安装生产依赖、检查语法、重启 `turtlekeeper-api` 并验证公开版本接口。

不会修改现有 `.env`、用户数据库、上传目录或密钥，不执行数据库迁移，不提高旧版 App 的最低可用构建号。源码备份不替代用户数据库备份。若服务器已有本地代码修改或 Git 历史分叉，脚本会停止并保留文件，不使用 `reset --hard`。如果部署后就绪检查失败，脚本会报错并显示源码备份位置，不声称部署成功。

本轮服务器配置仍按现有商店最低版本运行。不要在 137 尚未上架时把 `MIN_SUPPORTED_APP_BUILD` 调高到 137，以免旧版用户被要求更新到尚不可下载的版本。

## 第三步：Codemagic 构建 App

在 Codemagic 选择 **main 最新提交 → iOS TestFlight → 新建构建**。不要重试绑定旧提交的历史构建。确认日志显示 1.1.9（137）；云端完成依赖安装、原生同步、两端页面检查、签名配置、Xcode 编译及 TestFlight 上传后，以 App Store Connect 实际出现的新构建为准。

本机已准备两端资源，但 Windows 不执行 iOS 编译签名。完整源码包不是 IPA，不能直接安装到苹果手机。安卓共享源码为 1.1.9（28），正式 APK 仍需原发行签名与服务器未公开的安卓推送配置，通过原流程构建。

## 源码包与校验

```bash
node scripts/package-ios-source.cjs
```

生成 `output/turtlekeeper-ios-1.1.9-build-137-source.zip`、逐文件清单及 `.sha256`。源码包包含两端工程、完整服务器和网站源码、构建脚本及本轮新增资源。Windows 如未安装 Python，可将 `PYTHON` 指向本机可用的 Python 可执行文件再运行。

本轮版本、资源和检查结果以 `output/release-137-validation.json` 为记录。没有自动推送 GitHub、远程部署服务器或发布商店安装包。

## 本机发布验证结果

- 两端 220 项共享资源与原生资源一致，苹果主程序与通知扩展的版本一致。
- 最终完整 `check:mobile --prepared` 通过：iOS/WebKit 800 项、安卓/Chromium 2,400 项打包页面布局；两端社区各 15 组交互与 40 项布局，参与／发布／隐私各 14 组与 144 项布局，表单各 280 项，商品发布各 84 项，账本工具栏各 88 项，以及导航、原生边界模拟、文件导出、推送与更新策略隔离检查。
- 1.1.9 更新说明的 Chromium／WebKit 检查均通过；iOS 发布就绪、签名检查器的模拟回归、源码上传清单及新服务器部署预检模拟通过。
- legacy 与 records 测试驱动的隔离 API 工作流通过，包含评论并发重试去重、通知、商品在售规则和账户操作。
- 最终日志为 `output/release-137-mobile-check-final.log`。旧社区测试的空筛选退出按钮定位已适配新版实际入口，未移除其“能返回全部帖子”的行为断言。

这些结果来自 Windows 的 WebKit／Chromium 和原生桥模拟。实际 iOS 编译、签名与上传仍由 Codemagic 执行，安卓正式签名包与两端真机安装尚未执行。
