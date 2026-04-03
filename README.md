# Presto

Presto 是一个面向音频工作流的桌面应用。当前代码主干已经是 `Tauri + Node sidecar + React + Python FastAPI`，目标是在桌面宿主、后端能力层和插件扩展层之间建立稳定、可验证、可裁剪的工作流平台。当前实际落地的目标 DAW 是 `Pro Tools`。

这个入口文档只回答三件事：

1. 项目当前是什么。
2. 代码结构应该从哪里读起。
3. 文档已经按哪两块组织。

## 当前系统概览

```text
Presto
├── src-tauri/               # Tauri Rust 宿主入口与 runtime_invoke command
├── frontend/
│   ├── tauri/               # Renderer 入口与 Tauri runtime bridge
│   ├── sidecar/             # Node sidecar 入口与资源路径装配
│   ├── runtime/             # backend supervisor、plugin host service、automation runtime
│   ├── host/                # React 宿主壳层、插件挂载、设置页、开发者界面
│   └── ui/                  # UI 设计令牌与基础组件
├── backend/presto/          # FastAPI 后端、capability handler、作业管理、Pro Tools 适配
├── host-plugin-runtime/     # 插件发现、校验、加载、挂载、权限守卫
├── packages/
│   ├── contracts/           # 类型契约、capability 协议、插件协议
│   ├── contracts-manifest/  # capability 清单事实源
│   ├── sdk-core/            # capability 调用 SDK
│   └── sdk-runtime/         # 宿主 runtime SDK
├── plugins/official/        # 官方插件包
└── docs/                    # 内核开发 / 插件开发与规范文档
```

## 当前运行模型

当前实现是三段式调用链：

```text
React Host / Plugin Page
        │
        ▼
Tauri runtime bridge
        │
        ▼
Rust command: runtime_invoke
        │
        ▼
Node sidecar runtime
        │
        ├── plugin host / dialog / shell / fs / window / automation
        └── backend supervisor
                │
                ▼
          FastAPI /api/v1
                │
                ▼
      capability handlers + job manager + DAW adapter
```

这不是“前端直连后端”的结构，也不是“插件直接拿宿主私有对象”的结构。

## 当前成立的边界

- 应用版本基线是 `0.3.0-alpha.1`。
- 当前实际支持的 DAW 目标是 `pro_tools`。
- 插件能力边界由 manifest 和 capability 白名单共同决定。
- `packages/contracts` 是跨 TypeScript、Python、插件运行时共享的协议面。
- `packages/contracts-manifest` 是 capability 清单事实源，上游生成产物会被后端和前端共同消费。
- `packages/sdk-core` 负责 capability 调用；`packages/sdk-runtime` 负责宿主 runtime 调用；两者职责不同。
- 插件 `activate(context)` 只能拿到 `PluginContext`，没有 `runtime`。
- 插件页面组件除了 `context` 之外，还会收到受限的 `host`，当前稳定开放的页面宿主能力是 `host.pickFolder()`。

以下内容当前只能写成“预留”而不是“已支持”：

- `logic`、`cubase`、`nuendo` 只存在类型预留。
- `hostApiVersion` 兼容白名单存在，但这不代表项目已经完成长期多代兼容治理。

## 文档入口

文档已经按两块重组：

- [内核开发文档](docs/kernel-development/README.md)
- [插件开发与规范](docs/plugin-development/README.md)

完整索引见 [docs/README.md](docs/README.md)。

## 建议阅读顺序

如果你在做内核开发：

1. `README.md`
2. [docs/README.md](docs/README.md)
3. [docs/kernel-development/README.md](docs/kernel-development/README.md)

如果你在做插件开发：

1. `README.md`
2. [docs/README.md](docs/README.md)
3. [docs/plugin-development/README.md](docs/plugin-development/README.md)

## 本地开发

最小开发路径按当前脚本应为：

```bash
npm install
npm run tauri:dev
```

测试：

```bash
npm test
```

## 项目级约束

- 新增跨边界能力时，先定义 `contracts` 类型面，再更新 `contracts-manifest` 与生成产物，再实现。
- 新插件能力必须先声明 `requiredCapabilities`，再谈调用。
- 文档中的“已支持”必须对应当前代码事实，不能把预留项写成已交付能力。
- 涉及宿主、后端、插件三方边界的改动，先明确协议边界，再进入实现。
