# iOS 远程消息通知配置

代码已支持：某个壳友收到新的聊天消息时，iPhone 会显示系统横幅、播放提示音，并在 App 图标上显示未读数。通知仅在用户允许通知权限、且该账号已在该设备登录过后发送。

## 一次性开通 Apple 推送

1. 登录 [Apple Developer](https://developer.apple.com/account/)。
2. 打开 **Certificates, Identifiers & Profiles → Identifiers**，选择 `com.turtlekeeper.app`。
3. 在 **Capabilities** 中启用 **Push Notifications**，保存。
4. 打开 **Keys**，新建一个 Key，勾选 **Apple Push Notifications service (APNs)**，下载 `.p8` 文件。这个文件只能下载一次，请妥善保存，不能提交到 Git。
5. 记下该 Key 的 **Key ID**，以及 Developer 页面右上角的 **Team ID**。

## 服务器配置

把 `.p8` 上传到服务器的项目外或 `server` 目录中，并仅允许服务器账号读取。例如在服务器执行：

```bash
mkdir -p /www/turtlekeeper-app/keys
chmod 700 /www/turtlekeeper-app/keys
```

再用你的电脑上传下载到的文件（将文件名换成实际名称）：

```bash
scp ~/Downloads/AuthKey_你的KeyID.p8 ecs-user@120.27.206.20:/www/turtlekeeper-app/keys/
```

编辑服务器 `/www/turtlekeeper-app/server/.env`，增加：

```env
APNS_TEAM_ID=你的AppleTeamID
APNS_KEY_ID=你的APNsKeyID
APNS_BUNDLE_ID=com.turtlekeeper.app
APNS_KEY_PATH=/www/turtlekeeper-app/keys/AuthKey_你的KeyID.p8
APNS_HOST=api.push.apple.com
```

保存后重启：

```bash
cd /www/turtlekeeper-app
node --check server/server.js
pm2 restart turtlekeeper-api --update-env
pm2 save
```

## 重新打包 iOS

启用 Apple 的 Push Notifications 后，提交本次代码并在 Codemagic 重新构建。Codemagic 会按新的能力重新匹配签名配置。安装新 TestFlight 版本后，首次登录会弹出“允许通知”系统授权；用户选择允许后才能收到通知。

> App Store/TestFlight 必须使用 `api.push.apple.com`。不要将 `.p8`、Team ID 以外的私钥内容上传到 GitHub、Codemagic 环境变量截图或聊天窗口。

## 真机验收（上线前必做）

1. 安装包含本次代码的 TestFlight 版本，用管理员账号 `18652082378` 登录。
2. 首次出现 iOS 系统通知权限弹窗时选择“允许”；若之前拒绝过，到 iPhone「设置 → 通知 → 壳友手账」重新开启“允许通知”。
3. 打开「空间 → 账号与安全」，点击“发送测试通知”。页面会提示 5 秒后发送，立刻把 App 切到后台。
4. 5 秒内应收到标题为“壳友手账”的系统横幅和提示音；服务器可用 `pm2 logs turtlekeeper-api --lines 50` 看到 `APNs test push accepted`。
5. 再用另一个账号向该账号发送一条聊天消息，确认锁屏/后台通知、图标角标和点击通知后进入会话均正常。

如果步骤 3 提示“当前设备尚未注册通知”，说明该设备尚未成功向服务器登记 Token：请确认是 TestFlight/正式包、已登录账号、已允许通知，并在服务器确认 `.env` 中 APNS 参数已配置后重启 PM2。
