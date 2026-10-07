# 配方工作区实现计划

> 采用 subagent-driven-development，逐项实现并审查；性能与集成由主代理负责。

**目标：** 完成已授权首开性能与三项工作区功能。
**架构：** 复用 Catalog/Interaction 的不可变数据读取，独立材料模型与按需 Vue 面板，已有 preferences 负责收藏。
**技术栈：** TypeScript / Vue 3 / Node test / Vite / 浏览器 CDP。

## 全局约束
原生像素、NEI 排序、紧凑布局不变；使用同一已验收 Catalog；不提交混杂旧修改。测试轻量；错误不得隐藏。金额/数量不使用浮点累加。新工具默认折叠，离线可用。

### Task 1：首开性能
- [x] 采集旧版未悬停点击数据、图像就绪与请求阶段。
- [x] 用轻量测试证明目录/首屏重复路径与取消边界，再减少关键路径读取。
- [x] 对同样输入复测并记录事实，不保证任意设备绝对瞬时。

### Task 2：材料与对比
- [x] 新增独立 recipe-tools 运算模块与失败测试：批次、候选、保留工具、归还、概率及动态数量。
- [x] 实现 RecipeTools.vue 并集成 CatalogRecipe.vue，按需材料清单与两份原生配方对比；配方更换取消旧读取。
- [x] 运行相关测试和类型检查，形成独立审查记录。

### Task 3：历史收藏
- [x] 新增纯持久化/列表合并行为测试，沿用 preferences.bookmarks，当前 Catalog 过滤。
- [x] 在 HomeHistoryStrip 与 NativeBrowserSurface 接入切换和收藏动作，不覆盖配方/用途点击。
- [x] 验证刷新恢复、空态、离线与不改变历史点击。

### Task 4：收尾
- [x] 审查各任务差异，修复实际问题。
- [x] frontend test / typecheck / build。
- [x] 生成独立候选前端包并实际浏览器验收，保留截图与性能数据。
- [x] 切换 3002，验证已验收 Catalog 和原生图像；停服离线验证后恢复服务。
- [x] HANDOFF / receipt 全量哈希核验，清理测试服务与标签。
