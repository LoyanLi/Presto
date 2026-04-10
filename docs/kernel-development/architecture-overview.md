# Presto 内核架构总览

本文档描述当前代码已经成立的整体结构，只覆盖内核开发视角。

## 1. 当前系统由什么组成

Presto 当前正式发布路径不是单进程桌面应用，而是三层协作结构：

1. `src-tauri/` 中的 Rust 宿主
2. `frontend/host/` 与 `frontend/tauri/` 中的 React Renderer 宿主
3. `backend/presto/` 中的 FastAPI 本地后端

再加两块共享基础设施：

- `host-plugin-runtime/`：浏览器侧插件激活、页面挂载、权限守卫
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
src-tauri/src/runtime.rs
        │
        ├── runtime/backend.rs
        ├── runtime/plugins.rs
        └── runtime/mobile_progress.rs
        │
        ├── runtime operations
        │   ├── plugins.catalog.*
        │   ├── dialog.folder.open
        │   ├── shell.*
        │   ├── fs.*
        │   ├── window.*
        │   ├── mobile-progress.*
        │   └── mac-accessibility.*
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
- Rust runtime 现在直接承载桌面运行时、日志、插件管理和后端生命周期。
- Renderer 不再经过单独的 Node sidecar 进程。

## 3. 代码目录应该怎么理解

### 3.1 宿主与桌面运行时

- `src-tauri/`：Tauri 宿主入口、`runtime_invoke` command、Rust runtime 根调度器，以及 `runtime/backend.rs`、`runtime/plugins.rs`、`runtime/mobile_progress.rs` 三个领域模块
- `frontend/tauri/`：Renderer 入口和 Tauri bridge
- `frontend/desktop/`：Renderer 启动壳层、runtime operation typed client、插件目录装配

### 3.2 React 宿主界面

- `frontend/host/`：Host Shell、设置页、开发者界面、插件渲染协同
- `frontend/ui/`：主题、样式令牌、基础 UI

### 3.3 后端能力层

- `backend/presto/application/`：service container、DAW runtime resolver、handlers、job manager、error normalizer
- `backend/presto/domain/`：端口、错误、任务、capability 抽象
- `backend/presto/integrations/`：Pro Tools 适配和 mac 自动化
- `backend/presto/transport/http/`：HTTP 路由和 schema

### 3.4 插件平台

- `host-plugin-runtime/`：浏览器侧插件激活、页面挂载、权限裁剪
- `plugins/official/`：官方插件包

### 3.5 共享协议和 SDK

- `packages/contracts/`：capability、插件、任务、错误协议
- `packages/contracts-manifest/`：capability、schema 和 DAW target 事实源
- `packages/sdk-core/`：capability client
- `packages/sdk-runtime/`：宿主 runtime client

## 4. 当前最重要的事实

- 当前桌面主干已经是 `Tauri`，不是 Electron 主进程 + preload 模式。
- Rust 宿主通过 `runtime_invoke` 直接落到 `src-tauri/src/runtime.rs`，不再依赖打包态 Node sidecar。
- `src-tauri/src/runtime.rs` 现在只保留根级状态、共享 helper 和 operation dispatch；backend、插件、mobile progress 已按领域拆到独立模块。
- 打包态 Rust runtime 通过 bundle 内 `backend/`、`frontend/`、`plugins/` 资源和 bundled Python runtime + `PYTHONHOME` 管理本地 FastAPI 后端。
- 桌面打包路径会把 `PRESTO_APP_DATA_DIR` 注入后端，所以 backend config 会落到应用数据目录下的 `config.json`，不再只活在后端进程内存里。
- Rust runtime 初始化时会先从 `<app data>/config.json` 读取 `hostPreferences.dawTarget`，用它给 backend supervisor 设定初始 `target_daw`，而不是只靠 Renderer 启动后再纠正。
- `backend/presto/application/daw_runtime.py` 是当前多 DAW 扩展接缝；`target_daw` 会先解析运行时依赖，再进入 capability 执行链，但当前只实现了 `pro_tools` factory。
- `packages/contracts-manifest/daw-targets.json` 现在是 DAW target 的唯一事实源；`scripts/generate-contracts.mjs` 会生成 `packages/contracts/src/generated/dawTargets.ts`、`backend/presto/domain/daw_targets_generated.py` 和 `src-tauri/src/runtime/daw_targets_generated.rs`。
- Rust capability bridge 在 `/api/v1/capabilities/invoke` 非 `200` 时不会把后端错误压扁成 transport string，而是保留 `success / requestId / capability / error` 这套结构化 envelope，把 FastAPI 错误语义带回 Host。
- 插件发现不再按“当前运行中的 DAW”裁掉已安装插件；Rust runtime 负责发现与校验，当前 DAW 下是否可用由 Host 层基于 `supportedDaws` 再做可用性判断。
- 插件 manifest 的关键约束现在在 Rust runtime 安装/发现入口统一校验，包括保留 DAW target、重复字段、页面/自动化/设置页结构，以及 workflow definition 引用闭包。
- `backend.daw-target.set` 现在由 Rust runtime 独占持久化和重启链路；Renderer 只更新本地宿主状态，不再通过 generic preferences config 路径双写 `hostPreferences.dawTarget`。
- React Host 当前已经没有额外历史 runtime 层；宿主状态主要拆分在 `frontend/host/` 和 `frontend/desktop/` 的专用 hook 与装配入口里。
- capability 是跨宿主、后端、插件的正式业务协议中心。
- 插件不是宿主内任意脚本执行环境，而是 manifest 驱动的受限扩展模型。
- 当前真实支持的 DAW 只有 `pro_tools`。
- 版本号的唯一手工源头现在是仓库根 `package.json`；`packages/contracts/src/version.ts` 和 `backend/presto/version.py` 都是同步生成的派生常量。

## 5. 建议从哪里读代码

如果你要理解完整运行路径，建议顺序如下：

1. `src-tauri/src/main.rs`
2. `src-tauri/src/runtime.rs`
3. `src-tauri/src/runtime/backend.rs`
4. `src-tauri/src/runtime/plugins.rs`
5. `src-tauri/src/runtime/mobile_progress.rs`
6. `frontend/tauri/runtimeBridge.ts`
7. `frontend/desktop/renderHostShellApp.tsx`
8. `backend/presto/main_api.py`
9. `backend/presto/application/daw_runtime.py`
10. `backend/presto/application/service_container.py`
11. `packages/contracts-manifest/daw-targets.json`
12. `scripts/generate-contracts.mjs`
13. `host-plugin-runtime/browser.ts`
14. `packages/contracts/src/*`
