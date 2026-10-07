# 2026-10-07 稳定浏览版本

本地发布标签：`web/stable-browser-20261007`。沿用已验收 Catalog 与 Source，不执行游戏导出。

## 使用

- 设置中心新增“收藏与设置备份”：导出 JSON；选择文件后先预览，再点击“应用导入”。收藏按 Catalog 和物品标识合并，保留现有条目，最多500项。可单独恢复设置或合并收藏。
- 设置包含主页实际图标大小、目录页大小/数量、配方缩放、动画与分组折叠。历史、Catalog 数据和其他浏览器存储不进入备份。
- 浏览、历史、收藏播放原始纹理时间线，设置中心“播放物品动画”统一控制。首帧仍走已验收浏览包；可见图标按需读取后续帧。
- 旧离线副本使用“离线资料 → 校验与修复”补齐新增动画。本机3002副本已完成此步骤。

## 版本与构建

- `50adfa2`：上一轮已验收产品基线；标签 `baseline/recipe-workspace-20261007`。
- `4e35288`：个人备份与导入。
- `8d96bfb`：原生浏览/历史/收藏动画、取消与缓存、离线保存。
- 契约包保持 `0.37.6`；Catalog `e6d19ab18c9b98cdbc4417710b7403bdbe694dcd42bdc1c82908b4f767f45e5d`。

验证命令：`npm --prefix frontend test`（64项）、`npm --prefix frontend run typecheck`、`npm --prefix frontend run build`。

动画派生包的可复现步骤：

```text
node scripts/browser-animations.mjs <已验收Catalog目录> <新的输出目录>
python scripts/browser-pack.py <新的输出目录>
```

Python需要Pillow。将生成的 `manifest.json`、`index.json` 和 `textures/` 放到前端的 `browser-animations/<catalog-id>/`；保留原有 `browser-native`、`interaction`、`recipe-visuals`。29,462帧均通过RGBA比较，0差异、0缩放；116张无损WebP共5,610,168字节。

## 实机事实

浏览/历史可见流体与物品抽样8帧均有变化，静态石头等72项保持不变。关闭动画后采样0变化、0动画订阅标记。导入预览不会改变设置，应用后动画设置恢复。

在665px本机页面：12组滚轮跳页，身份更新14.6–28.6ms，图标首帧完成15.8–40.7ms。另60轮/1,020个滚轮事件最长51.5ms，无排队残留；纹理内存采样最大200,686,304字节，低于192MiB共享上限。这是本机已保存资料条件下的实测，不代表慢网首次访问时延。

离线保存已验证117个动画索引/图片文件，共6,184,146字节，SHA-256全部匹配。停止3002后端、关闭验证页、新开页面并启用浏览器offline再刷新；搜索、浏览/历史动画与指南针配方通过。此测试为新页面及新页面Worker，不宣称关闭了整个用户浏览器进程。

## 部署与回退

- 服务：`http://127.0.0.1:3002/`
- 前端：`E:/codex/NEI/.refactor-state/neonei-stable-browser-20261007/frontend/dist`
- 启动：`E:/codex/NEI/NeoNEI-local/Start.ps1`
- 回退：`E:/codex/NEI/NeoNEI-local/Rollback-stable-browser.ps1`。切回上一轮前端，不删除个人设置、收藏、Catalog 或历史证据。旧包保留。浏览器刷新后按应用版本校验切换离线页面。
- 交接及校验收据：`E:/codex/NEI/.refactor-state/acceptance/stable-browser-20261007/`

未实现库存、缺料清单、生产规划。所有Git提交和标签仅保存在本地，未推送。
