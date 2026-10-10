# 档案不存在时不提醒
日期：2026-10-10。
客户端在生成今日待办、显示养护提醒、点击记录成长或取消时，按当前账号的实际档案检查关联 ID。关联档案不存在或成长提醒缺少关联 ID 时跳过。普通未关联档案的喂食、换水提醒保留。旧提醒记录不会因界面过滤而被自动删除，养护与成长历史不变。
服务器调度同样检查该账号的当前档案；其他账号同名或同 ID 的档案不能使该提醒生效。修复需分别更新客户端和服务器，本地修改不表示已部署。
服务器补丁只替换 server/server.js 的提醒条件和调度调用，支持重复安装、原文件备份、服务重启后的健康检查及失败回滚；不修改天气/短信凭据、用户数据或强制更新策略。
将 deploy/patches/turtlekeeper-orphan-reminders.tar.gz 上传到服务器 /tmp/turtlekeeper-orphan-reminders.tar.gz 后，执行：

```bash
(
set -e
umask 077
reminder_patch_dir=$(mktemp -d /tmp/turtlekeeper-orphan-reminders.XXXXXX)
tar -xzf /tmp/turtlekeeper-orphan-reminders.tar.gz -C "$reminder_patch_dir"
node "$reminder_patch_dir/scripts/deploy-orphan-reminders.cjs" --check
node "$reminder_patch_dir/scripts/deploy-orphan-reminders.cjs" --apply
)
```

安装器遇到未知服务器代码会在写入前停止，不要全量覆盖 server/server.js。
验证：test-orphan-reminders.cjs 覆盖客户端/服务器过滤、缺失链接、批次链接、账号隔离、推送去重与数据保留；test-growth-reminder-skip.cjs 覆盖首页、提醒列表、旧按钮点击、重载、正常记录及取消流程；test-orphan-reminders-deploy.cjs 覆盖预检、重复安装、未知源码拒绝、安装、回滚与凭据/业务数据保留。
