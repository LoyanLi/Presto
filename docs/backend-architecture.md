# Presto 后端架构

本文档面向 Presto 内部开发者，描述当前后端的真实结构、能力调用模型、依赖装配方式和 DAW 适配边界。后端的核心职责不是提供一个传统业务 Web API，而是承接桌面宿主发起的能力调用，并把这些调用映射到受控的业务处理器和 DAW 集成层。

## 1. 后端定位

当前后端是一个基于 `FastAPI` 的本地能力服务，主要运行于桌面宿主拉起的本地进程中。它的职责有且只有三类：

1. 对外提供稳定的 HTTP 能力入口。
2. 在应用层组装能力处理器、任务管理和错误模型。
3. 把具体 DAW 行为下沉到适配器与自动化引擎。

这意味着它不是面向公网部署的通用后端，也不是“什么都能放”的业务容器。

## 2. 当前代码分层

后端当前分为四层：

### 2.1 传输层

目录：

- `backend/presto/transport/http/*`

职责：

- 定义 HTTP 路由
- 请求/响应 schema 解析
- 把 HTTP 请求映射到应用层
- 输出统一响应格式

典型路由：

- `/api/v1/health`
- `/api/v1/capabilities/invoke`
- jobs 相关路由

传输层不应承载业务规则，它只负责“接”和“发”。

### 2.2 应用层

目录：

- `backend/presto/application/*`

职责：

- capability handler 实现
- service container 装配
- 错误归一化
- 任务管理

应用层是后端真正的协调层。它知道“如何调用领域与集成对象”，但不应该自己变成底层集成实现。

### 2.3 领域层

目录：

- `backend/presto/domain/*`

职责：

- 定义错误模型
- 定义能力协议与端口
- 定义任务契约

领域层的存在意义是把应用层依赖的核心抽象拉平，而不是堆放工具函数。

### 2.4 集成层

目录：

- `backend/presto/integrations/*`

职责：

- DAW 适配
- macOS 自动化集成
- Pro Tools UI profile

当前集成层里最重的实现是 `integrations/daw/protools_adapter.py`，它承担了大量对 `py-ptsl` 和 Pro Tools 指令的映射。

## 3. 入口与应用创建

后端入口是 `backend/presto/main_api.py`。

当前实现做了以下事情：

- 创建 `FastAPI(title="Presto Backend API", version="0.1.0")`
- 通过 `build_service_container()` 构建应用依赖
- 挂载统一路由前缀 `/api/v1`
- 注册 `PrestoError` 和通用异常处理器

这里有一个重要事实：

- 应用实例是轻量入口。
- 真实依赖和业务对象不是在路由文件里临时创建，而是由 service container 统一装配。

这保证了后端入口是可测试、可替换、可集中演进的。

## 4. Service Container 设计

`backend/presto/application/service_container.py` 是当前后端结构的中心。

当前容器聚合了这些核心对象：

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

### 4.1 为什么需要 container

因为当前后端不是按 ORM 或数据库资源组织，而是按“能力调用 + 外部集成”组织。若没有 container，handler 将会直接散落地构造：

- DAW 适配器
- 错误归一化器
- 任务管理器
- 配置存储

这会导致两类问题：

1. 生命周期不清晰
2. 测试替换点消失

### 4.2 当前默认装配

当前 `build_service_container()` 的默认装配事实如下：

- DAW：`ProToolsDawAdapter(address="127.0.0.1:31416")`
- UI Profile：`ProToolsUiProfile()`
- mac automation：`create_default_mac_automation_engine()`
- config store：`InMemoryConfigStore()`
- keychain store：`InMemoryKeychainStore()`
- job manager：`InMemoryJobManager()`
- capability registry：`build_default_capability_registry()`

这说明当前后端默认是一套“本地进程内内存实现 + Pro Tools 适配”的组合。

这里要补一个当前实现事实：后端能力目录并不是手写维护一份独立清单。`backend/presto/application/capabilities/catalog.py` 直接引用生成产物 `catalog_generated.py`，其来源是 `packages/contracts-manifest` 经 `scripts/generate-contracts.mjs` 生成的能力定义。

### 4.3 当前配置存储现实

当前配置与 keychain 存储都还是内存实现，不是持久化存储。这在文档中必须明确写清楚，否则会误导开发者把它理解为已落盘系统。

## 5. 能力调用模型

当前后端最核心的 API 不是 REST 资源模型，而是“capability invoke”模型。

关键入口：

- 路由：`transport/http/routes/invoke.py`
- 执行器：`application/handlers/invoker.py`

请求结构包含：

- `requestId`
- `capability`
- `payload`

响应结构是 envelope：

- 成功：`success=true + data`
- 失败：`success=false + error`

### 5.1 这样设计的原因

当前 Presto 要承载的不是单一业务对象 CRUD，而是：

- DAW 连接
- 轨道操作
- Session 操作
- 导入导出工作流
- 自动化执行
- 任务状态

这些能力跨域很强，不适合勉强包装成资源 REST 风格。用 capability envelope 可以保持：

- 协议统一
- 前端 SDK 装配简单
- 插件权限声明明确
- 错误归一化路径统一

### 5.2 handler 的职责边界

handler 应该做的事：

- 校验必填字段
- 根据 capability 读取依赖
- 协调 job manager / DAW adapter / config store
- 组织返回 payload

handler 不应该做的事：

- 发明新的对外协议结构
- 在多个地方重复能力 ID 与 schema 逻辑
- 越过 container 直接构建底层依赖

## 6. 错误模型

后端的错误处理是两段式：

1. 应用层与集成层抛出 `PrestoError` 或普通异常
2. `ErrorNormalizer` 将其统一转换为前端可消费的错误结构

`main_api.py` 中统一注册了异常处理器，这意味着：

- 路由不需要各自重复 try/catch 模板
- 错误 envelope 输出格式可统一治理
- capability 调用可以稳定依赖错误 code/message/details 结构

这是 SDK 和插件调用体验稳定的基础。

## 7. 健康检查与就绪语义

`/api/v1/health` 当前返回的核心字段包括：

- `backend_ready`
- `daw_connected`
- `active_daw`

需要注意：

- 当前 `daw_connected` 并不是完整反映实时 DAW 连接状态的通用健康模型。
- 它更接近一个宿主监督器用于确认后端可用性的轻量探针。

因此，不能把 health 接口误写成“完整系统状态总览”。

## 8. Jobs 模型

当前后端包含 `application/jobs` 与 `domain/jobs`，并由 `InMemoryJobManager` 提供任务管理实现。这意味着：

- 长流程能力不是靠前端轮询零散状态拼接，而是可以通过 jobs 统一观察。
- 导入导出等流程型能力天然应该落到 jobs 模型里，而不是塞回普通同步 query/command。

如果后续新增明显长耗时流程，应优先复用 jobs，而不是新增一套并行任务系统。

## 9. DAW 适配边界

当前后端真正接触 DAW 的地方是集成层，尤其是：

- `integrations/daw/protools_adapter.py`
- `integrations/mac/automation_engine.py`
- `integrations/mac/protools_ui_profile.py`

### 9.1 当前事实

- 当前实际生产目标是 `pro_tools`
- 适配器大量依赖 `py-ptsl`
- 自动化能力与 UI profile 也围绕 Pro Tools 建立

### 9.2 文档边界

虽然类型定义中出现了更多 DAW target，但当前后端文档只能把这些称为“类型预留”，不能称为已实现多 DAW 后端。

## 10. 后端对外稳定面

当前后端对前端与插件真正稳定的外部面有两类：

1. `/api/v1/*` HTTP 接口
2. `packages/contracts` 中定义的 capability 协议

其中真正更高优先级的是第二类。因为 HTTP 路由只是传输形式，真正的稳定契约是：

- capability ID
- request schema
- response schema
- error schema

所以，后端变更若影响 capability 契约，就不是简单实现变更，而是协议变更。

## 11. 当前已实现与未实现边界

### 已实现

- FastAPI 本地后端入口
- service container 装配
- capability invoke 主路径
- 健康检查接口
- Pro Tools DAW adapter
- job manager 基础模型
- 错误归一化

### 当前未完成到可以宣传为正式能力的部分

- 面向多 DAW 的完整后端适配层
- 持久化 config/keychain/jobs 存储
- 更完整的生产级部署与外部服务化场景

## 12. 后端开发原则

在当前架构下，新增后端能力应遵循以下顺序：

1. 先确定 capability 契约。
2. 再决定它属于 query、command 还是 job。
3. 再写 handler。
4. 最后接入集成层或底层 adapter。

不要反过来先写 adapter，再让协议去迎合实现细节。当前项目的稳定性建立在“契约先于实现”。
