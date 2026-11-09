# 统一客户端分流

基线：`71fbdc914a5c98b536b5fa441fd0266b8487fdb4`。用户要求把已验证的 Mac 本地分流策略迁移到服务器，更新、测试并部署，避免逐设备维护覆写。

## 行为

- 服务器依据同一 routingPolicy 和每个 User 的真实授权节点生成完整 sing-box、Mihomo、Mihomo-modern、Egern 配置。不得硬编码 Mac 节点名称或越过固定 AI Host 的权限约束。
- 智能模式保留局域网、自定义、AI、明确境外、国内域名、解析后的私网/国内 IP 的优先级。末尾进入 `未分类流量` 选择组，默认普通代理，可由客户端手动切直连；全局代理/直连模式原行为不变。
- 增加独立 `aiSelection: fallback | manual`。旧配置默认 fallback；旧客户端省略此字段保存其他路由或出口配置时保留已选方式。manual 的 AI 选择器只包含具体授权节点，不引用自动组；主机不可用时拒绝 AI，不扩大候选。
- 保留 native AI Host 候选信息供其他格式转换，不能因去掉自动入口而误判主机无节点。
- 管理界面及 MCP 可以读写 AI 选择方式，明确固定 Host 与手动固定协议的区别。服务器无法读取客户端已保存的手动选择，诊断必须说明此限制。
- Google 香港域名明确使用普通代理和远程 DNS，不受未知流量选择影响；AI Google 子域保持更高优先级。
- Mihomo fake-IP 排除项在固定拨号域名之外补充 localhost、local、lan、home.arpa；不改变客户端系统代理或 Apple Network Extension 权限。
- 不增加广告、流媒体、下载分类，不改住宅出口开关、不改节点凭据、用户用量或服务器代理 Runtime。

## 验收接口

已授权的公共边界：路由设置 HTTP/MCP、完整订阅生成器、客户端表单、原生核心的真实隔离网络请求，以及部署后的完整订阅与 Mac 实际新连接。验证权限、旧字段兼容、规则与 DNS 顺序、未知组切换、AI 固定失败不自动回退、订阅刷新持久性。

## 发布与迁移

v0.2.44，沿用正式构建、校验、备份与升级流程。当前生产策略保留 smart / pinned local，在保存完整原规则的前提下启用 manual。Runtime 不需重启。此次部署启用可选的保留数据回滚；在候选数据库副本的结构和 user_version 确認未变化前拒绝采用该模式，失败仅恢复程序，避免恢复旧库覆盖新用量。通用升级的默认行为不变。Mac 先刷新完整订阅，再取消本地覆写并核对活动配置和真实请求。其他设备更新完整订阅；仅节点的 Egern/Loon 格式不携带规则。不能将 Mac/原生测试声明为全部手机或 AI 账号业务验收。

### 按服务匹配，继续使用三个主组

智能分流继续使用 **普通代理 / AI 代理 / 未分类流量**。Mihomo 与 Egern Profile
标记内部测速、回退和兼容组为隐藏，组名及其候选节点保留。sing-box 的显示方式由前端决定；
节点列表格式（Loon、Egern）不携带完整分流规则。

- 国内应用：对微信、抖音、淘宝、支付宝、京东、B 站、小红书等已知域名及专用媒体域名直连。
  未知域名、共享 CDN 继续用原有国内域名和 IP 规则，不把整个 CDN 加入直连。
- App Store：商店、下载和 Apple 账号依赖走直连，包括 iOS 替代应用市场域名。
  其他 Apple/iCloud 域名不因此强制直连。
- Tailscale：控制面和 DERP 走直连，保留客户端已有的 Tailnet 私网旁路；
  不把所有 `ts.net` 域名当作私有 DNS 或流量。
- Google 和 YouTube 各自识别，均使用普通代理。YouTube API 优先于共享的 Google API 后缀。
  Google 搜索、账号、Drive 与 YouTube 播放、嵌入和媒体不走 AI 住宅出口。
- AI：ChatGPT、Claude、Gemini 及相关登录和资源域名保留现有 AI 规则；
  Gemini 和 AI Studio 优先于通用 Google。是否走住宅出口仍由原有 AI 设置决定。

保持局域网和自定义规则优先；Tailscale、App Store、AI 服务规则先于广告拦截，
其余已知服务在广告拦截之后、通用地理规则之前。未知 DNS 的国内地址校验和远端回退保持原状。
服务范围参考 [Apple 企业网络域名](https://support.apple.com/en-us/101555)、
[Tailscale 控制与 DERP](https://tailscale.com/docs/reference/faq/firewall-ports)、
[YouTube 嵌入](https://support.google.com/youtube/answer/171780) 和
[Egern 策略组配置](https://egernapp.com/docs/configuration/policy_groups/)。
