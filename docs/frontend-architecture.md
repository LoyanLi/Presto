# Presto 前端架构

本文档面向 Presto 内部开发者，描述当前前端实现的真实结构、职责边界、运行路径和扩展原则。这里的“前端”不是仅指 React 页面，而是包括 Electron 主进程、预加载桥、Renderer 宿主层与插件页面宿主在内的完整桌面侧系统。

## 1. 架构目标

当前前端架构要解决的问题不是“画界面”，而是以下四件事：

1. 提供稳定的桌面应用壳层。
2. 把宿主能力以类型化方式暴露给 Renderer。
3. 承接后端能力调用与插件运行。
4. 在不放大权限边界的前提下支持扩展。

因此，Presto 前端不是传统的 SPA，而是一个带宿主职责的桌面运行环境。

## 2. 当前分层

当前前端代码可以按四层理解：

### 2.1 Electron 主进程层

核心文件：

- `frontend/electron/main.mjs`
- `frontend/electron/preload.ts`
- `frontend/electron/runtime/registerRuntimeHandlers.mjs`

职责：

- 应用生命周期管理
- 主窗口创建与元数据设置
- 后端监督器初始化
- 插件宿主服务初始化
- Runtime IPC handler 注册
- 文件系统、系统 shell、移动端进度页等桌面级能力编排

这一层是系统真正的“宿主根节点”。所有 Renderer 和插件最终都只能经由这里获取受控能力。

### 2.2 Electron Runtime 处理层

核心目录：

- `frontend/electron/runtime/*`

关键模块：

- `runtimeBridge.ts`
- `backendSupervisor.ts`
- `pluginHostService.ts`
- `mobileProgressServer.ts`
- `mobileProgressPage.mjs`
- `automationRuntime.mjs`
- `macAccessibilityRuntime.mjs`

职责：

- 把主进程可提供的能力组织成语义明确的 runtime 面
- 管理主进程与后端之间的连接
- 管理插件发现、安装、卸载、官方插件同步
- 管理移动端导出进度页面与二维码访问入口
- 管理自动化定义与无障碍脚本运行

这一层不是 UI 层，而是“主进程业务装配层”。

### 2.3 Renderer 宿主层

核心目录：

- `frontend/host/*`

职责：

- 渲染宿主 Shell
- 展示内建页面
- 维护插件列表、插件设置页、工作流页面、自动化入口
- 承接 RuntimeBridge 和 SDK 客户端
- 管理宿主级状态，如当前插件模型、DAW 状态、设置页路由等

宿主层不应该直接发明协议。它应当消费 `packages/contracts` 中的类型面，以及由 `packages/contracts-manifest` 生成并注入运行时的 capability 定义与相关生成产物。

### 2.4 UI 组件层

核心目录：

- `frontend/ui/primitives/*`
- `frontend/ui/composites/*`
- `frontend/ui/theme/*`
- `frontend/ui/material/*`

职责：

- 设计令牌与主题
- 基础控件封装
- 复合业务组件
- Material 相关桥接

这一层的职责是视觉与交互复用，不应承担宿主协议与业务编排。

## 3. 当前启动路径

当前前端的真实启动链路如下：

1. `electron main` 进入 `frontend/electron/main.mjs`。
2. 主进程解析应用元数据，初始化日志存储。
3. 主进程创建 `automationRuntime`、`macAccessibilityRuntime`、`backendSupervisor`、`pluginHostService` 等运行时依赖。
4. 主进程通过 `registerRuntimeHandlers.mjs` 注册全部 IPC 处理器。
5. 预加载层通过 `__PRESTO_BOOTSTRAP__` 暴露一次性 bootstrap 句柄。
6. Renderer 侧从 bootstrap 句柄取走 client、宿主 runtime 与 plugin host bridge，并删除全局入口。
7. 宿主 React 应用加载 `HostShellApp`，再装配内建页面与插件页面。

这一链路里最重要的边界是：

- 主进程负责“提供能力”
- Renderer 负责“消费能力”
- 插件只允许消费 manifest 声明过的能力

## 4. RuntimeBridge 设计

`frontend/electron/runtime/runtimeBridge.ts` 的作用不是简单转发 IPC，而是把 IPC 通道提升为结构化、类型化的 Runtime 客户端。

当前桥接暴露的 runtime 领域包括：

- `app`
- `automation`
- `backend`
- `dialog`
- `shell`
- `fs`
- `window`
- `mobileProgress`
- `macAccessibility`

这意味着 Renderer 宿主侧不需要记住裸字符串通道名，也不应该直接拼接 IPC channel。宿主内部调用应统一通过 runtime client 完成。

这里要明确当前真实边界：

- `preload.ts` 不再把长期可见的私有 host bridge 暴露到 `window`。
- Renderer 只从 `window.__PRESTO_BOOTSTRAP__` 一次性取走 `PrestoClient`、宿主 runtime 与插件管理桥。
- `frontend/electron/test/plugin-host-bridge-source.test.mjs` 明确约束代码中不应重新出现 `__PRESTO_PLUGIN_HOST__` 或 `__PRESTO_PLUGIN_SANDBOX__`。

这样设计的收益：

- 通道名集中管理
- 类型边界清晰
- 更容易做权限裁剪
- Renderer 宿主侧调用路径统一

## 5. 后端接入在前端中的位置

前端不直接理解后端内部结构，它只依赖两个稳定面：

1. `backendSupervisor`
2. `sdk-core` / `contracts`

`backendSupervisor.ts` 负责：

- 选择 Python 可执行文件
- 选择可用端口
- 拉起 FastAPI 进程
- 健康检查
- 转发能力调用

因此，Renderer 侧看到的是“能力调用客户端”，而不是“HTTP 细节”。这一点必须保持不变，否则宿主与后端会重新耦合。

## 6. 宿主页面组织

当前宿主界面主要有三类页面：

### 6.1 内建页面

由宿主直接实现，例如：

- 首页
- 设置页
- 开发者能力页

这些页面属于产品壳层能力，不属于插件。

### 6.2 插件工作区页面

由插件 manifest 中的 `pages` 声明，经宿主读取后挂载到工作区。

约束：

- 当前挂载目标只看到 `mount: "workspace"` 这一种稳定形态。
- 页面标题、路径、组件导出名由插件 manifest 和模块导出共同决定。

### 6.3 插件设置页

由插件 manifest 中的 `settingsPages` 声明，经宿主装配为设置页路由。

宿主不会把整个设置系统交给插件自由发挥，而是让插件通过结构化字段定义接入。这是为了保持设置页布局和数据存储模型的统一。

## 7. 插件在前端中的挂载方式

Renderer 宿主通过 `frontend/host/pluginHostRuntime.ts` 协调插件装载。当前流程可以概括为：

1. 主进程返回插件清单与 manifest 信息。
2. Renderer 根据 manifest 建立插件记录模型。
3. 宿主加载插件入口模块。
4. 宿主通过 `createPluginRuntime` 生成受限 `PluginContext`。
5. 宿主调用插件 `activate(context)`。
6. 宿主从 manifest 和插件模块导出中挂载页面、导航、命令、自动化入口和设置页。

关键点：

- 插件的权限不是在 UI 层“约定”，而是在运行时实际裁剪。
- 插件的设置存储会按 `pluginId` 自动命名空间隔离。
- 插件 logger 也会自动注入 `pluginId` 前缀。
- 插件代码拿到的是受 manifest 裁剪后的 `PluginContext`，而不是宿主私有对象或长期全局桥。

## 8. 当前状态管理原则

当前宿主状态不是一个大而全的全局状态容器，而是按宿主场景拆分。代码里已经表现出以下组织方式：

- 插件宿主模型
- Shell 颜色与偏好
- 设置页路由与页面项
- DAW 状态轮询 Hook

这一组织方式说明当前项目更倾向于“按领域划分状态”，而不是把所有前端状态揉进一个统一容器。

文档上应坚持这一原则：

- 宿主状态按业务面拆分
- 运行时状态与展示状态分离
- 插件状态不进入宿主公共状态树，除非它需要被宿主统一管理

## 9. 当前前端安全边界

当前前端最重要的不是浏览器安全模型，而是“宿主权限边界”。主要边界如下：

- Renderer 不能跳过 RuntimeBridge 或 bootstrap 裁剪直接访问主进程私有实现。
- 插件不能跳过 manifest 声明直接访问能力或运行时服务。
- 文件系统、shell、无障碍脚本、移动进度页等高风险能力都由主进程代理。

这意味着任何新增桌面能力都必须先回答两个问题：

1. 这个能力属于主进程能力还是纯 UI 逻辑？
2. 这个能力是否允许插件访问，如果允许，访问粒度是什么？

没有回答完这两个问题之前，不应该新增新的 runtime 面。

## 10. 当前已实现与未实现边界

前端文档必须明确区分以下事实：

### 已实现

- Electron 主进程窗口与运行时初始化
- 后端监督器
- 插件宿主服务
- RuntimeBridge
- 插件发现与安装界面
- 移动端导出进度页生成
- 自动化与无障碍运行时桥接

### 预留但不应视为已全面完成

- 更多 DAW 宿主切换
- 更复杂的插件沙箱隔离
- 更完整的多页面导航体系
- 更系统化的全局状态管理策略

这些内容可以在设计讨论中提及，但不能在项目文档中写成已支持能力。

## 11. 前端改动的落地原则

在当前架构下，前端改动应遵循以下顺序：

1. 先确定它属于 UI 变化、宿主变化、运行时变化，还是协议变化。
2. 如果涉及跨层调用，先检查 `contracts` 和 `sdk-runtime` 是否已有稳定接口。
3. 如果插件也要访问该能力，必须先设计 manifest 权限项和 guard。
4. 如果只是页面视觉调整，不应顺手改动 runtime 或协议边界。

这是当前前端保持可维护性的最短路径。
