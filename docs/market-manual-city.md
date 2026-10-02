# 出售城市修改权限

2026-10-02。用户要求账号 17302554044 和管理员在发布出售时可以修改所在城市。并入尚未提交的 iOS 1.1.3（123）。

客户端允许指定账号、默认管理员或服务器返回的管理员身份直接填写城市，并保留定位按钮。普通账号继续使用只读定位城市。编辑出售时，授权账号带入已有城市；手动填写会更新草稿，较慢的定位请求不能覆盖新的手动输入，过期的定位请求也不能覆盖新的定位结果。后台重建含多选文件输入的表单时，修复误将文件输入当作多选下拉框而读取 selectedOptions 的错误，保留城市及其他文本草稿。

服务器 verifiedMarketLocation(body, user) 在 locationSource=manual 时，仅接受已认证指定手机号或 isAdminUser(user) 的非空城市。管理员沿用 ADMIN_PHONE 配置。创建和编辑接口均传入 requireReviewUser 验证后的用户；请求体中的 isAdmin、manualCityAllowed 或伪造手机号不授予权限。定位协议仍支持旧客户端；指定账号不能编辑其他卖家的商品。没有修改审核、品种、媒体、内容校验、版本策略或账号权限。

## 本地验证

- scripts/test-market-city-ui.cjs：Chromium、桌面 WebKit 各 10 项通过，覆盖发布、编辑、管理员识别、普通账号定位、空城市、失败定位、后台重建与慢定位结果。
- scripts/test-api-workflows.js：在临时运行目录启动真实本地 API，通过指定账号和配置管理员的创建/编辑/重新读取，拒绝普通账号手动城市、错误 token、空城市及编辑他人商品；同时原有账号、社区、市场流程通过。SMS 为 mock，不访问正式用户数据。
- scripts/test-market-city-deploy.cjs：本地与部署补丁一致、重复执行、行尾保持、未知代码拒绝、剪贴板载荷校验、预检不写入、备份、代码部署及健康失败回滚通过；数据库、环境文件及原有社区模块保持原值。

这些是本地结果。正式服务器部署、真实账号发布、iPhone 输入与定位仍未验证。

## 部署

本地 Git Bash：

```bash
node scripts/copy-market-city-server-command.cjs --clipboard
```

切到已登录的服务器终端，粘贴全部命令执行。命令内嵌压缩后的独立脚本，先校验 SHA256，无需手动上传、公网 IP 或 GitHub Raw。脚本只修改 `/www/turtlekeeper-app/server/server.js` 的已审阅城市函数及两个已认证调用点；其他补丁保留。校验不匹配时拒绝修改。

备份位于 server/backups/market-city-*。部署过程中重启 turtlekeeper-api，检查原有版本策略与匿名认证，失败自动恢复代码并再次检查。部署成功输出仅证明代码安装与匿名健康检查完成，不代表真实用户和真机验收通过。安装后端后更新 123 客户端，再用授权账号测试自有的专用测试商品。
