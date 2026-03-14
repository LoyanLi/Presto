# Presto Export 手机扫码只读进度设计

## Context
- 当前导出进度只在桌面端 `Export` 页面可见。
- 用户希望在导出期间离开工位时，通过手机扫码查看实时进度。
- 已确认约束：
  1. 手机端仅只读，不提供控制能力。
  2. 手机和电脑在同一局域网（同 Wi‑Fi）。
  3. 每次导出生成临时链接（一次会话）。
  4. 链接在“手动关闭前”持续有效。

## 目标与非目标
### 目标
- 在不改现有导出业务流程的前提下，新增“扫码只读进度查看”。
- 链接安全可控：临时 token + 手动关闭失效。
- 手机页面加载轻量、实时性可接受（1s 轮询）。

### 非目标
- 不支持手机端暂停/停止/重试。
- 不做公网访问与云中转。
- 不重构现有 export backend 接口体系。

## 方案对比
### 方案 A：Electron 主进程内置只读进度服务（推荐）
- 在 Electron 主进程启动一个局域网只读 HTTP 服务。
- 通过 `sessionId + token` 鉴权读取当前导出任务进度。
- 优点：改动集中、与现有导出链路耦合低。
- 缺点：需维护一个轻量本地 HTTP 服务生命周期。

### 方案 B：直接开放现有 export API 到局域网
- 将现有 backend 监听改为 `0.0.0.0` 并复用现有状态接口。
- 优点：复用较多。
- 缺点：暴露面更大，安全风险与回归风险更高。

### 方案 C：云端中转
- 进度上报云端，手机访问云端页面。
- 优点：不依赖同局域网。
- 缺点：复杂度高，不符合当前需求。

**结论：采用方案 A。**

## 架构设计

### 1) 手机只读会话模型
新增 `MobileProgressSession`（主进程内存）：
- `sessionId: string`
- `token: string`（随机高强度）
- `taskId: string`
- `mode: "export"`
- `createdAt: string`
- `active: boolean`
- `closedAt?: string`

生命周期：
- 导出开始后创建会话。
- 手动点击“关闭链接”后置 `active=false`，立即失效。
- App 退出时清空所有会话。

### 2) 主进程本地 HTTP 服务
在 Electron 主进程新增 mobile server（单实例）：
- 监听 `0.0.0.0:<mobilePort>`，默认端口 `18888`，冲突时自增。
- 路由：
  - `GET /mobile/view/:sessionId/:token`
    - 返回手机端简版 HTML（只读进度页）。
  - `GET /mobile/api/export-progress/:sessionId/:token`
    - 返回 JSON 进度数据（从当前 `export_tasks` 映射）。
- 鉴权：
  - `sessionId` 存在
  - `token` 完全匹配
  - `active=true`
  - 任一不满足返回 `404`（不暴露详情）

### 3) 桌面端导出页交互
在现有 `ExportPanel` 新增“手机查看进度”区域：
- `生成二维码`：创建 session，拿到 URL。
- `复制链接`：复制 URL 到剪贴板。
- `关闭链接`：立即失效该 session。
- 显示二维码与短说明（同一 Wi‑Fi 扫码访问）。

说明：
- 不新增独立页面，不改变原导出主流程。
- 二维码仅在当前导出会话期间使用，关闭后不可用。

### 4) 手机页面展示字段（只读）
只展示白名单字段：
- `status`
- `progress`
- `current_snapshot`
- `total_snapshots`
- `current_snapshot_name`
- `updated_at`

不展示：
- 本地绝对路径
- 端口配置
- 日志详情
- 错误堆栈

## 安全策略
1. Token 随机强度
- 至少 128 bit 随机值，URL-safe 编码。

2. 失效策略
- 用户手动关闭即失效（你确认的策略）。

3. 访问范围
- 默认局域网访问；不提供公网穿透。

4. 错误返回
- 鉴权失败统一 404。

## i18n 与文案
新增中英文 key：
- `export.mobile.title`
- `export.mobile.generateQr`
- `export.mobile.copyLink`
- `export.mobile.closeLink`
- `export.mobile.linkClosed`
- `export.mobile.sameWifiHint`
- `export.mobile.viewOnly`

## 验收标准
1. 导出中点击“生成二维码”后，手机扫码可看到实时进度。
2. 手机端只读，无法触发导出控制动作。
3. 点击“关闭链接”后手机页面立即失效。
4. 不影响现有导出运行、停止、错误处理逻辑。

## 风险与缓解
1. 风险：局域网 IP 识别不稳定。
- 缓解：优先选可用 IPv4；无法识别时回退显示 `localhost` 并提示手动替换 IP。

2. 风险：端口占用。
- 缓解：从默认端口开始自动探测可用端口并上报给前端。

3. 风险：手机浏览器缓存旧页面。
- 缓解：API 响应禁缓存头；前端轮询带时间戳参数。
