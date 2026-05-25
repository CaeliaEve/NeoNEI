# NeoNEI / NESQL++ 巨大重构最终方案

日期：2026-05-24  
状态：已批准，作为后续大重构主蓝图  
目标：把 NeoNEI 从“网页查询系统”升级成接近原生 NEI 体感的成熟公共网站与数据平台。

---

## 1. 最终结论

最终架构选择：

> **NESQL++ 只负责游戏内真实数据采集；新增 NeoNEI Data Compiler 负责离线编译；后端数据库负责版本治理和发布管理；前端只负责常驻索引查询和 Canvas/WebGL 展示。**

不要继续让前端承担大量运行时计算，也不要把搜索关键路径压到后端数据库请求上。公共网站要做到原生 NEI 体感，关键路径必须是：

```text
用户输入 / 翻页
→ 浏览器常驻 Worker 查询本地索引
→ 本地分页投影
→ Canvas/WebGL 从全局 Atlas 直接绘制
```

后端、数据库、源数据文件都负责“生产和治理数据”，不进入搜索和翻页的即时路径。

---

## 2. 当前项目主要不足

### 2.1 数据链路职责混杂

当前逻辑分散在：

- `NESQL++`：游戏内导出、部分数据整理、贴图处理。
- `NeoNEI/backend`：数据服务、发布包、搜索包、atlas、分组。
- `NeoNEI/frontend`：搜索、分页投影、缓存、渲染、fallback。

风险：

- 配方分类容易重复或分裂。
- 右侧浏览区分组和游戏内 NEI 不一致。
- 搜索结果和默认浏览顺序不一致。
- 贴图和动画容易错位或延迟。
- fallback 越积越多，性能不可控。

### 2.2 搜索仍然不是 NEI 式常驻索引

现状证据：

- `NeoNEI/frontend/src/workers/browserSearch.worker.ts`
  - 当前搜索仍在 `searchPack` 上执行 `filter -> map(rankEntry) -> filter -> sort`。
  - 这是全表扫描 + 排序，不是索引查询。

- `NeoNEI/frontend/src/composables/useItemBrowser.ts`
  - 存在 `SEARCH_LOCAL_PROJECTION_MAX_TOTAL = 1600`。
  - 超过限制后会离开本地投影快路径。

- `NeoNEI/frontend/src/services/api.ts`
  - 仍有 `getBrowserSearchCatalog`、`getBrowserSearchPack`、`getBrowserSearchPackShard`。
  - 搜索过程中仍可能等待静态包、后端接口或缓存。

### 2.3 发布数据体积和历史产物过大

实测当前：

- `NeoNEI/backend/data/publish` 历史发布目录约 27GB。
- 单个 `search/all.json` 约 50MB。
- `search/shards/all/tail.json.gz` 约 5MB。

继续堆 JSON 搜索包不是长期成熟方案，需要二进制/紧凑索引和发布目录清理策略。

### 2.4 前端承担过多计算

前端现在还承担：

- 搜索扫描。
- 排序。
- 页面投影。
- 资源补全。
- fallback 判断。
- 部分分组展开逻辑。

目标架构中，这些计算应尽量前移到导出/编译阶段，前端只消费编译结果。

### 2.5 缺少强校验系统

目前大量正确性依赖人工打开网页检查。成熟项目必须每次导出/编译都产出可机器验证的报告。

---

## 3. 目标架构

### 3.1 总体数据流

```text
Minecraft / GTNH
  ↓
NESQL++ raw exporter
  ↓
raw-export 源数据
  ↓
NeoNEI Data Compiler
  ↓
dist-data 静态高性能资源包
  ↓
Object Storage / CDN
  ↓
NeoNEI Browser Runtime
```

---

## 4. NESQL++：游戏内真实数据采集器

### 4.1 职责

NESQL++ 保留 Java / Forge 技术栈，因为它必须运行在 GTNH / Minecraft 内。

它只负责采集：

- 物品。
- 流体。
- 配方。
- NEI handler 元数据。
- NEI 排序。
- NEI 分组/折叠信息。
- 贴图和动画源信息。
- 多方块蓝图。
- 实体和特殊 handler 数据。

### 4.2 不再负责

NESQL++ 不应再负责：

- 前端搜索索引结构。
- 网页专用分页包。
- 前端 UI 适配逻辑。
- 复杂网页 atlas 策略。

这些转移给 Data Compiler。

### 4.3 推荐 raw-export 格式

```text
raw-export/
  manifest.json
  items.jsonl
  fluids.jsonl
  recipes.jsonl
  groups.jsonl
  nei_order.jsonl
  textures.jsonl
  animations.jsonl
  nei_handlers.jsonl
  multiblocks.jsonl
  entities.jsonl
  export_report.json
```

### 4.4 导出器目标

- 支持断点续导。
- 支持阶段选择。
- 支持失败重试。
- 支持导出进度 GUI。
- 支持导出质量报告。
- 优先保证游戏内真实数据完整性。

---

## 5. NeoNEI Data Compiler

### 5.1 技术选择

新增独立编译器：

```text
neonei-compiler
```

推荐语言：**Rust**。

原因：

- 适合大数据文件处理。
- 并行性能好。
- 适合二进制索引。
- 适合 atlas 编译。
- 适合生成强校验报告。
- 后续可复用部分逻辑到 WASM。

### 5.2 输入

```text
raw-export/
```

### 5.3 输出

```text
dist-data/
  manifest.json

  browser/
    item-catalog.bin
    item-catalog.debug.json
    group-index.bin
    nei-order.bin

  search/
    search-index.bin
    exact-index.bin
    prefix-index.bin
    pinyin-index.bin
    acronym-index.bin
    mod-buckets.bin
    rank-table.bin

  recipes/
    recipe-index.bin
    recipe-category-index.bin
    recipe-ui-payloads/

  textures/
    atlas-manifest.json
    static-atlas-*.webp
    animated-atlas-*.webp
    animation-table.bin

  validation/
    report.json
    missing-textures.json
    missing-recipes.json
    duplicate-categories.json
    search-coverage.json
```

### 5.4 编译器职责

- 源数据规范化。
- 生成 NEI 顺序表。
- 生成折叠分组表。
- 生成搜索倒排索引。
- 生成拼音/首字母索引。
- 生成配方索引。
- 生成 atlas 与动画表。
- 输出校验报告。
- 支持增量编译。

---

## 6. 后端数据库与发布系统

### 6.1 数据库选择

长期成熟项目推荐：

```text
PostgreSQL
```

用途不是搜索关键路径，而是治理：

- 数据版本。
- 导出批次。
- 编译记录。
- 校验报告。
- 发布状态。
- 多 GTNH 版本管理。
- 用户反馈。
- 回滚记录。

### 6.2 后端职责

NeoNEI backend 保留 TypeScript / Node.js，职责调整为：

- 管理数据版本。
- 管理构建任务。
- 提供校验报告 API。
- 提供发布 manifest。
- 管理 CDN 发布。
- 管理回滚。

### 6.3 不进入关键路径

以下操作不应依赖后端实时查询：

- 搜索。
- 右侧浏览区翻页。
- 常规物品贴图显示。
- 搜索结果分页。

这些必须由浏览器本地 Worker + 静态资源包完成。

---

## 7. 前端最终架构

### 7.1 保留 Vue 3

不建议现在换 React / Svelte。

原因：

- 当前大量 UI 已经在 Vue。
- 真正瓶颈不是 Vue，而是数据结构和搜索链路。
- 换框架风险大，收益低。

### 7.2 前端分层

```text
UI Layer
  Vue components
  Recipe pages
  Settings panel

Runtime Layer
  SearchWorkerV3
  BrowserIndexWorker
  RecipeIndexWorker
  AssetRuntime

Render Layer
  Canvas 2D
  WebGL Atlas Renderer
```

### 7.3 搜索关键路径

```text
searchQuery
  → SearchWorkerV3
  → index lookup
  → itemIds
  → local page projection
  → HomeCanvasGrid
  → global atlas draw
```

禁止在关键路径中：

- 请求 `/items/browser/search-catalog`。
- 加载 page-pack。
- 扫全量 searchPack。
- 等后端返回搜索结果。
- 等单独 PNG/GIF 贴图加载。

---

## 8. Search Core V3

### 8.1 目标

实现接近原生 NEI 的搜索体验：

- 中文搜索。
- 拼音搜索。
- 首字母搜索。
- 英文搜索。
- internalName 搜索。
- mod 筛选。
- 分组/折叠搜索。
- NEI 顺序排序。

### 8.2 索引结构

```text
exact-index
prefix-index
pinyin-index
acronym-index
mod-buckets
rank-table
item-metadata-table
```

### 8.3 查询流程

```text
normalize(query)
  → exact hits
  → prefix hits
  → pinyin hits
  → acronym hits
  → alias/internalName hits
  → merge candidates
  → rank-table order
  → page slice
```

### 8.4 目标延迟

| 操作 | 目标 |
| --- | ---: |
| 输入到结果刷新 | 20 - 60ms |
| 拼音搜索 | 30 - 80ms |
| 首字母搜索 | 15 - 50ms |
| 搜索结果翻页 | 16 - 35ms |
| 后端参与 | 0ms |

---

## 9. 贴图与动画最终方案

### 9.1 统一 Atlas

```text
static-atlas-*.webp
animated-atlas-*.webp
animation-table.bin
atlas-manifest.json
```

### 9.2 渲染流程

```text
itemId
  → atlas entry
  → static frame or animation frame
  → Canvas/WebGL draw
```

### 9.3 要求

- 动画速度来自游戏导出数据。
- 不在前端设置里自行猜动画速度。
- 搜索和翻页时不得触发单图请求。
- 贴图缺失必须进入 validation report。

---

## 10. 配方页长期方案

当前大量机器 UI 手写，维护成本高。长期要改成：

```text
NEI handler metadata
  → recipe-ui-payload
  → NeoNEI visual skin renderer
```

原则：

- 游戏内 NEI handler 决定数据结构。
- Data Compiler 转成统一协议。
- NeoNEI 用自己的视觉风格渲染。
- 高级页面仍可手写皮肤，但底层输入输出、流体、能量、时间、概率等字段应协议化。

---

## 11. 验证系统

每次导出/编译必须生成：

```text
validation/report.json
```

至少包含：

- 物品总数。
- 流体总数。
- 配方总数。
- 每个 mod 覆盖率。
- 每个 NEI handler 覆盖率。
- 缺失贴图数量和明细。
- 缺失动画数量和明细。
- 搜索索引覆盖率。
- 分组覆盖率。
- NEI 排序覆盖率。
- 重复配方分类。
- 异常 itemId。
- atlas 命中率。

---

## 12. 分阶段开发清单

### Phase 0：基线与保护

- [x] 记录当前 NeoNEI / NESQL++ 分支和提交（`validation/runtime-v3-baseline.json`）。
- [x] 建立重构专用分支（`rebuild/neonei-runtime-v3`）。
- [x] 固化当前可运行数据集（`.tmp-runtime/dist-data-v3-self-test` smoke baseline；完整 GTNH 数据通过 `DIST_DATA_V3_DIR` 校验）。
- [x] 建立性能基线：搜索、贴图、配方打开（baseline JSON + benchmark reports）。
- [x] 建立最小回归样本：铁锭、泰拉钢、神秘法杖、奇点、EEC、生物掉落、GT 机器（`validation/runtime-v3-regression-samples.json` + `validate:runtime-v3`）。

验收：

- [x] 有可复测性能报告。
- [x] 有可回滚提交点。

### Phase 1：Search Core V3

- [x] 设计 search-v3 schema。
- [x] 后端/编译阶段生成 search-v3 JSON 原型。
- [x] 新增 `SearchWorkerV3`。
- [x] 搜索关键路径切到 V3。
- [x] 移除搜索时旧后端请求。
- [x] 移除搜索时全表扫描。

验收：

- [x] 搜索输入到刷新 p50 < 60ms。
- [x] 搜索输入到刷新 p95 < 120ms。
- [x] 搜索期间 Network 不出现 search-catalog 请求。

### Phase 2：浏览区索引 V3

- [x] 编译 NEI 顺序表。
- [x] 编译折叠分组表。
- [x] 浏览区分页改成本地投影。
- [x] 搜索结果分页和默认浏览分页使用同一套 item catalog。

验收：

- [x] 默认翻页 p50 < 35ms。
- [x] 搜索翻页 p50 < 35ms。
- [ ] 分组位置与游戏内 NEI 基本一致（已补 catalog 顺序/分组完整性 gate；仍需完整 GTNH 导出对齐验证）。

### Phase 3：Atlas 与动画重构

- [x] 明确 static atlas 与 animated atlas 产物格式。
- [x] 编译 animation-table。
- [x] 浏览区贴图只走 global atlas。
- [x] 清理低性能单图 fallback。
- [x] 新增 Browser Atlas V3 覆盖率门禁（catalog -> atlas -> animation-table 全链路 100% 覆盖）。

验收：

- [ ] 快速翻页时贴图一帧内显示（已补 Browser Atlas V3 coverage gate；仍需浏览器端视觉帧验证）。
- [ ] 动图速度接近游戏内。
- [ ] 奇点、无尽贪婪、NASA 火箭等动画样本正确。

### Phase 4：Data Compiler 原型

- [x] 新建 `neonei-compiler`。
- [x] 读取 raw-export。
- [x] 输出 search/browser/texture 的第一版编译产物。
- [x] 输出 validation report。

验收：

- [x] 编译器可重复运行。
- [x] 编译结果可被 NeoNEI 加载。
- [x] 校验报告可定位缺失项。

### Phase 5：配方索引与 UI 协议

- [x] 设计 recipe-index。
- [x] 前端配方 bootstrap 优先读取 dist-data V3 item-index。
- [x] 设计 recipe-ui-payload 协议。
- [x] 编译器输出 dist-data V3 recipe-ui-payload index 与单配方 payload。
- [x] 先接入 3-5 个复杂 handler 样本。
- [x] 保留现有高级手写 UI，但底层数据统一协议化。
- [x] 新增配方分类分裂审计（duplicate display-name split 进入 validation report）。

验收：

- [x] 常见配方打开 p50 < 150ms（Recipe V3 benchmark：p50 0.84ms，2026-05-25）。
- [x] 复杂配方打开 p95 < 300ms（Recipe V3 benchmark：p95 3.97ms，2026-05-25；覆盖本地 publish payload 解析/打开代理）。
- [ ] 配方分类不再重复分裂（已补 validation 审计；仍需用完整 GTNH 数据清零验证）。

### Phase 6：PostgreSQL 与发布系统

- [x] 建立版本表。
- [x] 建立导出批次表。
- [x] 建立编译记录表。
- [x] 建立校验报告表。
- [x] 建立发布/回滚流程。
- [x] 设计 CDN 静态资源发布结构。

验收：

- [x] 可保留多个 GTNH 数据版本（publish retention 默认保留 3 个版本）。
- [x] 可查看每次导出/编译质量（`GET /api/publish/releases` 返回 build-report 摘要、体积、警告、recipe coverage）。
- [x] 可回滚到上一版数据（`POST /api/publish/releases/:sourceSignature/activate` 激活保留版本）。

### Phase 7：旧路径清理

- [x] 搜索关键路径优先使用 dist-data V3。
- [x] 浏览区 page-pack / by-id-pack / home-bootstrap 优先使用 dist-data V3。
- [x] 搜索关键路径删除旧 fallback。
- [x] 浏览区删除低性能补图路径。
- [x] 清理历史 publish 产物保留策略。
- [x] 移除不再使用的 API。

验收：

- [x] 没有旧慢路径拖慢 V3。
- [x] 失败时明确报错，不静默退化到低性能路径。

---

## 13. 性能目标

| 项目 | 目标 |
| --- | ---: |
| 首页二次加载 | < 1s |
| 搜索输入到刷新 p50 | < 60ms |
| 搜索输入到刷新 p95 | < 120ms |
| 拼音搜索 p95 | < 150ms |
| 右侧翻页 p50 | < 35ms |
| 右侧翻页 p95 | < 80ms |
| 贴图显示 | 一帧内 |
| 常见配方打开 p50 | < 150ms |
| 复杂配方打开 p95 | < 300ms |

---

## 14. 风险与缓解

### 风险 A：搜索顺序和 NEI 不一致

缓解：

- 从 NESQL++ 导出 NEI 原始排序。
- Data Compiler 生成 rank-table。
- 前端不重新发明排序规则。

### 风险 B：贴图和动画错误

缓解：

- atlas 编译阶段输出缺失报告。
- animation-table 使用游戏导出的帧时长。
- 保留样本集做视觉回归。

### 风险 C：二进制格式调试困难

缓解：

- 每个 `.bin` 同时输出 `.debug.json`。
- 先 JSON 原型验证，再切二进制。

### 风险 D：一次性重构范围过大

缓解：

- 按 Phase 分支推进。
- 每个 Phase 都能单独验收。
- 保持可回滚。

### 风险 E：旧 fallback 影响真实性能

缓解：

- V3 关键路径禁止静默 fallback。
- 开发 fallback 必须显式开关。
- 性能测试中监控 Network 和 Worker 耗时。

---

## 15. 后续执行规则

1. 先做 Phase 0 / Phase 1，不直接全量推倒。
2. 每轮结束必须更新本计划勾选状态。
3. 每轮结束必须提交并推送对应仓库。
4. 不把临时文件、日志、大型历史 publish 产物提交。
5. 任何性能优化必须附带测量数据。
6. 任何导出结构变化必须附带 validation report。


#### 2026-05-25 Runtime V3 cleanup progress

- 浏览区主页 bootstrap、分页 page-pack、by-id 资源包、默认/搜索 catalog、搜索 pack/shard 已优先走 dist-data V3。
- 搜索 catalog 不再请求 `/items/browser/search-catalog`；缺失 dist-data 时只使用本地已驻留目录做空成本诊断，不再触发旧后端搜索。
- `SearchWorkerV3` 已使用 exact / prefix / gram 候选索引，查询阶段只对候选集 rank/sort，不再对全量 search pack 做逐项扫描。
- 浏览区 atlas index / atlas entries 不再请求旧 `/render-contract/browser-atlas-*` 热路径；全局 browser atlas 是主页贴图权威来源，缺项显示 coverage gap。
- Data Compiler 已输出 `textures/animation-table.json`，manifest 暴露 `files.animationTable`，动画帧时长从 raw export / atlas index 归一化生成。
- 快速翻页时 active page 的 atlas warm 由延迟 450ms 改为立即调度，避免“翻到页面后再等半秒补图”。
- 前端已移除 page-scoped atlas API 客户端调用；`pageAtlas.ts` 仅保留类型与显式空 peek，防止浏览区回到 `/items/page-atlas` 慢路径。
- 发布物料生成后自动保留最近 `PUBLISH_RETAIN_RELEASES` 个版本（默认 3，始终保留当前 source signature），避免历史 publish 无限膨胀。
- 验证：test:raw-export-v3、typecheck、build、bench:search-v3 通过；最新 search-v3 gate max 约 12.91ms。

---

## 16. 最终目标

把 NeoNEI 做成：

> **公共网页版 NEI：不需要进游戏，也能用接近原生 NEI 的速度搜索、翻页、查看配方、查看贴图动画和特殊 handler 数据。**

完整落地后的目标体感：

> **原生 NEI 的 85% - 95%。**

#### 2026-05-25 Runtime V3 animation-path tightening

- [x] Homepage browser grid now treats global browser atlas as the authoritative animation path; legacy per-item render-contract, native-sprite probe, animated-atlas probe, and direct GIF probe imports/calls were removed from `HomeCanvasGrid.vue`.
- [x] Browser animation redraw now follows `requestAnimationFrame` and uses the exported V3 timeline durations through `resolveTimelineFrameIndex`, instead of a fixed 50ms frontend timer.
- [x] `validate:runtime-v3` now checks animated browser-atlas entries against `textures/animation-table.json`, flags missing timelines/table entries, invalid frame durations, and atlas/table timeline mismatches.
- [x] Self-test validation has 1 animated atlas item and 0 animation timing failures; full GTNH dataset still needs `DIST_DATA_V3_DIR=<full dist-data>` validation for singularities, Avaritia, NASA rocket, Thaumcraft wand/staff, and EEC samples.
