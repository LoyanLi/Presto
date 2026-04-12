# Presto Product Landing

这个目录保存 Presto 的静态产品落地页，不依赖桌面宿主构建流程。

## 本地预览

从仓库根目录运行：

```bash
npm run landing:preview
```

- 默认从 `presto-product-landing/` 提供静态文件。
- 默认端口是 `4173`。
- 如果端口被占用，预览脚本会自动顺延到下一个可用端口。
- 如果需要固定 host，可以设置 `PRESTO_PREVIEW_HOST`。

也可以直接调用脚本：

```bash
node scripts/preview-static.mjs presto-product-landing 4173
```

## 目录约束

- `index.html` 必须只引用当前目录内的 `styles.css`、`main.js` 和 `assets/`。
- 产品截图和品牌图都放在 `assets/`，不要依赖仓库外层资源路径。
- 页面文案保持用户向，不把宿主内部术语直接暴露到营销页。

## 验证

运行当前目录相关测试：

```bash
node --test presto-product-landing/*.test.mjs
```
