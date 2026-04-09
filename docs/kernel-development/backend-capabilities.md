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

- 从 `backend/presto/version.py::VERSION` 读取版本，并创建 `FastAPI(title="Presto Backend API", version=VERSION)`
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
- `import_analysis_store`
- `job_handle_registry`
- `mac_automation`
- `daw_ui_profile`
- `target_daw`
- `backend_ready`

默认装配事实：

- `target_daw` 先来自 `PRESTO_TARGET_DAW`，如果不在支持列表内则回退到 `DEFAULT_DAW_TARGET`
- `DEFAULT_DAW_TARGET`、`SUPPORTED_DAW_TARGETS` 和 `DawTarget` 不是手写散落常量；它们来自 `domain/daw_targets_generated.py`
- `daw`、`daw_ui_profile`、`mac_automation` 不是直接散落硬编码在 container 里，而是统一通过 `application/daw_runtime.py::resolve_daw_runtime(...)` 解析
- 当前唯一已接通的 runtime factory 仍然是 `pro_tools`
- `config_store` 通过 `integrations/config_store.py::create_default_config_store()` 解析：
  - 如果没有 `PRESTO_APP_DATA_DIR`，回退到 `InMemoryConfigStore()`
  - 如果存在 `PRESTO_APP_DATA_DIR`，则持久化到 `<PRESTO_APP_DATA_DIR>/config.json`
- `keychain_store` 是 `InMemoryKeychainStore()`
- `job_manager` 是 `InMemoryJobManager()`

这里必须明确：

- keychain 目前仍是进程内内存实现。
- config 是否持久化取决于宿主是否注入 `PRESTO_APP_DATA_DIR`；桌面 Tauri 正式路径会注入这个环境变量。

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
- handler 绑定：`application/handlers/registry.py`

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

当前实现还有两条边界事实：

- `invoker.py` 会基于 `ServiceContainer` 为每次请求构造一份 `CapabilityExecutionContext`，再直接调用 registry 中绑定的 handler。
- `workflow.run.start` 仍是特殊入口，但它递归调用的也只是同一条原子 capability 执行链，而不是另一套隐藏协议。
- `system.health` 和 `daw.connection.getStatus` 现在是纯查询 handler：只读取当前 `safe_connection_status(ctx)`，不会为了返回状态而调用连接建立逻辑。

## 6. Capability 清单来自哪里

后端能力目录不是手写散落维护的。

当前事实是：

- `packages/contracts-manifest/capabilities.json` 提供 capability 清单事实源
- `packages/contracts-manifest/daw-targets.json` 提供 DAW target 事实源
- `scripts/generate-contracts.mjs` 同时生成 capability catalog 和 DAW target 共享产物
- `backend/presto/application/capabilities/catalog.py` 使用生成结果
- `backend/presto/domain/capabilities.py` 通过 `domain/daw_targets_generated.py` 读取 `DawTarget`、`DEFAULT_DAW_TARGET`、`RESERVED_DAW_TARGETS` 和 `SUPPORTED_DAW_TARGETS`

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
- `logic`、`cubase`、`nuendo` 当前只属于 `RESERVED_DAW_TARGETS`，不是已接通运行时
- HTTP 只是本地进程间通信载体，不是对外开放平台 API
- 后端默认状态依赖本地 Python 和 Pro Tools 集成，不应被文档写成通用多 DAW 能力服务
- 当前所谓“多 DAW 扩展”只成立在 runtime dependency resolver 这个接缝上，不能写成已经完成多 DAW 能力平台化。
