# 安卓通知接入与服务器操作

2026-10-15：本地 EMAS Android AppKey/AppSecret 已保存并用于原生 SDK 编译。Android 1.1.8（17）接入阿里云移动推送 3.10.1 自有通道，包名 com.turtlekeeper.app。根据用户提供的服务器执行截图，推送补丁和 RAM 凭据已安装保存，API 健康检查通过；真实手机推送仍未验证。已完成安装时直接进入真机验证，无需重复填写密钥。

## 安装并配置服务器

本机 Git Bash 执行 node scripts/copy-android-push-command.cjs --clipboard，然后切换到已登录服务器的 Shell 粘贴执行。无需先上传 GitHub。命令会校验归档 SHA-256、检查已有源码与 PM2 单实例、备份、仅安装推送相关补丁、短暂重启 API，并核对健康和原有版本策略。未知源码会在修改前停止，重启失败会回滚代码。

随后按终端提示依次输入：

1. Android AppKey：33575545。
2. RAM AccessKey ID：使用已有移动推送权限的 RAM 身份；系统策略准确名称为 AliyunMPushFullAccess（或仅含 mpush:Push 的自定义策略）。
3. RAM AccessKey Secret：该身份的配套 Secret。

后两项输入时不显示字符，粘贴一次后回车即可。此处不能用 EMAS AppSecret 或 AppRsaSecret。不要将 Secret 发送到聊天或截图中。脚本只修改 server/.env 的 ANDROID_PUSH_APP_KEY、ANDROID_PUSH_ACCESS_KEY_ID、ANDROID_PUSH_ACCESS_KEY_SECRET，保留短信、Apple、WeatherKit 和数据库配置；私有备份权限 0600，API 启动检查失败会恢复配置。

成功信息仅代表配置保存且 API 健康，不代表已送达手机。再次运行完整安装命令会重复检查并要求重新输入凭据。

也可上传 deploy/patches/turtlekeeper-android-push.tar.gz 后解压，依次运行 node scripts/deploy-android-push.cjs --check、node scripts/deploy-android-push.cjs --apply、bash deploy/configure-android-push.sh。

## 真机验证

安装包含最新页面修复的重新构建 APK，勿将此前的 1.1.8（17）包当作本次修复产物。登录后同意通知用途说明和 Android 通知权限。管理员在应用的推送测试入口发送测试，马上将 App 切到后台。确认收到通知，点击后打开消息页。再验证养护、低温、退出和切换账号。

新客户端使用独立 /api/notifications/android/device/* 路径，旧服务器返回失败，不会把安卓 DeviceID 登记为 Apple 设备。服务端按平台区分并绑定会话，发送前再次核对所有权和有效会话。Apple APNs 保持独立；其角标同步不向安卓发空白通知。

目前仅配置阿里云自有通道，未配置华为、荣耀、小米、OPPO、vivo 等厂商凭据。自有通道测试通过不能保证进程被清理后收通知，需按实际机型申请厂商通道后重新构建、实机验证。

## 本机维护

客户端凭据只从被 Git 忽略的 keys/android-push.json 读取并注入原生编译，不进入网页、日志或服务器安装归档。RAM 凭据只在服务器，不打进 APK。首次开启通知会说明用途，拒绝不影响记录功能；保存温度提醒时可再次申请。系统通知可在 Android 系统设置关闭。

修改后运行 scripts/build-android-release.ps1 -UpdateChannel store。Android versionCode 17 与 iOS build 134 独立管理。

官方文档：[Android SDK](https://help.aliyun.com/zh/document_detail/434660.html)、[版本说明](https://help.aliyun.com/zh/document_detail/434659.html)、[服务器签名与 RAM](https://help.aliyun.com/zh/document_detail/434773.html)、[高级推送参数](https://help.aliyun.com/zh/document_detail/2249916.html)。

2026-10-15 安装兼容修复：设备规范化函数与 Apple 配置函数分别核对；支持已核对函数的缩进、空行和二者之间保留其他代码，不再要求两个函数连续。逻辑改变、重复函数或已有未知 Android helper 仍会停止。新命令已重新打包；APK 保持原版本和校验值。

2026-10-15 隐私页兼容修复：服务器隐私页不再匹配本地完整表格，而是追加独立的安卓推送说明；原有政策逐字保留。已包含已审核 SDK 行或独立说明时不重复添加，旧版无支付宝行、压缩页面和正文结构不同的页面均已覆盖，异常结构仍在写入前停止。
