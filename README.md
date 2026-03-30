# Presto

Presto 是一个面向音频工作流的桌面应用，当前以 `Electron + React + Python FastAPI` 为主干，核心目标是在桌面宿主、后端能力层与插件扩展层之间建立一套稳定、可验证、可受控的工作流平台。当前代码实现实际聚焦 `Pro Tools`，并围绕导入、导出、自动化任务与扩展插件提供能力。

本文档是项目入口文档，只回答三类问题：

1. 这个项目现在是什么。
2. 代码结构应该从哪里读起。
3. 哪些详细主题文档分别面向内部开发者与外部接入者。

## 当前系统概览

当前已实现的运行结构如下：

```text
Presto
├── frontend/
│   ├── electron/            # Electron 主进程、预加载、IPC、运行时装配
│   ├── host/                # React 宿主壳层、插件挂载、设置页、开发者界面
│   └── ui/                  # UI 设计令牌、基础控件、复合组件
├── backend/import/presto/   # FastAPI 后端、能力处理器、领域模型、Pro Tools 适配
├── host-plugin-runtime/     # 插件发现、校验、加载、挂载、权限守卫
├── packages/
│   ├── contracts/           # 类型契约、能力协议、插件协议、事件与错误模型
│   ├── contracts-manifest/  # capability / runtime service / permission 白名单事实源
│   ├── sdk-core/            # 能力调用 SDK
│   └── sdk-runtime/         # Electron Runtime SDK
├── plugins/official/        # 官方插件包
└── assets/                  # 图标与静态资源
```

## 当前运行模型

Presto 不是一个纯前端壳，也不是一个纯后端工具。当前实现是三层协作模型：

- 桌面宿主层负责窗口生命周期、IPC、后端拉起、插件装载、系统能力代理。
- 后端能力层负责把能力请求落到具体业务 handler 和 DAW 适配器。
- 插件扩展层负责把工作流、页面、设置页、命令和自动化入口以受限权限方式接入宿主。

简化后的调用链如下：

```text
Renderer UI / Plugin UI
        │
        ▼
Electron Runtime Bridge
        │
        ▼
Electron Main IPC Handlers
        │
        ├── Host Runtime Services
        │
        └── Backend Supervisor
                │
                ▼
         FastAPI /api/v1/*
                │
                ▼
      Capability Handlers + DAW Adapter
```

## 当前实现边界

以下内容是当前代码已经明确成立的事实：

- 当前宿主应用名为 `Presto`，版本基线为 `0.3.0-alpha.1`。
- 当前能力注册与官方插件的实际目标 DAW 都是 `pro_tools`。
- 插件系统不是“任意脚本直通宿主”，而是 manifest 驱动、白名单能力驱动、运行时服务白名单驱动。
- 类型接口定义集中在 `packages/contracts`，但 capability/runtime service/插件权限白名单的运行时事实源是 `packages/contracts-manifest`，并通过生成产物供 TypeScript、Python 和插件运行时共用。
- `packages/sdk-core` 面向能力调用，`packages/sdk-runtime` 面向宿主运行时服务，两者职责不同，不能混用。
- Renderer 侧不是长期持有私有宿主桥，而是从 `__PRESTO_BOOTSTRAP__` 一次性取走 client/runtime/plugin host bridge，再组装宿主应用。

以下内容在代码中有预留，但当前不应被文档表述为已完成能力：

- DAW 类型定义里存在 `logic`、`cubase`、`nuendo`，但当前 capability registry 与官方插件并未真正开放这些目标。
- 插件 Host API 兼容判断已允许 `0.1.0`、`1`、`1.0.0`，但这不等于系统已经完成多代长期兼容治理。

## 文档索引

### 面向内部开发者

- [前端架构](docs/frontend-architecture.md)
- [后端架构](docs/backend-architecture.md)
- [通信架构](docs/communication-architecture.md)
- [版本支持](docs/version-support.md)

### 面向外部接入者

- [SDK 开发](docs/sdk-development.md)
- [第三方插件编写](docs/third-party-plugin-development.md)

## 建议阅读顺序

如果你是项目内部研发，建议顺序如下：

1. `README.md`
2. `docs/communication-architecture.md`
3. `docs/frontend-architecture.md`
4. `docs/backend-architecture.md`
5. `docs/version-support.md`

如果你是 SDK 或插件接入方，建议顺序如下：

1. `README.md`
2. `docs/version-support.md`
3. `docs/sdk-development.md`
4. `docs/third-party-plugin-development.md`

## 本地运行

当前仓库的最小启动方式：

```bash
npm install
npm run stage1:start
```

## 项目约束

以下约束应当视为项目级规则，而不是“建议”：

- 新增跨边界能力时，先定义 `contracts` 中的类型面，再更新 `contracts-manifest` 与生成产物，再谈实现。
- 新插件能力必须先声明权限，再谈调用。
- 文档中所有“已支持”表述必须对应当前代码事实，不能把预留项写成已交付项。
- 任何需要跨前后端、跨宿主与插件边界的改动，都必须先明确协议边界，再实施代码。
