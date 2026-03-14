---
title: Presto v0.2 Phase5 执行更新 2026-03-14（完整）
status: completed
date: 2026-03-14
branch: codex/v0.2
---

# Presto v0.2 Phase5 执行更新（完整）

## Phase5 目标
- 将 Import / Export / Electron / 前端页面错误提示统一到同一协议。
- 默认展示“用户可执行信息”，技术细节折叠展示。
- 错误文案跟随本地 App 语言（`zh-CN` / `en-US`），避免中英混杂。

## 本次完整更新范围
- 覆盖端到端链路：
  - 后端（import/export）统一错误 payload
  - Electron 保留结构化错误透传
  - 前端统一错误归一与展示组件
  - 设置页与开发者页接入
  - 导入/导出流程接入
  - 开发者页报错测试器
  - i18n 错误码映射与本地语言兜底

## 已完成变更（按里程碑）

### 里程碑 A：统一 FriendlyError 协议与后端错误目录
1. Import 侧错误目录新增
- `backend/import/presto/web_api/error_catalog.py`
- 提供 `build_friendly_error(error_code, message, details)`。
- 覆盖常见错误码并包含 fallback。

2. Export 侧错误目录新增
- `backend/export/api/error_catalog.py`
- 与 Import 侧统一返回结构。

3. Schema 扩展
- `backend/import/presto/web_api/schemas.py`
- `ApiError` 增加 `friendly` 字段类型。

### 里程碑 B：后端异常响应统一
1. Import FastAPI 异常统一
- `backend/import/presto/web_api/server.py`
- `PrestoError` / `HTTPException` / `Exception` 都输出统一错误协议。

2. Import 路由错误码补齐
- `backend/import/presto/web_api/routes_import.py`
- 空任务请求返回 `NO_ITEMS`（结构化 detail）。

3. Export FastAPI 异常统一
- `backend/export/main.py`
- 统一将 HTTP 与全局异常转换为 FriendlyError 结构。

### 里程碑 C：Electron 结构化错误透传
1. 网络层错误保真
- `frontend/electron/main.ts`
- `frontend/electron/main.mjs`
- 非 2xx 响应优先解析 JSON 错误体，保留 `error_code/friendly/details`。
- 通过 `__PRESTO_API_ERROR__` 前缀把结构化错误传回渲染层。

### 里程碑 D：前端统一错误归一与展示
1. 错误归一适配器新增
- `frontend/src/errors/normalizeAppError.ts`
- 支持：
  - 直接 `ApiError`
  - Electron 前缀错误
  - Axios 风格 `response.data`
  - 普通 Error fallback

2. 通用错误组件新增
- `frontend/src/components/feedback/ErrorNotice.tsx`
- 默认展示：`title/message/actions`
- 折叠展示：`error_code/technical_message/details`

3. 统一错误类型扩展
- `frontend/src/types/common.ts`
- 增加 `FriendlyErrorPayload` 相关定义。

### 里程碑 E：页面与业务流程接入
1. Settings 接入
- `frontend/src/features/settings/SettingsPage.tsx`
- 全部错误改用 `normalizeAppError + ErrorNotice`。

2. Developer 接入 + 报错测试器
- `frontend/src/features/settings/DeveloperPage.tsx`
- 后端错误统一展示。
- 新增“报错测试器”：
  - 样例一键加载
  - 自定义 JSON 预览
  - JSON 非法错误提示

3. Import Workflow 接入
- `frontend/src/features/import/ImportWorkflow.tsx`
- 运行态错误与流程错误统一走 FriendlyError 展示。

4. Export 接入
- `frontend/src/features/export/track2do/services/api/exportApi.ts`
- `frontend/src/features/export/track2do/components/ExportPanel.tsx`
- 保留结构化错误，不再过早包成纯字符串。

### 里程碑 F：本地语言优先显示（本次补充）
1. 错误展示层改造
- `frontend/src/components/feedback/ErrorNotice.tsx`
- 展示顺序改为：
  - 优先 `error.code.<CODE>.*`（当前 locale）
  - 若无，则 `error.default.*`（当前 locale）
  - 再兜底已有文案

2. i18n 错误码映射补齐
- `frontend/src/i18n/index.tsx`
- 新增：
  - `error.default.*`
  - 常见 import/export/dev 错误码 `error.code.<CODE>.title/message/actionN`
- 覆盖中英文，确保同一错误码在不同语言下统一切换。

## 新增测试
- `backend/tests/test_error_catalog.py`
- `backend/tests/test_import_error_payload.py`
- `backend/tests/test_export_error_catalog.py`

## 验证结果
1. 后端测试
- `python3 -m pytest -q backend/tests/test_error_catalog.py backend/tests/test_import_error_payload.py backend/tests/test_export_error_catalog.py`
- 结果：`pass`

2. 前端类型检查
- `npm --prefix frontend run typecheck`
- 结果：`pass`

## 最终行为说明
1. 错误展示统一
- Import / Export / Settings / Developer 全部使用同一错误呈现模型。

2. 用户优先
- 默认看到可执行建议，不直接暴露技术噪音。

3. 技术可诊断
- 技术详情可展开，保留 `error_code`、原始 message、details。

4. 多语言一致
- 错误文案最终以当前 App 语言渲染；同一错误码不会再出现“后端中文 + 前端英文”混显。

## 文档收敛说明
- Phase5 设计稿已移除，保留本执行更新文档作为唯一 Phase5 记录。
