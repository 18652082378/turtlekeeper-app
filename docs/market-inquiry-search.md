# 商品咨询码查找

在龟集市点击搜索框，粘贴完整商品咨询码（例如 KM-ABC123），点击“搜索”，再点击匹配商品进入详情。也可直接粘贴“复制咨询内容”得到的整段文字，软件会提取其中标注的咨询码。

代码不区分大小写，搜索历史保存规范化代码。按咨询码查找时清除品种阶段、地区、交付方式及新发布筛选，只按咨询码匹配当前可见的在售商品。普通关键词搜索保留原来的筛选行为。

咨询码沿用现有生成规则：商品 ID 去掉非字母数字字符后的末尾六位，加 KM- 前缀。既有咨询码无需更换。六位短码可能重复，因此所有符合当前权限的同码商品都展示，提示核对图片、标题和卖家；不会自动跳转到第一项，也不会将标题中恰好出现代码的无关商品当作匹配。已售出、下架、删除或不可见的商品不进入在售搜索结果。

## 服务器部署状态

本地客户端、旧版列表接口和新版排名分页均已接入。正式服务器尚未部署，安装客户端本身不能使旧服务器支持代码查找。

专用补丁：deploy/patches/turtlekeeper-market-inquiry.tar.gz，旁边的 .sha256 为校验文件。补丁只修改 server/server.js 的咨询码查找逻辑、server/market-ranking.js 的排名筛选逻辑，并添加 assets/market-inquiry.js。不会修改账号记录、凭据或版本策略。

需要部署时，将压缩包和校验文件上传到服务器 /tmp，在服务器终端运行：

```bash
(
set -euo pipefail
cd /tmp
sha256sum -c turtlekeeper-market-inquiry.tar.gz.sha256
inquiry_patch_dir=$(mktemp -d /tmp/turtlekeeper-inquiry.XXXXXX)
tar -xzf turtlekeeper-market-inquiry.tar.gz -C "$inquiry_patch_dir"
node "$inquiry_patch_dir/scripts/deploy-market-inquiry.cjs" --check
node "$inquiry_patch_dir/scripts/deploy-market-inquiry.cjs" --apply
)
```

安装器验证准确的代码片段、辅助模块校验和、单个 PM2 API 进程和现有健康接口；未知代码拒绝安装。安装前在 server/backups/market-inquiry-* 保存代码备份，重启后最多等待 90 秒确认健康与原版本策略一致，失败会恢复旧代码并检查恢复后的服务。找回密码与缺失档案提醒补丁仍是独立部署。

## 验证

- scripts/test-market-inquiry.cjs：格式、大小写、长咨询文字、短码重复、分页、排除标题误匹配与非在售商品；启动隔离本机 API 检查旧列表/排名接口、商品详情、卖家手机号不泄露及账号数据不变。
- scripts/test-market-inquiry-ui.cjs：本地/模拟云端实际页面提交、筛选重置、完整内容粘贴、历史、详情选择与空态；320、390、1280px 浅深主题共 12 个结果布局。
- scripts/test-market-inquiry-deploy.cjs：准确代码和模块校验、CRLF、幂等、只读预检、安装、未知版本拒绝和失败回滚，保留凭据、数据及版本策略。
- 既有排名、排名分页、独立搜索、更新说明及 iOS 资源检查。

浏览器与 API 仅使用虚构商品和账号；没有访问正式用户数据或执行正式部署。
