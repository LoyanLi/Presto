# 后端能力层

本文档只描述 `backend/presto/` 当前已经成立的后端结构。

## 1. 后端定位

当前后端是本地运行的 `FastAPI` 服务，不是公网业务 API。

它只负责三件事：

1. 提供稳定的本地 HTTP 能力入口
2. 装配 capability handler、作业管理和错误模型
3. 把具体 DAW 行为下沉到适配器和自动化集成

## 2. 入口与路由

入口文件是 `backend/presto/main_api.py`。

当前入口会：

- 创建 `FastAPI(title="Presto Backend API", version="0.3.2-1")`
- 调用 `build_service_container()`
- 挂载 `/api/v1`
- 注册 `PrestoError` 和通用异常处理器

当前 HTTP 路由集中在 `backend/presto/transport/http/routes/`：

- `health.py`
- `capabilities.py`
- `invoke.py`
- `jobs.py`

其中 capability 主入口是：

- `POST /api/v1/capabilities/invoke`

## 3. Service Container 是后端中心

`backend/presto/application/service_container.py` 当前统一装配后端依赖。

它聚合的核心对象包括：

- `capability_registry`
- `job_manager`
- `error_normalizer`
- `daw`
- `config_store`
- `keychain_store`
- `mac_automation`
- `daw_ui_profile`
- `import_analysis_cache`
- `target_daw`
- `backend_ready`

默认装配事实：

- `daw` 是 `ProToolsDawAdapter(address="127.0.0.1:31416")`
- `daw_ui_profile` 是 `ProToolsUiProfile()`
- `mac_automation` 来自 `create_default_mac_automation_engine()`
- `config_store` 是 `InMemoryConfigStore()`
- `keychain_store` 是 `InMemoryKeychainStore()`
- `job_manager` 是 `InMemoryJobManager()`

这里必须明确：

- 当前配置和 keychain 仍是进程内内存实现，不是正式持久化存储。

## 4. 当前后端分层

### 4.1 Transport

目录：`backend/presto/transport/http/`

职责：

- 解析 HTTP 请求
- 输出 schema
- 把请求转给应用层

### 4.2 Application

目录：`backend/presto/application/`

职责：

- capability registry
- handler 协调
- job manager
- service container
- error normalizer

### 4.3 Domain

目录：`backend/presto/domain/`

职责：

- capability 抽象
- 端口定义
- 错误模型
- 任务模型

### 4.4 Integrations

目录：`backend/presto/integrations/`

职责：

- `integrations/daw/protools_adapter.py`
- `integrations/mac/automation_engine.py`
- `integrations/mac/protools_ui_profile.py`

这一层才承接对 Pro Tools 和 mac 自动化的具体实现。

## 5. Capability 调用模型

后端的正式业务主入口不是资源式 REST，而是 capability invoke envelope。

关键链路：

- 路由：`transport/http/routes/invoke.py`
- 执行：`application/handlers/invoker.py`

请求核心字段：

- `requestId`
- `capability`
- `payload`
- `meta`

响应分为两种 envelope：

- 成功：`success = true`
- 失败：`success = false`

这套模型是为了统一：

- Renderer 到后端
- 插件到后端
- SDK 到后端

## 6. Capability 清单来自哪里

后端能力目录不是手写散落维护的。

当前事实是：

- `packages/contracts-manifest/` 提供 capability 清单事实源
- `scripts/generate-contracts.mjs` 生成共享产物
- `backend/presto/application/capabilities/catalog.py` 使用生成结果

所以新增 capability 的顺序必须是：

1. 先改 `contracts` 与 manifest 事实源
2. 生成共享产物
3. 再改后端和前端实现

## 7. 错误处理模型

当前错误处理是统一收口的：

1. handler 或 integration 抛出 `PrestoError` 或普通异常
2. `ErrorNormalizer` 归一化错误
3. `main_api.py` 的异常处理器输出统一错误响应

这保证 capability 调用方看到的错误结构是一致的。

## 8. 当前真实支持边界

- `target_daw` 当前实际只允许 `pro_tools`
- HTTP 只是本地进程间通信载体，不是对外开放平台 API
- 后端默认状态依赖本地 Python 和 Pro Tools 集成，不应被文档写成通用多 DAW 能力服务
