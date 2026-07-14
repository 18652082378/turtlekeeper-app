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
