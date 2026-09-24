# 龟友手账 iOS 1.1.1（117）源码

版本：1.1.1；构建号：117；Bundle ID：com.turtlekeeper.app。
保留已确认的 iOS 图标与桌面名称。

本包来自当前工作区源码，包含日常养护、档案图片选择与批次繁殖相关修改，返回/滚动/键盘修复，以及“龟友圈”名称更新。服务端代码包含管理员账号（默认 18652082378）最多 3 台设备同时登录，普通账号仍限 1 台；同设备重新登录不额外占位，第 4 台替换最早登录的一台。

## 构建

源码包不包含 node_modules、生成的 www、原生 public 副本、签名密钥或用户数据。需要 Node.js 22 或以上。

```bash
npm ci
npm run cap:sync:ios
node scripts/verify-ios-build.js --native
```

Mac 上用 Xcode 打开 `ios/App/App.xcodeproj`，选择 App scheme，配置自己的开发者团队和签名后 Archive。也可以沿用 `codemagic.yaml` 的 `ios-testflight` 工作流；该工作流会构建 IPA 并上传 TestFlight，需先完成个人账号的签名配置。App Store 审核由用户另行提交。

Windows 本地已完成网页资源构建、iOS 同步和版本/资源校验，不代表已生成签名 IPA 或完成 App Store 上传。

## 服务端

服务端修改位于 `server/`。源码包不携带线上配置与数据库。管理员三设备登录及服务端通知名称修改，必须更新正式服务器后才会对线上账号生效，单独安装新 App 不会更新服务器。本次没有部署服务器或上传应用。

## 验证与打包

- `node scripts/verify-ios-build.js --native`
- `node scripts/test-admin-device-sessions.cjs`
- `node scripts/test-api-workflows.js`（隔离测试服务与数据）
- 导航专项记录见 `docs/navigation-scroll-keyboard-audit.md`。
- `scripts/package-ios-source.cjs` 从工作区当前文件生成源码 ZIP，并输出每个文件的 SHA256 清单。运行时通过 `PYTHON` 指定 Python 3 路径。

根目录 `README.md` 与旧发布文档保留历史说明；本次构建以本文为准。
