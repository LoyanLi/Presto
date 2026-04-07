# Presto 内核架构总览

本文档描述当前代码已经成立的整体结构，只覆盖内核开发视角。

## 1. 当前系统由什么组成

Presto 当前不是单进程桌面应用，而是四层协作结构：

1. `src-tauri/` 中的 Rust 宿主
2. `frontend/sidecar/` 与 `frontend/runtime/` 中的 Node sidecar
3. `frontend/host/` 与 `frontend/tauri/` 中的 React Renderer 宿主
4. `backend/presto/` 中的 FastAPI 本地后端

再加两块共享基础设施：

- `host-plugin-runtime/`：插件发现、校验、加载、挂载、权限守卫
- `packages/*`：contracts、capability 清单、SDK

## 2. 当前主路径调用链

```text
Renderer host UI / plugin page
        │
        ▼
frontend/tauri/runtimeBridge.ts
        │
        ▼
src-tauri/src/main.rs::runtime_invoke
        │
        ▼
frontend/sidecar/main.ts
        │
        ├── runtime services
        │   ├── plugins.catalog.*
        │   ├── dialog.folder.open
        │   ├── shell.*
        │   ├── fs.*
        │   ├── window.*
        │   ├── automation.*
        │   └── mobile-progress.*
        │
        └── backend.capability.invoke
                │
                ▼
         backend/presto/main_api.py
                │
                ▼
      application handlers + integrations
```

这个结构说明：

- Renderer 不直接拉起或管理 Python 后端。
- Rust 宿主不直接承载所有业务逻辑。
- sidecar 是桌面运行时和后端管理的业务装配层。

## 3. 代码目录应该怎么理解

### 3.1 宿主与桌面运行时

- `src-tauri/`：Tauri 宿主入口、`runtime_invoke` command、sidecar 启动
- `frontend/tauri/`：Renderer 入口和 Tauri bridge
- `frontend/desktop/`：把 runtime operation 装配成类型化 client
- `frontend/runtime/`：sidecar 业务运行时

### 3.2 React 宿主界面

- `frontend/host/`：Host Shell、设置页、开发者界面、插件渲染协同
- `frontend/ui/`：主题、样式令牌、基础 UI

### 3.3 后端能力层

- `backend/presto/application/`：service container、handlers、job manager、error normalizer
- `backend/presto/domain/`：端口、错误、任务、capability 抽象
- `backend/presto/integrations/`：Pro Tools 适配和 mac 自动化
- `backend/presto/transport/http/`：HTTP 路由和 schema

### 3.4 插件平台

- `host-plugin-runtime/`：插件发现、manifest 校验、权限裁剪、挂载
- `plugins/official/`：官方插件包

### 3.5 共享协议和 SDK

- `packages/contracts/`：capability、插件、任务、错误协议
- `packages/contracts-manifest/`：capability 清单事实源
- `packages/sdk-core/`：capability client
- `packages/sdk-runtime/`：宿主 runtime client

## 4. 当前最重要的事实

- 当前桌面主干已经是 `Tauri`，不是 Electron 主进程 + preload 模式。
- Rust 宿主通过 `runtime_invoke` 把调用转给 Node sidecar，而不是直接在 Rust 里实现全部业务。
- 打包态 sidecar 通过 `PRESTO_RESOURCES_DIR` 定位随包资源，并通过 bundled Python runtime + `PYTHONHOME` 管理本地 FastAPI 后端。
- capability 是跨宿主、后端、插件的正式业务协议中心。
- 插件不是宿主内任意脚本执行环境，而是 manifest 驱动的受限扩展模型。
- 当前真实支持的 DAW 只有 `pro_tools`。

## 5. 建议从哪里读代码

如果你要理解完整运行路径，建议顺序如下：

1. `src-tauri/src/main.rs`
2. `frontend/sidecar/main.ts`
3. `frontend/runtime/backendSupervisor.ts`
4. `backend/presto/main_api.py`
5. `backend/presto/application/service_container.py`
6. `host-plugin-runtime/src/*`
7. `packages/contracts/src/*`
