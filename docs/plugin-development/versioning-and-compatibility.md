# 版本与兼容性

本文档只写当前代码已经成立的版本事实，不写路线图。

## 1. 当前版本基线

仓库中可以直接确认的版本事实：

- App Version：当前仓库值是 `0.3.10`
- App Name：`Presto`
- Backend FastAPI Version：由 `backend/presto/version.py::VERSION` 导出，当前值也是 `0.3.10`
- Capability Schema Version：`1`

这三类版本不是一回事，不能混用。

## 2. 版本维度

### 2.1 App Version

来源：`package.json`

用途：

- 产品版本
- 桌面应用发布版本
- 前端 `packages/contracts/src/version.ts::PRESTO_VERSION` 的派生源
- 后端 `backend/presto/version.py::VERSION` 的派生源

当前规则必须明确：

- 仓库根 `package.json` 是唯一手工维护的版本源
- `scripts/sync-version.mjs` 负责把这个版本同步到前端和后端常量文件

### 2.2 Host API Version

来源：插件 manifest 的 `hostApiVersion`

用途：

- 判定当前插件能否被宿主加载

### 2.3 Capability Schema Version

来源：`packages/contracts/src/capabilities/registry.ts`

用途：

- 标识 capability 请求和响应 schema 代数

### 2.4 Plugin Version

来源：插件 manifest 的 `version`

用途：

- 标识插件自身版本

## 3. 当前 Host API 兼容事实

当前 Rust runtime 插件校验模块 `src-tauri/src/runtime/plugins.rs` 中的兼容判断允许这些值：

- `0.1.0`
- `1`
- `1.0.0`

这只是当前实现里的兼容白名单，不代表项目已经完成长期多代兼容治理。

## 4. 当前 DAW 支持事实

类型层的 `DawTarget` 目前包含：

- `pro_tools`
- `logic`
- `cubase`
- `nuendo`

但按插件类型，当前 manifest 约束是：

- `workflow` / `automation`：`supportedDaws` 写 `["pro_tools"]`
- `tool`：`supportedDaws` 必须写 `[]`

其余 DAW 值当前仍是类型预留。

## 5. 当前插件版本字段的含义

### 5.1 `version`

插件自身版本。

### 5.2 `hostApiVersion`

插件要求的宿主插件 API 版本。

### 5.3 `adapterModuleRequirements`

插件要求宿主 / 后端模块达到的最低版本。

### 5.4 `capabilityRequirements`

插件要求具体 capability 达到的最低版本。

这四个字段分属不同层次，不能拿一个字段替代另一个字段。

## 6. 当前 capability schema 语义

当前 capability definition 都是：

- `version: 1`

这表示当前系统仍处于单代 schema 模型，没有引入同一 capability ID 多代并存治理。

因此当前开发规则应该是：

- 不轻易破坏既有 capability 语义
- 破坏性改动先处理 contracts 和生成产物边界

## 7. 当前官方插件版本事实

根据仓库中的 manifest：

- `official.import-workflow`：`1.0.0`
- `official.export-workflow`：`1.0.1`
- `official.split-stereo-to-mono-automation`：`1.0.0`
- `official.atmos-video-mux-tool`：`1.0.0`

这些官方插件当前共同事实：

- `hostApiVersion` 为 `0.1.0`
- capability / module 最低版本要求使用 `2025.10.0`

`supportedDaws` 的当前事实是分类型的：

- workflow / automation 官方插件：`["pro_tools"]`
- tool 官方插件：`[]`

## 8. 文档里什么叫“支持”

只有满足以下条件时，文档才可以写“支持”：

- capability 已注册并接入正式调用链
- 插件 manifest 可通过当前加载校验
- 宿主或插件页面已经拿到对应正式接口

以下情况不能直接写“支持”：

- 只有类型定义
- 只有目录
- 只有占位代码
- 只有设计意图
