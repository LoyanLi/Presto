# Presto

Presto 是一个面向音频工作流的桌面应用。当前代码主干已经是 `Tauri + Node sidecar + React + Python FastAPI`，目标是在桌面宿主、后端能力层和插件扩展层之间建立稳定、可验证、可裁剪的工作流平台。当前实际落地的目标 DAW 是 `Pro Tools`。

这个入口文档只回答三件事：

1. 项目当前是什么。
2. 代码结构应该从哪里读起。
3. 文档已经按哪两块组织。

## 最新发布

- 当前文档基线版本：`0.3.2`
- 发布说明：[docs/releases/v0.3.2-release.md](docs/releases/v0.3.2-release.md)

`0.3.2` 这一版当前最重要的事实有三条：

- capability 公共层新增 canonical DAW metadata：`supportedDaws`、`canonicalSource`、`fieldSupport`。
- Pro Tools adapter 现在通过内部全量 PTSL catalog + runner 接入更多公共 track toggle 命令，并统一 batch 语义。
- Developer Console 改为读取后端 capability metadata，而不是继续把硬编码 inventory 当事实源。
- 桌面运行时日志现在按应用启动会话分文件写入，并把错误摘要压缩到可直接阅读的单行主记录。

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

- 应用版本基线是 `0.3.2`。
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

最小开发路径：

```bash
npm install
npm run tauri:dev
```

开发态补充说明：

- `tauri:dev` 下 sidecar 现在直接使用仓库根目录作为运行时资源根路径，官方插件 `dist/` 和 workflow definition 修改在重启开发进程后会直接生效，不再依赖 `src-tauri/target/debug/resources` 里的旧快照。
- 首次打包或手动执行 `tauri:prepare:python` 时，会为 bundled backend Python runtime 安装 `backend/requirements-runtime.txt`，因此会看到 `fastapi`、`uvicorn`、`pydantic`、`py-ptsl` 等运行时依赖下载输出。
- 运行日志位于应用数据目录下的 `logs/`，每次启动都会生成一个新的 `presto-<timestamp>.log`；主行直接写出 `source + operation + real error reason`，只有附加上下文才会再写紧凑 JSON。

测试：

```bash
npm test
```

## 打包

默认打包：

```bash
npm run tauri:build
```

打包前提：

- 构建链会执行 `tauri:prepare:all`，其中包含前端构建、sidecar 构建、bundled Python runtime 准备和资源筛选复制。
- `tauri:build` 默认为当前主机架构生成 `.app` 和 `.dmg`，并同步复制到 `release/tauri/<arch>/`。
- DMG 打包当前通过 `scripts/package-tauri-build.mjs` 调用 `hdiutil makehybrid` 生成；在当前 macOS `26.0.1` 环境里，`hdiutil create` 会阻塞，不能作为发布链路事实继续使用。

按架构分别打包：

```bash
npm run tauri:build:arm64
npm run tauri:build:x64
```

当前产物目录：

- `release/tauri/arm64/`
- `release/tauri/x64/`
- `src-tauri/target/aarch64-apple-darwin/release/bundle/`
- `src-tauri/target/x86_64-apple-darwin/release/bundle/`
- 默认本机目标仍输出到 `src-tauri/target/release/bundle/`

### macOS 26 发布图标

- `src-tauri/tauri.conf.json` 仍然保留 `icons/icon.icns`，以满足 Tauri 默认打包链和开发构建的需求。
- 当前发布链直接复用 `v0.2.x` Electron 成功产物里的 macOS 图标资源：`assets/macos-icon/arm64/Assets.car`、`assets/macos-icon/x64/Assets.car`，以及旧包对应的 `icon.icns`。
- `npm run tauri:build` 之后、首轮签名之前会调用 `scripts/inject-macos-app-icon.mjs --app <build/…/Presto.app>`，该脚本按目标架构复制预编译的 `Assets.car`，同步 `icon.icns`，并把 `Info.plist` 对齐到旧 Electron 包的 `CFBundleIconName=Icon` 与 `CFBundleIconFile=icon.icns`。
- 这条路径是对旧 Electron 发布包最终 bundle 结果的直接复用，不依赖当前机器重新编译 `.icon`。

## 未签名 App 打开方式

当前产物是未签名 macOS App。首次打开如果被系统拦截，按下面做：

1. 在 Finder 里找到 `.app` 或挂载后的 App。
2. 按住 `Control` 键点按应用，选择“打开”。
3. 弹窗里再点一次“打开”。

如果还是被拦截：

1. 打开“系统设置 -> 隐私与安全性”。
2. 在底部找到刚刚被拦截的 Presto。
3. 点“仍要打开”。

## 捐赠

如果这个项目对你有帮助，可以扫码支持：

微信：

<img src="assets/wx.jpg" alt="微信赞赏码" width="220" />

支付宝：

<img src="assets/zfb.jpg" alt="支付宝收款码" width="220" />

## 项目级约束

- 新增跨边界能力时，先定义 `contracts` 类型面，再更新 `contracts-manifest` 与生成产物，再实现。
- 新插件能力必须先声明 `requiredCapabilities`，再谈调用。
- 文档中的“已支持”必须对应当前代码事实，不能把预留项写成已交付能力。
- 涉及宿主、后端、插件三方边界的改动，先明确协议边界，再进入实现。
