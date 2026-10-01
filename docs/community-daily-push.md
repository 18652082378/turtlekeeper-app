# 每日壳友圈新帖提醒

仅推送最近24小时内的公开帖子。管理员检查全部文字与每张图片后，在帖子详情点击“审核无广告并推荐”。审核接口和推送任务均以管理员的人工确认结果为准，即使包含疑似广告、联系方式、售卖信息或外链，也不会被关键词再次拦截。没有人工确认的帖子不会广播；权限、公开范围、有效期、举报和内容变更后的重新审核规则仍然生效。

北京时间09:00至21:00每分钟检查一次。在当天派发选择落盘前，最后一次审核推荐的有效帖子优先，不再按帖子发布时间挑最老的一篇。当天选择落盘后不再切换帖子，每天仍最多推荐一篇。夜间候选可在次日09:00后参与，帖子超过24小时则不再参与。当天没有合格帖子则不发。可以在发送前“撤销推荐”，已经发送的通知无法撤回。

每个已注册通知设备每天最多尝试一次；用户在账号设置中可单独关闭每日新帖提醒。被用户屏蔽作者的作品不发给该用户。推送展示所推荐帖子的标题、正文摘要和第一张可用配图；视频可使用已审核的封面。没有标题时使用这篇帖子的文字作为标题。帖子标题或图片编辑后必须重新审核。携带同一postId直达帖子，失效时进入龟友圈提示。

iOS工程包含 `TurtleNotificationService` 通知服务扩展，服务器为有配图的消息添加 `mutable-content: 1` 和 `attachmentUrl`。扩展只通过HTTPS下载项目列出的API/CDN/OSS域名图片，限制10MiB和20秒资源时间，生成1280px以内JPEG附件；网络失败、非法内容或超时仍展示原标题和文字。原生系统决定缩略图布局与折叠方式。依据：[Apple通知修改说明](https://developer.apple.com/documentation/usernotifications/modifying-content-in-newly-delivered-notifications)、[通知附件](https://developer.apple.com/documentation/usernotifications/unnotificationattachment)。

扩展Bundle ID为 `com.turtlekeeper.app.NotificationService`。构建前须在Apple Developer/Codemagic准备该扩展的App Store描述文件；主App描述文件无法代替扩展描述文件。现有Codemagic bundle匹配可选择子扩展的已上传配置，见[Codemagic签名说明](https://docs.codemagic.io/yaml-code-signing/signing-ios/)。旧安装包只会获得文字标题，新客户端安装后才有附件处理能力。

选择帖子与设备尝试记录写入现有数据库并等待落盘后才请求APNs。重启后不会换一篇帖子再次广播。失败或发送结果不确定时不重试该设备，以少发优先于重复发；APNs不保留离线通知，避免夜间或次日补发。未授权通知、关闭开关、离线设备不能保证收到。

部署约束：沿用当前单实例PM2 fork运行方式，与现有整库JSON/MySQL持久化架构一致。不要将本服务扩成多个进程/多个副本同时派发；扩容前需要数据库唯一索引与事务抢占替代当前单进程互斥。当前补丁没有更改正式版升级门槛或构建号。

验证：node scripts/test-community-daily-push.js；node scripts/test-community-recommendation.cjs；node scripts/test-api-workflows.js；node scripts/test-push-deeplink.js；node scripts/verify-notification-extension.cjs。测试使用隔离数据库或模拟APNs，不向真实用户发通知。Windows仅验证原生工程配置关系，未执行Swift/Xcode编译或通知扩展运行。上线后需要使用实际设备验证系统通知展示与点击跳转。
