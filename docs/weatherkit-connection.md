# Apple WeatherKit连接

本软件通过服务器上的WeatherKit REST API获取预报，再通过已有APNs发送通知。Apple WeatherKit密钥仅保存在服务器，不进入Git、App包或聊天。天气功能源码已完成，尚未连接你的Apple账户；Windows测试不能代替真实Apple认证和iPhone验收。

## 1. 苹果后台：注册Services ID

登录 https://developer.apple.com/account/resources/identifiers/list 。

Identifiers → 左上角“+” → **Services IDs** → Continue。

- Description：`Turtle Weather Reminders`
- Identifier：`com.turtlekeeper.weather`

Continue → Register。记录这个Services ID。若你选择了其他标识符，服务器配置时必须输入同一个值。

苹果官方说明：所有注册的Services ID都可用于WeatherKit REST API。我们使用服务器REST方式，无需为了这个服务ID给iOS工程增加WeatherKit entitlement或重新生成App描述文件。

https://developer.apple.com/help/account/capabilities/create-a-services-identifier-and-private-key-for-weatherkit/

## 2. 苹果后台：创建WeatherKit密钥

Keys → “+” → Key Name：`Turtle WeatherKit` → 勾选 **WeatherKit** → Continue → Register。

下载 `.p8` 文件到本机Downloads，保留默认文件名 `AuthKey_你的KeyID.p8`。苹果私钥只能下载一次，请自行安全保存。记录该密钥的10位 **Key ID**，在Membership details中取得10位 **Team ID**。这些值是Apple Developer后台的值，不是App Store Connect的Issuer ID，也不是App Store Connect API上传密钥。此前的APNs密钥只有显式开启WeatherKit权限后才能用于WeatherKit；推荐创建独立天气密钥，保持原推送配置。

官方认证文档：https://developer.apple.com/documentation/weatherkitrestapi/request-authentication-for-weatherkit-rest-api

## 3. 上传Git源码

本机Git Bash：

```bash
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app
bash scripts/upload-weather-reminders.sh
```

版本仍是1.1.5（128），未替你选择新版本或构建号。发布新客户端需要新的构建号。

## 4. 服务器安装

打开本机 `deploy/weather-reminders-server.sh`，复制全部内容到ECS服务器终端执行。脚本内嵌了完整服务器补丁，无需GitHub下载、手动传包或填写ECS公网IP。

Git Bash也可执行 `cat deploy/weather-reminders-server.sh | clip.exe`，把完整服务器代码复制到剪贴板。使用当前修订的补丁，不要重复粘贴此前的旧代码。补丁只匹配天气功能所需的唯一代码锚点，保留相邻的其他功能和隐私说明；若仍不匹配，会显示文件名与片段编号并停止，尚未写入代码或重启服务。

出现SUCCESS后，终端最后会打印实际的配置命令，形如：

```bash
bash "/tmp/turtlekeeper-weather.实际随机目录/deploy/configure-weatherkit.sh"
```

运行终端打印的实际命令，依次输入Team ID、Key ID、Services ID（直接回车使用`com.turtlekeeper.weather`）。接下来会等待隐藏输入`.p8`的Base64。

## 5. 不手动上传.p8：从Git Bash复制密钥

此时在本机Git Bash运行：

```bash
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app
bash scripts/copy-weatherkit-key.sh
```

输入刚创建的WeatherKit Key ID。脚本从Downloads读取对应`.p8`，把Base64直接放入剪贴板，不在终端显示密钥，也不发送到GitHub。

回到服务器正在等待隐藏输入的终端，粘贴并按回车。脚本会验证P-256私钥，实际查询上海未来预报，验证成功才保存server/.env并重启API；失败不会覆盖原环境配置。完成后复制其他文本清空剪贴板。

服务器保存的环境名：`WEATHERKIT_TEAM_ID`、`WEATHERKIT_KEY_ID`、`WEATHERKIT_SERVICE_ID`、`WEATHERKIT_KEY_PATH`。私钥位于`server/keys/weatherkit-KEYID.p8`，权限600；旧环境备份位于权限受限的`server/backups/weatherkit-env-*`。配置脚本不会修改APNs设置、用户数据或最低支持版本。

401/403认证失败时，检查服务ID、Team ID和Key ID是否对应，以及密钥是否启用WeatherKit。服务器时钟需正确。不要将私钥、完整JWT或环境文件粘贴到聊天。

## 6. 手机验收

安装含此次天气功能的新构建。iPhone允许龟友手账通知，登录账号，进入“日常养护 → 温度提醒”，选择地点、温差、时间、提前天数并保存。

先测试普通推送：管理员账号 → 空间 → 设置 → 推送通知实机测试 → 发送测试通知，然后把App切到后台。再使用专用测试账号设置接近当前时间的提醒和能触发的阈值，确认锁屏通知、点击通知进入温度提醒，以及同一日期不重复发送。测试后恢复正常阈值。

Apple Developer会员包含每月50万次WeatherKit调用，整个会员账户共享；超出需另购额度。当前有30分钟短时预报缓存和失败退避，没有月度硬上限，不能保证零费用。用量查看入口： https://developer.apple.com/account/resources/services/weatherkit 。

https://developer.apple.com/weatherkit/
