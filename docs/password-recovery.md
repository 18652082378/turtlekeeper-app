# 手机验证码找回密码
日期：2026-10-09；客户端并入 1.1.7（132）。

登录页“忘记密码？”进入找回页面，填写注册手机号、短信验证码及两次新密码。验证码按钮可在填写新密码之前使用。验证码有效期 5 分钟、60 秒重发冷却；重置挑战最多校验 5 次，成功后只可用一次。注册/普通验证的验证码和“已验证手机号”标记都不能用来重置密码。修改成功返回登录页并保留手机号，清空密码；不自动登录。密码采用现有 scrypt 哈希，新盐；撤销全部账号会话和旧推送设备绑定，不修改档案、养护、聊天或其他业务数据。真实短信不回传验证码。

已接入当前阿里云短信/号码认证服务，无需新增短信服务凭据。未配置后端的原型不提供模拟重置入口；生产服务器必须安装下列补丁后功能才能使用。不会修改现有 .env、天气配置、数据库模式或强制更新策略。

## 本机准备
在项目 Git Bash 中运行已有上传脚本，把 132 代码推送到 Git，然后在 Codemagic 构建 1.1.7（132）。补丁只改服务器四处明确锚点并新增 password-recovery.js，不用整文件覆盖线上 server.js。

本地生成的部署包：deploy/patches/turtlekeeper-password-recovery.tar.gz。
把该文件上传到服务器 /tmp/turtlekeeper-password-recovery.tar.gz，随后在服务器终端运行：

```bash
(
set -eu
patch_dir=$(mktemp -d /tmp/turtlekeeper-password-recovery.XXXXXX)
tar -xzf /tmp/turtlekeeper-password-recovery.tar.gz -C "$patch_dir"
node "$patch_dir/scripts/deploy-password-recovery.cjs" --check
node "$patch_dir/scripts/deploy-password-recovery.cjs" --apply
)
```

--check 检查代码锚点、模块校验和、单实例 PM2、匿名鉴权和版本策略。--apply 先备份到 server/backups，再安装并重启 turtlekeeper-api；健康检查失败时恢复原代码。未知服务器代码将停止安装。部署不会发短信、改用户密码或修改版本策略。

本轮只完成本地实现、隔离测试和补丁准备，未连接正式服务器或发送真实短信。安装后用自己的测试手机号验证真实短信、密码重置和重新登录，再发布客户端。

## 本地验证结果

密码业务单元测试、真实隔离服务器与浏览器完整重置流程、注册回归、既有 API 工作流回归，以及部署补丁安装和重启失败回滚均通过。浅/深主题的 320、390、1280px 表单检查通过；短信为模拟服务，未发送真实短信或在真机测试。
