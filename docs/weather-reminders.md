# 温度提醒

入口：日常养护 → 温度提醒。用户单独同意后搜索城市或主动定位，选择固定养龟地点。手机出行不会改变已保存地点。当前支持中国境内、北京时间的城市；定位和天气查询仅使用两位小数的城市坐标。

默认关闭。开启后可设置预设温度（-30～50℃，0.1℃精度）、提醒温差（1～20℃整数，包含1/2/3/5℃）、每日时间（默认18:00）、提前天数（1～7，默认1）。条件为目标日期最低气温 ≤ 预设温度 − 温差；不是绝对温差相等才触发。数据缺失、请求失败或过期时不判断为“正常”。

例如：20℃、温差3℃、提前1天、18:00，检查明天最低气温≤17℃时提醒。通知内容：龟友手账提醒您：明天上海市预计最低气温为16℃，与预设温度相差4℃，请提前做好准备。提前2天显示“后天”，3～7天显示日期。通知点击进入温度提醒。

设置保存在登录账号的服务器数据中；旧客户端的档案云同步不会覆盖。记录最近14次提醒。按地点和预报日期去重，修改时间不会重复推送同一日期。调度每30秒检查，有15分钟恢复窗口；不是全天补发过期提醒。APNs提交前持久化，超时有可能已送达，因此不自动重复尝试。系统推送送达由设备权限、网络与APNs决定，不能保证通知一定在指定秒数显示。

## 天气服务配置

天气数据来自Apple Weather，通过WeatherKit REST API获取，使用服务端P-256私钥签发ES256 JWT；不再请求和风天气。配置变量：WEATHERKIT_TEAM_ID、WEATHERKIT_KEY_ID、WEATHERKIT_SERVICE_ID、WEATHERKIT_KEY_PATH。完整后台注册和不手动上传密钥的操作见[连接说明](weatherkit-connection.md)。

一次请求获取默认10天的每日预报，包含今天和第7天后的日期。相同坐标共享30分钟短时缓存；失败缓存60秒，设置默认18:00时通常每个地点每日仅查询一次。没有月度硬上限，请在苹果后台查看账户共享额度。接口日期按北京时间归属，缺少目标日期或已过期的预报不用于判断。

城市搜索使用本地GeoNames数据（1506个带中文名称的城市、区县及镇），不调用外部城市查询API，不一定覆盖所有区县。当前位置列出100公里内最近的地点供用户确认，未收录地点可选择附近城市。位置中心坐标来自GeoNames，保留两位小数。数据按CC BY 4.0许可提取、筛选、名称规范化；来源和许可见server/weather-cities.json，生成脚本为scripts/build-weather-cities.cjs。界面展示Apple Weather官方标识、天气来源链接和GeoNames来源。

从旧天气服务迁移的账号必须重新同意Apple Weather地点使用并保存，旧同意记录不会直接授权新的服务。

官方文档：
- https://developer.apple.com/help/account/capabilities/create-a-services-identifier-and-private-key-for-weatherkit/
- https://developer.apple.com/documentation/weatherkitrestapi/request-authentication-for-weatherkit-rest-api
- https://developer.apple.com/documentation/weatherkitrestapi/get-api-v1-weather-_language_-_latitude_-_longitude_
- https://www.geonames.org/export/
- https://creativecommons.org/licenses/by/4.0/

## 上传和部署

本机Git Bash运行 scripts/upload-weather-reminders.sh，只提交清单内文件。不会自动修改版本号、构建号或生产最低支持版本；现有源码仍为1.1.5（128），新增功能需要重新确定构建号后再生成新包。

服务器直接粘贴 deploy/weather-reminders-server.sh 的内容。内嵌补丁不依赖GitHub下载，不需要公网IP或手动传包。先验证校验和和现有代码、进程、版本策略；应用前备份服务器代码，安装失败尝试回滚。只安装API模块、定时任务与网页隐私说明，保留服务器其他功能、账号数据和现有版本策略；不替换服务端整份server.js。网页应用的前端更新需按原有网站发布流程执行，新iOS客户端前端由Codemagic构建打包。

## 验证

node scripts/test-weather-reminders.cjs
node scripts/test-weatherkit-provider.cjs
node scripts/test-weather-reminders-api.cjs
node scripts/test-weather-reminders-ui.cjs
node scripts/test-weather-reminders-deploy.cjs

本地验证使用合成账号、预报、推送及独立本地HTTP服务；没有调用真实天气服务或生产APNs。UI在Chrome/WebKit验证，部署校验和回滚通过模拟进程验证。实际天气服务、iPhone通知权限、前后台通知与设定时间仍需配置凭据后的实机验收。Windows资源校验不等于Xcode编译或签名成功。
