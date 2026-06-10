# Windows 云端打包 iOS 说明

你现在没有 Mac，不能在 Windows 本机直接完成 iOS 打包和 App Store 上传。这个项目已经整理成 Capacitor 结构，可以在云端 Mac 上生成 iOS App。

## 推荐路线

1. 在 Windows 上继续开发和修改当前项目。
2. 把 `outputs/turtlekeeper-app` 上传到 GitHub 仓库。
3. 使用 Codemagic 连接 GitHub 仓库。
4. 在 Codemagic 中配置 Apple Developer / App Store Connect。
5. 由 Codemagic 的 Mac 机器打包 `.ipa` 并上传 TestFlight。

## 项目里已经准备好的文件

- `package.json`：iOS 云构建依赖和命令
- `capacitor.config.json`：iOS App 基础配置
- `scripts/build-web.js`：把网页原型复制到 `www`
- `codemagic.yaml`：Codemagic TestFlight 构建配置
- `.github/workflows/ios-check.yml`：GitHub Actions iOS 工程检查
- `config.js`：填写正式后端接口地址

## Windows 本地可以做的检查

安装 Node.js 后，在 `outputs/turtlekeeper-app` 目录运行：

```powershell
npm install
npm run build
```

这一步只会生成 `www`，不会生成真正的 iOS 包。真正 iOS 包要在云端 Mac 上构建。

## 上传 GitHub

把 `outputs/turtlekeeper-app` 这个目录作为仓库根目录上传。

GitHub Actions 里的 `ios-check.yml` 可以在 macOS runner 上验证能不能生成 iOS 工程，但它默认不做 App Store 签名上传。

## Codemagic 需要配置

进入 Codemagic 后：

1. 连接你的 GitHub 仓库。
2. 选择使用仓库里的 `codemagic.yaml`。
3. 添加 App Store Connect 集成。
4. 添加 iOS Distribution Certificate。
5. 添加 Provisioning Profile。
6. 确认 Bundle ID 是：

```text
com.turtlekeeper.app
```

7. 运行 `ios-testflight` 工作流。

成功后 Codemagic 会生成 `.ipa`，并可以上传 TestFlight。

## 正式短信后端

iOS App 里不能使用你 Windows 本机的 `127.0.0.1` 作为短信后端。

上线前需要把短信后端部署到云服务器，然后在 `config.js` 里填写公网 HTTPS 地址：

```js
window.TURTLE_API_BASE_URL = "https://你的域名";
```

必须使用 HTTPS，否则 App Store 审核和 iOS 网络请求都会有风险。

## 上架前还需要准备

- Apple Developer Program 账号
- App Store Connect App 记录
- App 图标
- App Store 截图
- 隐私政策网页
- 测试账号或审核说明
- 短信服务签名和模板
- 后端服务器和数据库

当前版本的数据仍主要存在本机浏览器/应用本地。如果要给多个用户长期使用，需要继续接正式后端和数据库。
