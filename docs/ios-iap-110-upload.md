# 龟友手账内购测试版 1.0.9（110）

版本号固定为 1.0.9，构建号固定为 110。月度和年度商品 ID 保持不变。

## Git / Codemagic

完整源码 ZIP 解压后，将内容合并进已有 Git 仓库根目录，保留仓库的 `.git`。不要把 ZIP 本身当作源码提交。

在 Windows PowerShell 的项目目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\publish-team-ios-110.ps1
```

脚本同步 iOS 资源、校验 1.0.9（110）、验证内购插件和团队文件、运行测试，然后只提交发布清单内的文件并推送 `origin/main`。失败时停止；网络恢复后可再次运行。

推送成功后，在 Codemagic 选择 `main` 分支和 `ios-testflight` 工作流开始构建。工作流生成 IPA 并上传 TestFlight；Xcode 编译和苹果签名需要在该云构建环境完成。

如苹果已实际接收过 1.0.9（110），再次上传同一版本的同一构建号可能被拒绝；此包仍按要求保留 110，不会自动更改编号。

## 服务器

服务器使用单独的 `turtlekeeper-team-update-v10.tar.gz`，不要用完整 Git 源码直接覆盖正在运行的站点。

上传到 `/tmp/` 后执行：

```bash
cd /tmp &&
tar -xzf turtlekeeper-team-update-v10.tar.gz &&
node /tmp/turtlekeeper-team-update-v10/deploy.cjs --check &&
node /tmp/turtlekeeper-team-update-v10/deploy.cjs --apply
```

已成功部署 V10 时无需重复安装。安装器保留当前 `.env`、数据库和上传文件，包括已配置的内购密钥路径和沙盒测试手机号。

## 测试与密钥

- App 内使用已经在服务器白名单配置的手机号登录，苹果沙盒账号在 iPhone 的对应测试入口使用。
- `.p8` 私钥仅保留在服务器 `/home/ecs-user/apple-iap/`，不放入 Git、源码 ZIP 或 iOS 安装包。
- 本地验证不能代替 Xcode 编译、苹果接口鉴权、通知回调和 iPhone 实际沙盒购买测试。
