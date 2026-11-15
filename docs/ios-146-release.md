# 龟友手账 iOS 1.2.3（146）

本次更新免费开放团队空间。所有登录账号均可创建自己的团队、邀请成员或受邀加入其他团队。原有团队数据和按成员分配的查看、编辑权限继续生效。应用内移除了团队会员购买、续费和恢复购买入口，服务器关闭新订单入口并继续处理历史订单。

本版本同时包含评论栏随键盘开合、表单输入避让和左缘返回修复。

## 上传 iOS 源码

解压后，在包含 `scripts` 的目录打开 Git Bash，运行以下命令。

```bash
bash scripts/upload-ios-146.sh --check
bash scripts/upload-ios-146.sh
```

第二条命令将更新文件提交到 GitHub `main`，以 1.2.3（145）的提交为起点。在 Codemagic 选择脚本输出的提交，用 **iOS TestFlight** 工作流编译、签名和上传。

## 生效顺序

先部署 [团队免费开放服务端补丁](turtlekeeper-free-team-server.patch)。该补丁只涉及团队访问和购买接口，可在服务器项目目录用 `git apply --check turtlekeeper-free-team-server.patch` 检查是否匹配线上文件。上线后分别验证普通账号创建、受邀加入和成员权限，再发新版客户端。团队权限由同一套 API 提供，因此服务器更新后，安卓用户也可免费使用团队空间。

已有的 Apple 自动续订由 App Store 管理。请在 App Store Connect 的「订阅 → 可用范围」将旧的月度和年度商品移出销售，并通知现有订阅用户。团队空间会继续免费提供原有协作能力。[Apple 的订阅停售说明](https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-availability-for-an-auto-renewable-subscription)
