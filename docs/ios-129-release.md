# iOS 1.1.6（129）构建

日期：2026-10-07。主应用与通知扩展的 Debug/Release 版本统一为 1.1.6（129）；package.json、package-lock.json 与网页构建号同步更新。

新增温度提醒，入口为「日常养护 → 温度提醒」。用户可搜索城市或主动定位选择养龟地点，设置预设温度、提醒温差、每日提醒时间和提前 1～7 天提醒。默认时间为 18:00，默认提前 1 天；检查目标日期最低气温是否低于设定阈值。天气来自 Apple Weather，服务端使用 WeatherKit REST API。

服务器已安装天气提醒接口和定时任务，用户提供的配置结果显示 Apple 真实天气认证及多日预报验证通过，并已重启后端。此次准备客户端构建，无需重复部署天气补丁或调整正式最低支持版本。

在本机 Git Bash 上传本次清单内的文件：

```bash
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app
bash scripts/upload-ios-129.sh
```

然后在 Codemagic 选择 main 最新提交，启动 iOS TestFlight 工作流。上传完成后，在 TestFlight 安装 1.1.6（129）。Windows 本地检查不执行 Xcode 编译、签名或 IPA 上传；云端构建完成后才能确认 IPA 成功生成。

本地验证通过：205 个网页资源与 iOS 同步资源一致，通知扩展和隐私配置检查通过；天气规则、WeatherKit 签名与配置、独立 HTTP 接口、部署回滚测试通过；Chrome 上 8 项手机界面交互测试通过。本次本机没有可用的 Playwright WebKit 浏览器，未重跑 WebKit；原生侧滑验证仅生成 Swift 测试脚本，执行需 macOS 云端环境。

真机验收：开启系统通知权限，保存城市、温度、温差、提醒时间和提前天数，退出并重新进入确认设置保存；设置即将到来的提醒时间且满足预报触发条件，验证应用在后台时可收到通知，并点击通知进入温度提醒。此项尚待新构建实测。
