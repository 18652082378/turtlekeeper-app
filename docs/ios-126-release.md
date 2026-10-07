# iOS 1.1.5（126）试用构建

日期：2026-10-07。客户端与通知扩展的 Debug/Release 版本均为 1.1.5（126），package.json、锁文件及网页构建号保持一致。本机为 Windows，不执行 Xcode 编译、签名或 App Store 上传。

侧滑返回减少拖动迟滞：原生桥接同一时间只执行一次位置传递，忙时合并尚未发送的移动位置，起始、结束及取消事件保留顺序；传递最高拖动距离，确保合并移动后，反向拖回并停顿仍能取消返回。网页收到原生位置立即绘制，拖动期间移除重复触点检测和弹窗扫描；固定层位置先统一测量再修改样式。短滑返回、滚动优先级、未保存确认及网页回退路径保留。

首页每月成长提醒增加“记录成长”和“取消”：取消只跳过本次，立即从今日待办移除，按现有 30 天周期从操作当天顺延。保留成长数据、原提醒开关和养护记录；批次同步顺延在养成员，不修改已转让或损耗档案。通过现有账号保存与同步机制持久化。

龟集市商品详情返回减少刷新跳动：历史浏览、曝光和浏览统计、详情选择及关注状态变化不再重建商品列表，返回保留原列表节点、图片、滚动位置与分页进度，收藏和想要人数原位更新。详情接口省略列表缩略图时，仅对原媒体未变化的商品保留已有封面。商品改价、换图、下架、筛选条件或列表顺序变化仍会使旧列表失效；加载状态恢复时同步底部提示，并继续检查分页。

验证：浏览器导航生命周期、聊天发送与侧滑、成长提醒取消的回归检查；网页构建及 iOS 原生资源同步检查。Swift 桥接传输测试使用从生产插件提取的实际方法，在模拟繁忙 WebView 下检查移动合并、最终位置、事件顺序和错误恢复。Windows 仅生成 Swift 测试文件；GitHub macOS 检查及 Codemagic 构建会执行 Swift 测试，Xcode 构建仍是原生编译验证。

服务器本次不需要补丁。正式更新策略继续最低支持 125，试用 126 可正常使用；本构建不提高正式最低支持版本。

在 Git Bash 上传，然后在 Codemagic 使用 main 最新提交启动 iOS TestFlight：

```bash
(
set -e
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app
git add --pathspec-from-file=scripts/ios-126-release-files.txt
git diff --cached --check
git -c gc.auto=0 -c maintenance.auto=false commit --only \
  -m "Prepare iOS 1.1.5 build 126 with smoother edge back and skippable growth reminders" \
  --pathspec-from-file=scripts/ios-126-release-files.txt
git -c gc.auto=0 -c maintenance.auto=false push origin main
)
```

真机验收：龟集市向下浏览多页，打开有图片和视频的商品详情后侧滑返回，检查列表没有刷新跳动、位置保持，收藏及想要人数正确，继续上滑能加载更多；进入有较多消息的聊天，惯性上下滚动时左边缘短滑返回；慢拖、停顿、反向拖回取消、连续返回；未保存表单确认及取消；取消成长提醒后待办消失，重开 App 不恢复旧提醒。通过后再考虑正式发布。
