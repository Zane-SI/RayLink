# App Store 与 ChatGPT App 诊断 — 2026-11-03

本轮没有修改、推送或部署生产配置。用户报告 Mac、iPhone 均受影响，关闭该订阅后恢复；尚未在原生应用中重现并确认根因，不能宣布修复。

## 当前环境与实际规则

- Mac Clash 1.0.15（117），Mihomo 1.19.33，规则模式，TUN/gVisor。
- 从正在运行的 Unix controller 读取配置、规则和连接，核对本地订阅源文件；没有切换活动订阅或策略组。
- ChatGPT 及 OpenAI 相关连接命中 `AI 代理 → raylink-local-vmess`，没有经过 CDN 备用节点。
- App Store 内容域名 `apps.apple.com`、`itunes.apple.com`、`mzstatic.com` 已有前置直连与国内 DNS 策略；账号相关域名也有明确直连。
- 观察到 Apple 推送连接落入 `未分类流量 → 普通代理`，这说明 Apple 服务并非整体直连，但没有证据表明它就是 App Store 内容打不开的原因。

## 请求对照

在当前活动订阅下，用经本地 SOCKS 的请求、经系统 TUN 的请求，以及完整图片下载各测试两轮，共 54 次请求，没有发生传输超时。

| 目标 | 结果 | 验证边界 |
| --- | --- | --- |
| App Store 初始化 bag | 6 次 200，约 0.2～0.9 秒 | 只验证公开初始化接口 |
| App Store catalog（未携带鉴权） | 6 次 401 | 只验证接口与 TLS 响应，不能证明内容加载 |
| 系统日志中两张实际 App Store 图片 | TUN 完整下载 4/4；系统 `sips` 可解码，128×128 | 两张图均为完整 HEIC，不能代表全部内容 |
| ChatGPT 匿名首页 | 6 次 403，含 Cloudflare challenge | 命令行请求会影响网站验证判断；未验证原生 App 登录/会话 |
| OpenAI models（无密钥） | 6 次 401 | 仅验证鉴权端点可达 |
| `cdn.platform.openai.com` 根路径 | 6 次 403，含 challenge | 没有重放 App 的具体资源请求，不能认定资源不可用 |
| Google 204 | 6 次 204 | 网络探测可达 |

另有用于探测的 Apple 网页路径返回 404。该路径没有有效内容断言，不计作 App Store 内容验收。

初次系统日志出现图片请求的 AMSErrorDomain Code 12，但同一批公开图片随后完整下载且系统解码成功；不能单凭该日志确定图片损坏或网络根因。

## AI 住宅上游对照

在服务器读取当前运行配置，仅在内存中使用既有凭据，分别从已配置住宅上游与 VPS 默认出口请求四个公开目标，各重复三次，共 24 次。

- 两种路径均无 curl 传输错误。
- 住宅路径的单请求耗时约 0.7～1.0 秒，VPS 对照约 0.08～0.21 秒；住宅链路额外开销约 0.6～0.9 秒。
- 两种出口的命令行 ChatGPT 首页和 OpenAI CDN 根路径都遇到 challenge，没有“切换到服务器出口即可修复 App”的依据。
- 未更改 AI 出口、住宅协议、凭据或普通流量路径；未登录账号、发送对话或调用计费 API。

## 未完成的关键验收

当前工具无法读取原生 App Store 页面，macOS Accessibility/Screen Recording 权限处于 pending，没有执行 UI 操作。已请用户保持订阅开启、重新打开 App Store“发现”及 ChatGPT App，并提供错误文字与发生时间。尚未收到该次复现结果，也没有 iPhone 的失败连接日志。

下一步要以同一次真实失败为准，关联域名、DNS、TCP/UDP、命中规则、实际节点和错误，分别验证以下假设：

1. Apple 辅助请求存在混合出口或遗漏分流；必须找到失败依赖及其对照，不能直接扩大至所有 Apple/iCloud 域名。
2. AI 上游延迟或网站验证拖慢启动；必须核对原生 App 实际请求，不能把命令行 challenge 当作 App 根因。
3. TUN/DNS 与原生应用行为存在差异；同一接口的 TUN/SOCKS 小样本目前都能返回，不能据此排除其他应用请求。

取得可重复失败后再建立回归测试、修复、原生应用验收与部署。当前不应修改 MTU、切换 AI 公网出口或批量放宽规则。

## 生产保护及证据

只读检查时 RayLink、主 sing-box、CDN、Caddy 全部 active，PID 仍分别为 2221773、1380、2221512、667。主运行配置、CDN 配置和 Caddy 哈希与上次记录一致，原有七个节点未改变。

请求阶段耗时、实际 controller 快照、订阅源快照、原生系统日志及完整图片保存在 Git 忽略的 `.raylink-local/operations/apple-chatgpt-20261103/`，目录 0700、文件 0600；`qa-summary.json` 保存计数与证据哈希。原始配置和日志包含私有信息，不应发布。
