# 龟友原创小表情

根据用户提供的 11.7 秒参考录屏，保留常用情绪、手势与物件的表达含义，重新用矢量路径绘制 114 张图案。没有提取参考软件的图片，也没有用系统 emoji 字符替代原创图。

图案采用暖金色表情、绿色配件与简化线条。跳跳／发抖／转圈用原创小龟表现动作。均为透明背景 SVG，96×96 的坐标系，评论与聊天内联显示，1–3 个纯表情的私信使用较大尺寸。当前为静态小表情。

## 范围

- 龟友圈帖子详情评论和私信输入栏加入表情入口。
- 评论栏只保留输入框及其右侧的一个原创线条笑脸，不显示旁边的发送或“＋”按钮；原有 114 张表情库保留。笑脸源图为 `assets/comment-smile-entry.svg`，由绘制脚本同步生成。
- 支持全部、最近、心情、手势、心意、庆祝六个入口；最近最多保留 16 个，按本地账号分别保存。
- 保留原输入框和草稿。在当前光标或选区插入表情，切换回键盘保留位置；面板中可以删除、发送。
- 表情面板与系统键盘、聊天相册／拍摄面板共用底部位置。输入栏随面板上移；为底部内容预留空间。
- 输入长度仍使用原评论 500、消息 1000 字符限制；禁止输入超限时截断表情标记。删除完整表情标记，也支持完整删除多码点系统 emoji。
- 发送仍走原评论和私信 API，保留既有重试、去重及账号隔离流程。失败保留文字、表情及回复对象。
- 评论、评论通知、最新评论预览和私信正文识别表情。文字和未知标记仍做 HTML 转义；表情图片只从本地白名单读取，不接受消息提供的图片网址。
- 复制／引用消息仍使用原始文字，旧版本可以显示 `[微笑]`、`[爱心]` 等可读标记。发送的数据没有 SVG 或 HTML；服务器无需为表情新增数据字段。

## 评论发送与系统键盘边界

用户已明确，“右下角发送”指系统键盘上的按键。本轮完成评论栏结构、原创笑脸，以及键盘 Enter 发送逻辑：空白内容不会提交；中文输入法组合输入的确认键不会触发发送；有效内容调用原评论接口，保留重复提交保护和失败草稿。

`enterkeyhint="send"` 用于表达系统键盘的发送用途，`required` 表达字段必填。系统键盘按键的灰色禁用外观和输入后绿色外观没有在本轮实现，不能用表情面板按钮的灰绿状态代替该需求的完成情况。浏览器测试也无法证明系统按键颜色已改变。

核对依据：[WebKit 的 enterKeyHint 到 UIReturnKeySend 映射](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/ios/WKContentViewInteraction.mm)，以及 Apple 的 [enablesReturnKeyAutomatically](https://developer.apple.com/documentation/uikit/uitextinputtraits/enablesreturnkeyautomatically) 原生文本控件属性。当前评论使用 WebView 的 HTML 输入框，没有接入原生 UITextField 的自动启用返回键功能。应用内表情面板的发送按钮则已实现空内容为灰色且禁用、有文字或表情时为绿色。

## 文件

- `assets/turtle-emotes.js`：稳定的图案 ID、文字标记与安全显示逻辑。
- `assets/emotes/*.svg`：114 张原创图。
- `scripts/create-turtle-emotes.cjs`：可复现的原创绘制源代码。
- `assets/turtle-emote-picker.js` 与 `assets/turtle-emotes.css`：输入面板和显示样式。
- `scripts/test-turtle-emotes-ui.cjs`：使用合成账号、帖子与拦截 API 的自动检查，禁止访问真实用户数据。

预览图在 `output/turtle-original-emotes.png`；手机界面模拟图在 `output/turtle-emotes/{ios,android}/`。两端浏览器内核的测试只验证前端行为，不能替代真机系统键盘与第三方输入法测试。本次没有推送 GitHub、上传服务器、构建签名安装包或发布商店；新增资源需要随手机 App 一起打包。版本号未变更。

本轮检查通过：114 个矢量文件在两种浏览器内核正常解码；iOS/WebKit 和 Android/Chromium 各 9 组表情与评论入口工作流、16 项布局（280–430px、浅色／深色）；原评论交互 iOS 18 组、安卓 17 组及各 40 项布局；聊天发送重试／重复提交／返回手势在 WebKit 19 组、Chromium 20 组；两端 338 项共享资源一致、iOS 插件和原生资源验证。表情交互报告为 `output/turtle-emotes-ios-webkit.json` 与 `output/turtle-emotes-android.json`。上传清单收录了新增源代码与全部矢量资源，没有收录用户录屏、视频截图或测试账号数据。
