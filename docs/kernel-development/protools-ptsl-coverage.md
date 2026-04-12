# Pro Tools PTSL 覆盖策略

这份文档只回答一个问题：

在当前版本线里，`Presto` 应该怎样扩 `Pro Tools` 支持面，以及“完整覆盖 `PTSL`”在这里到底是什么意思。

## 1. 版本边界

当前版本策略固定如下：

- `0.3.x` 只继续扩 `Pro Tools`
- `0.3.x` 不新增任何非 `pro_tools` 的 `supported` DAW target
- `logic`、`cubase`、`nuendo` 在 `0.3.x` 里继续只保留为 `reserved`
- `0.4.x` 才开始新增其他 `DAW` runtime 的真正实现

这意味着：

- `backend/presto/application/daw_runtime.py` 这条接缝要继续保留
- `packages/contracts-manifest/daw-targets.json` 的 `reserved` 列表可以继续保留多目标预留
- 但 `supported` 在 `0.3.x` 内仍然只能是 `["pro_tools"]`

## 2. 当前覆盖现状

截至当前代码基线，`Pro Tools` 相关能力分成三层：

### 2.1 Public capability 面

- `packages/contracts-manifest/capabilities.json` 当前共有 `55` 个 public capability
- 这 `55` 个 capability 当前全部只声明 `supportedDaws = ["pro_tools"]`
- 其中显式依赖 `daw` 的 public capability 有 `35` 个

这层是正式产品协议面。

### 2.2 内部 PTSL catalog 面

- `backend/presto/integrations/daw/ptsl_catalog_generated.py` 当前生成出 `159` 个 `PTSL` 命令
- 其中 `116` 个命令已经能映射到 `py-ptsl` 的 `ops` wrapper

这层是 `Pro Tools` 低层命令事实源，不是 public contracts。

### 2.3 Pro Tools adapter 实际消费面

`backend/presto/integrations/daw/protools_adapter.py` 当前已经通过显式命令名消费一小部分 `PTSL` 命令族，集中在：

- track state toggle
- track selection / rename / pan / color
- session read
- transport
- import / export

当前 adapter 显式使用的命令族仍是 catalog 的小子集，而不是全量 `PTSL`。

## 3. “完整覆盖 PTSL” 的正确定义

这里必须先把两个概念分开。

### 3.1 可以做，也应该做的目标

`0.3.x` 可以追求的是：

- `Pro Tools` 内部命令层完整覆盖 `PTSL`

它的含义是：

- backend 内部能够基于 catalog 解析并执行任意已知 `PTSL` 命令
- `ProToolsAdapter` 或其下游内部层不再依赖零散手写 command id lookup
- 命令版本、错误模型、catalog 完整性和 coverage inventory 都成为系统事实

这是正确的 `0.3.x` 目标。

### 3.2 不应该做的目标

`0.3.x` 不应该追求：

- 把每一个 `PTSL` 命令都直接暴露成 public capability

原因很直接：

- public capability 是产品语义协议，不是 `Avid SDK` 命令镜像
- 如果把 raw `PTSL` 命令直接暴露到 public contracts，插件权限、SDK client、schema 和长期兼容边界都会被 `PTSL` 命令模型污染
- 这样会把 `Pro Tools` 的低层实现细节直接抬升成宿主与插件正式协议

所以这里的结论必须明确：

- `完整覆盖 PTSL` 只应该指 backend-private 的 `Pro Tools` 内部命令层
- 不应该指 public capability 形状与 `PTSL` 一一对应

## 4. 0.3.x 的正确范围

`0.3.x` 内关于 `Pro Tools` 的工作边界应该固定为：

1. 继续扩完整的内部 `PTSL` 命令层
2. 继续把现有零散 `Pro Tools` 低层调用收口到统一 runner / adapter 内部边界
3. 只把已经稳定、具备明确产品语义的能力分批提升到 public capability
4. 保持多 `DAW` 扩展接缝，但不在 `0.3.x` 内接通新 `DAW`

这四点缺一不可。

## 5. 代码边界应该保持什么不变

为了让 `0.4.x` 的多 `DAW` 扩展仍然走最短路径，当前必须保持以下边界不变：

- `packages/contracts-manifest/capabilities.json` 继续只描述 public product capabilities
- `backend/presto/integrations/daw/ptsl_*` 继续只属于 backend-private 的 `Pro Tools` 低层实现
- `backend/presto/application/daw_runtime.py` 继续是唯一 `target_daw -> runtime dependencies` 解析入口
- `packages/contracts-manifest/daw-targets.json` 中 `supported` 的增加只能发生在真实 runtime factory 落地之后

## 6. 0.4.x 的启动条件

只有在下面这些条件都成立时，才应该开始 `0.4.x` 的其他 `DAW` 扩展：

- `Pro Tools` 内部 `PTSL` 覆盖已经成为清晰、可测试、可盘点的事实
- public capability 边界仍然保持产品语义，而不是 `PTSL` 镜像
- 新 `DAW` 有自己独立的 adapter、runtime factory、必要的 UI automation / profile 入口
- 新 `DAW` 的支持事实会通过 `daw-targets.json` 与 capability metadata 正式声明，而不是只加类型预留

## 7. 当前结论

结论只保留一条：

- `0.3.x` 继续把 `Pro Tools` 做深，目标是内部 `PTSL` 完整覆盖，不是 public capability 镜像化；`0.4.x` 再开始做其他 `DAW`

对应实施计划保留为本地 planning 文件，不进入 git。
