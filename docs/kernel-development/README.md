# 内核开发

这一组文档面向项目内部研发，范围包括桌面宿主、Rust runtime、后端能力层、contracts、SDK 和跨边界通信。

## 阅读顺序

1. [架构总览](architecture-overview.md)
2. [桌面运行时](desktop-runtime.md)
3. [后端能力层](backend-capabilities.md)
4. [Contracts 与通信边界](contracts-and-communication.md)

## 适用问题

- 宿主现在到底由哪些进程和模块组成
- Tauri、Rust runtime、FastAPI 之间如何连通
- capability 是怎么注册、调用、校验和返回的
- 哪些改动应该落在 `contracts`，哪些应该落在 `sdk-core` 或 `sdk-runtime`
