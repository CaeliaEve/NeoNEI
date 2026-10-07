# 自适应加载实现计划

**目标：** 降低连续翻页和首次配方延迟，自动完成安全缓存交接与单资源修复。
**架构：** 保留 Resident、Catalog、Atlas 和 ServiceWorker，增加小型预取策略与校验缓存读取器。
**技术栈：** TypeScript、Vue、Worker、CacheStorage、现有 node:test。

- [x] 方向预取：先在 `frontend/test/adaptive-loading.test.mjs` 用固定时间/页码验证前进、反转与边界；实现 `browser/prefetch.ts` 并接入 `resident.ts`。当前页发布不依赖图片，四页/四图集上限。
- [x] 配方首屏：测试首帧候选与取消；修改 `recipe-warm.ts`、`bootstrap.ts`、`elysiumFacade.ts` 与 Catalog 优先级传递。并行读取物品资料，复用原生帧，不加载非首屏候选图标。
- [x] 缓存修复：测试坏缓存仅补取目标且拒绝错误网络内容；增加 `browser/verified-cache.ts`，接入原生索引、原生贴图和交互分片。
- [x] 更新交接：测试匹配/不匹配文档、安装失败仍保留旧壳；修改 `offline/shell.ts`、`offline/service.ts`，启动时监听并激活匹配的已验证版本。
- [x] 运行 `npm --prefix frontend test`、`npm --prefix frontend run typecheck`、`npm --prefix frontend run build`。使用浏览器本地开发能力测候选，保存实测记录。
- [x] 保留旧包，候选验证后更新 `NeoNEI-local/Start.ps1` 指向新包，验证实际 3002 页面与离线重开；记录完成情况与限制。

本轮内联执行；不提交包含前轮工作的脏工作区。
