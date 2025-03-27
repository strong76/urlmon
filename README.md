# urlmon
本worker用于按指定的时间周期访问指定的网络地址，如果访问失败可以发信息到指定的Telegram账号


部署步骤说明
第一步：创建KV命名空间
登录Cloudflare仪表板
进入 Workers & Pages → KV
点击 "Create namespace"
输入名称 URL_MONITOR（必须与代码中的常量一致）
点击 "Create"

第二步：创建Worker服务
进入 Workers & Pages → 创建应用程序
选择 "创建Worker"
给Worker命名（例如 url-monitor）
点击 "部署"

第三步：绑定KV到Worker
在Worker编辑页面 → 设置 → 变量
在 "KV 命名空间绑定" 部分：
变量名称：URL_MONITOR（必须与代码中的常量一致）
KV命名空间：选择之前创建的 URL_MONITOR
点击 "保存"

第四步：配置定时任务
在Worker编辑页面 → 触发器 → 添加 Cron 触发器
设置Cron表达式：* * * * *（每分钟执行一次）
点击 "保存"
第五步：部署代码
用完整代码替换默认的Worker代码
点击 "保存并部署"

使用说明
访问你的Worker地址（格式：https://<worker-name>.<your-account>.workers.dev）
使用配置的账号密码登录（默认 admin/password，可在代码处根据需要修改）
在文本框中输入要监控的URL（每行一个）
设置检查频率（分钟）
点击保存配置
Worker会自动按设定频率检查所有URL
页面会实时显示最近一次检查结果

Telegram警报设置：
设置环境变量：
TELEGRAM_BOT_TOKEN: 通过 @BotFather 获取
TELEGRAM_CHAT_ID: 通过 @userinfobot 获取
具体方法：
实现Telegram报警通知的完整方案：
第一步：创建Telegram Bot
在Telegram中搜索 @BotFather
发送 /newbot 创建新机器人
记录生成的API Token（格式：123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11）
获取Chat ID：
给 @userinfobot 发送任意消息
