# 浏览区首帧缓冲实现计划

**目标：** 快速滚轮翻页不显示未绘制的图标，新目标不等待旧目标，页码与点击身份一致。

**架构：** 保留当前 DOM 画面，在独立的原生尺寸 Canvas 缓冲中准备下一页的完整静态首帧。版本控制器仅提交最新结果。ResidentIcon 同步复制准备好的首帧后接续原生动画；旧准备资源在替换或取消时释放。

**技术栈：** Vue 3、TypeScript、Canvas、现有 Atlas 与 PriorityPool、Node test。

执行完成：控制器、绘制缓冲、显示页身份、错误重试与连续滚动过渡跳过已实现。10 项定向测试通过，主仓库及兼容预览类型检查通过，兼容构建通过。浏览器 36 次翻页/反向采样没有零尺寸图标，包括 6 倍 CPU 降速短轮；45 个 Avaritia 图标和点击对象一致性检查通过。证据位于 .refactor-state/acceptance/paging-no-flash-20261011。

沿用当前用户正在使用的源码与 Catalog 36 兼容预览，不切换到不包含现有未提交 UI 修正的新 worktree。执行方式为当前会话内联执行，不提交或推送 Git。

## 任务 1：首帧提交控制器

- [ ] 新增 frontend/test/page-buffer.test.mjs。使用延迟的准备 Promise，检查旧画面保留、仅最新结果可提交、失败保留旧画面、取消后资源释放。
- [ ] `node --test test/page-buffer.test.mjs` 确认缺少模块时失败。
- [ ] 新增 frontend/src/browser/page-buffer.ts，提供 createPageBuffer(prepare, commit, failed)、stage、cancel、close，管理准备的 AbortController 与已提交缓冲的 dispose。
- [ ] 重跑上述测试，确认通过。

## 任务 2：可见页与准备页衔接

- [ ] 修改 useItemBrowser.ts，新增 loadedPage 与请求更新通知；在 resident 分支处理读取失败，保留旧列表。
- [ ] 新增 browser/prepare-page.ts，在现有前台优先级加载物品静态首帧并绘制原生尺寸 Canvas，取消/失败释放资源；支持 residentSprite 与 Catalog 备用图标，合法无纹理状态明确返回。
- [ ] 新增 components/native-surface/BufferedCatalogGrid.vue，准备期间保留已提交项目与图标，最新目标变化取消旧准备；提交后发出 pagePresented，失败发出 pageFault。
- [ ] ResidentIcon.vue 增加 prepared 首帧输入，同步绘制后启用现有动画。避免把后台準备动画全部帧作为翻页门槛。
- [ ] NativeBrowserSurface.vue 的 catalog 浏览区使用缓冲组件，历史及原生运行时沿用现有路径。
- [ ] HomePage.vue 与 HomeBrowserColumn.vue 传递 loadedPage；显示已提交页码，较慢时提示目标页，失败显示重试入口。
- [ ] 执行定向测试与 `npm run typecheck`。

## 任务 3：兼容预览与短轮实测

- [ ] 将相关新模块与兼容的修改同步到 .refactor-state/neonei-panel-resize-20261011/source/frontend，保留其既有 Catalog 36 契约与 Icon 实现。
- [ ] 兼容目录执行 `npm run typecheck` 与 `npm run build -- --outDir panel-dist`。
- [ ] 将 panel-dist 内容复制到活动 dist，保留运行时资源 Junction。
- [ ] 用当前浏览器验证快速連翻、反向、冷页、页码/点击绑定与动画。每次检查当前已提交页 Canvas 尺寸，合法透明帧不依赖非透明像素数判定。
- [ ] 新证据保存在 paging-no-flash-20261011，不修改之前的验收证据。保存截图与简洁事实报告。
