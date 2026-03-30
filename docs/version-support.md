# Presto 版本支持

本文档同时面向内部开发者与外部接入者，说明当前版本基线、兼容判定、插件版本要求、能力版本语义以及“已支持”和“类型预留”之间的边界。

这一页的目标不是写路线图，而是定义当前版本事实，避免文档把预留能力误写成稳定支持。

## 1. 当前版本基线

当前仓库中可以直接确认的版本事实如下：

- 应用版本：`0.3.0-alpha.1`
- 应用名：`Presto`
- 后端应用版本字符串：`0.1.0`（FastAPI app version）
- Contracts capability schema version：`1`

这里要特别注意：

- 桌面应用版本和后端 app version 不是同一个概念。
- 插件 Host API 版本也不是应用版本。

三者分别服务于不同边界，不应混用。

## 2. 版本维度划分

当前 Presto 至少有四个版本维度：

### 2.1 App Version

来源：

- `package.json`

用途：

- 产品发布版本
- 桌面应用展示与发行

### 2.2 Host API Version

来源：

- 插件 manifest 中的 `hostApiVersion`
- 主进程对插件的兼容性判断

用途：

- 判定插件是否可以被当前宿主接受

### 2.3 Capability Schema Version

来源：

- `packages/contracts/src/capabilities/registry.ts` 中 capability definition 的 `version`

用途：

- 声明能力协议结构代数

### 2.4 Plugin Version

来源：

- 插件 manifest `version`

用途：

- 标识插件自身版本
- 区分插件升级、问题排查与安装覆盖逻辑

## 3. 当前 Host API 兼容规则

当前主进程中实际使用的兼容规则是：

- `0.1.0`
- `1`
- `1.0.0`

也就是说，插件 manifest 中的 `hostApiVersion` 只要等于以上三者之一，就会被判定为可兼容。

这件事在文档里必须精确表达为：

- 当前存在一段显式兼容白名单判断
- 不代表项目已经建立了完整的长期版本迁移策略

换句话说，它是当前实现事实，不是长期治理承诺。

## 4. 当前 DAW 支持语义

当前代码中出现了两个层面的 DAW 支持信息：

### 4.1 类型层预留

在 `packages/contracts/src/daw/targets.ts` 中，当前类型定义包含：

- `pro_tools`
- `logic`
- `cubase`
- `nuendo`

### 4.2 实际能力层支持

当前 capability registry 和官方插件实际使用的目标是：

- `pro_tools`

因此，版本支持文档必须严格区分：

- “类型已预留”
- “当前实际支持”

当前可以对外写的只有：

- 目前实际支持 `pro_tools`
- 其余目标仅存在类型预留，不构成当前已实现承诺

## 5. Plugin 版本字段的实际含义

插件 manifest 当前涉及的版本类字段有：

- `version`
- `hostApiVersion`
- `adapterModuleRequirements`
- `capabilityRequirements`

这四类字段分别表达不同事情：

### 5.1 `version`

插件自身版本号，服务于插件升级与定位。

### 5.2 `hostApiVersion`

插件要求宿主具备的插件 API 代数。它解决的是“插件能否被当前宿主加载”。

### 5.3 `adapterModuleRequirements`

插件要求某些宿主/后端模块达到最低版本。它解决的是“宿主结构能力是否足够”。

### 5.4 `capabilityRequirements`

插件要求 capability 级别达到最低版本。它解决的是“插件依赖的具体业务能力是否符合要求”。

这四种版本检查应当分层理解，不能把 `version` 当作总开关。

## 6. 当前插件加载前的版本相关校验

插件在进入可加载状态之前，当前至少要经过以下几类检查：

1. manifest 格式校验
2. Host API 兼容性校验
3. 权限字段校验
4. 支持 DAW 校验
5. 入口模块可加载校验

版本相关的核心校验点是：

- `hostApiVersion`
- `supportedDaws`
- `adapterModuleRequirements`
- `capabilityRequirements`

如果这些字段与宿主事实不匹配，插件不应被视为 ready。

## 7. 官方插件当前版本现状

根据当前仓库内 manifest，可直接得到以下事实：

- `official.import-workflow`：`1.0.0`
- `official.export-workflow`：`1.0.1`
- `official.split-stereo-to-mono-automation`：`1.0.0`

它们共同特征：

- `hostApiVersion` 当前均使用 `0.1.0`
- `supportedDaws` 当前均为 `pro_tools`
- 能力与模块要求版本采用 `2025.10.0`

文档上应把这些作为“当前官方插件版本事实”，不是“建议插件版本写法”。

## 8. Contracts 版本语义

当前 capability registry 里的 definition 都带有：

- `version: 1`

这表示当前系统里的 capability schema 仍然处于单代模型。它的含义是：

- 请求/响应 schema 代数当前统一为 `1`
- 还没有出现同一 capability ID 多代并存的复杂治理

因此，当前开发规则应是：

- 对能力的破坏性变更要非常谨慎
- 在没有明确版本迁移策略前，不应随意重写既有 schema 语义

## 9. 对外文档中“支持”的表述规范

为了防止版本文档误导，今后所有文档里的表述应遵守以下规则：

### 可以写“支持”

- 当前 capability registry 已注册
- 当前插件 manifest 已声明并可通过加载校验
- 当前宿主实现已暴露对应 runtime/client

### 不可以直接写“支持”

- 只有类型存在
- 只有目录存在
- 只有代码预留分支
- 只有设计意图但未接入主路径

这条规则尤其适用于多 DAW、插件 API 代数扩展和持久化能力。

## 10. 版本升级时应检查什么

### 内部开发者

升级应用版本时至少检查：

- `package.json` version
- About panel / app metadata
- release metadata 相关测试

变更 Host API 时至少检查：

- 插件 manifest 兼容判定
- 官方插件 manifest
- 插件发现与加载测试

变更 capability schema 时至少检查：

- `contracts`
- `sdk-core`
- 后端 handler
- 插件 capability 使用点

### 外部插件作者

升级插件时至少检查：

- `hostApiVersion` 是否仍被当前宿主接受
- 使用的 capability 是否仍存在且语义一致
- `requiredRuntimeServices` 是否仍完整
- `supportedDaws` 是否匹配当前宿主运行目标

## 11. 当前结论

若只用一句话总结当前版本支持状态，应表述为：

当前 Presto 应用版本为 `0.3.0-alpha.1`，实际稳定目标是 `pro_tools`，插件接入以 `hostApiVersion` 白名单兼容和 capability 契约兼容为准，其他 DAW 与更广泛版本治理目前仍属于预留或后续演进空间。
