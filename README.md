# NeoNEI

The usage documentation page (`/usage-queries`) reads captured AE2/AE2FC cell
contents, OpenComputers manuals and native API annotations through the official
Catalog contract (`0.41.0-semantic.1`). Storage quantities retain full precision;
manual PNG bytes and navigation also work after saving the Catalog for offline
use. These are export-time item observations, not live world inventory queries.

当前开发检查点为 NESQL++ **0.45.0-semantic.13**、Compiler 与 contracts **0.41.0-semantic.1**，Source / Catalog revision **41**。这不是最终联合发布；整包实机数据、原生动画像素及完整原生中英文仍须统一导出批次验收。

当前主链直接读取 Compiler 清单声明并校验的 MessagePack 表和无损 WebP。浏览、共享查询、内容动画与离线保存不再要求网页脚本额外生成 browser-native、browser-animations、interaction 或 recipe-visuals sidecar。历史包原样保留，由对应旧查看器读取。浏览首帧与后续动画由 Compiler 按用途分图集，不缩放原生内容像素。本轮移除旧配方展示，不实现替代页面；查询、详情、选择和已有计算能力独立保留，调用方法见 [无界面配方接口](docs/recipe-selection.md)。


浏览 NESQL 采集、Elysium 编译后的物品与配方。当前分支为 `refactor/core`，新数据链路正在替换原有实现；完整 GTNH 领域覆盖与游戏验收尚未完成。

## 启动

需要 Node.js 24。先用独立的 `elysium-compiler` 将游戏 source 快照编译为 catalog：

```sh
elysium-compiler compile --input <source-snapshot> --output data/catalog
npm ci
npm run build
npm start
```

打开 http://127.0.0.1:3002。也可以复制 `.env.example` 为 `.env.local`，设置 `NEONEI_CATALOG_ROOT` 指向已有 catalog。没有数据集时显示明确错误，不自动载入样例或旧数据。Windows 的 `start-neonei.cmd` 在依赖安装后构建并启动同一个服务。

后端直接提供 Web 页面、只读 API 和不可变纹理资源。不会启动 SQL 导入、游戏源数据解析或另一套编译器。

## 当前能力

- 名称、注册名、矿辞与拼音搜索；NEI 顺序、模组/类型筛选、折叠分组、分页。
- 配方/用途索引、分类、候选输入、各候选的消耗方式和归还物、概率、精确数量、类型明确的条件。
- 领域资料页面、原生内容图标和动画；有界解码缓存、取消请求和组件资源释放。配方展示已退役，浏览/历史的选中意图和持久化保留；未来展示仅接入现有查询与计算接口。
- 快照固定的深链接、历史、书签和本机设置。切换数据集不会混用旧图集。
- 材料成分、实际部件与流体形态；电路板、配件系列与电压等级。专门的资料索引支持拼音搜索、分页和物品关联。
- 蜜蜂和树木的产物、默认基因、亲本/后代及条件说明；保留实际突变基因，明确区分基础概率与未提供概率的可能产物。

- 多方块整体构建预览与片段定义的搜索、物品关联和三维浏览；按数量/通道选择构建变体，链接、重载和离线读取保留所选参数。原生模型保留形状、纹理、颜色和透明表面，可切换方块示意；支持旋转、缩放、切层、隔离与定位，可查看方块数量及完整实体 NBT。未采集的外观与失败变体显示具体原因。按需加载并释放几何及纹理；专用实体和其他渲染器的游戏端适配仍在继续。
- 要素组成与物品要素数量、研究前置关系及发现线索。图标和名称来自共享数据，不再使用手写的要素哈希映射；明确显示快照知识的已知与未知状态。
- 魔法配方的基础 Vis/源质、研究条件、不稳定性与中心材料由共享接口保留；合成网格、槽位和候选匹配规则不依赖展示字段。随机费用使用稳定语义标识，不绑定单个模组发布号。
- 完整资料库离线浏览：主动保存同一快照的全部数据和纹理，断网后重新打开网站、搜索和读取资料；支持暂停、续传、校验修复与移除副本。配方查询与计算在无界面接口保留，在线与离线共用 `catalog` 模块。

OC Pattern 与样板导出已按要求移除。材料、电路、遗传和结构片段已有共享样本验证链路，实际游戏采集仍待验收；多方块完整装配、魔法及动态视图等迁移仍在进行，不能把尚未导出的数据当作空集合宣称完成。

## 检查

```sh
npm run check
npm run build
npm test
npx --prefix frontend playwright install chromium --only-shell
npm run e2e
```

行为检查覆盖 API、前端资源生命周期和浏览器交互。当前测试共用 `fixtures/semantic-40`，它来自当前 Java 样本工厂写入、实际 Rust Compiler 编译的纯语义样本；`fixtures/catalog` 中的历史快照保留供显式旧版本边界测试。样本测试不代表全量 GTNH 或完整原生双语验收。不会验证源码字符串或强制内部方法的位置与名称。

## 离线资料

通过 HTTPS 或 localhost 打开构建版本，在“离线资料”中选择“保存完整资料”。只有全部文件的大小、摘要与表结构通过检查后才标记为可离线浏览。没有完整副本时会明确提示；已有副本的网络请求失败时，只切换到相同快照的本地数据。

浏览器最多同时保存四份资料，下载可暂停后继续。副本存储在当前网站和浏览器中；浏览器清除网站数据后需要重新下载。界面会显示文件大小、存储配额与持久存储状态。大资料需要足够的磁盘空间；单个查询索引超过 256 MiB 的内存预算时会明确拒绝保存。全量 GTNH 的体积和性能仍待真实导出后验证。

## 发布

`npm run release` 将已构建的页面、离线页面缓存程序、共享查询模块、后端模块和根依赖锁文件写入 `release/neonei-web`。目录已存在时拒绝覆盖。发布包不包含游戏数据、数据库或本机设置。

需要保留正在使用的页面构建时，先用 `npm --prefix frontend run build -- --outDir <新的绝对目录>` 生成隔离页面，再设置 `NEONEI_WEB_BUILD` 为该目录执行 release。发布清单仍记录实际复制的每个文件，不切换运行中的服务。

在包内执行 `npm ci --omit=dev --workspace catalog --workspace backend` 安装生产依赖，然后可从仓库执行 `node scripts/check-release.mjs <发布目录>`。此检查核对文件摘要并启动实际发布包，用共享 catalog 验证接口、资料页、纹理和离线页面交付，不导入仓库源码作为替代。

`docker compose up --build` 使用同一个 Node 服务，并将 catalog 只读挂载。Docker 配置已更新，当前环境尚未执行容器构建验收。

契约由独立编译器仓库从 Rust 类型生成，三个 workspace 固定同一份 vendor 包；实际版本以各自 `package.json`、根锁文件和安装包为准。当前开发主链 Source/Catalog 修订为 41，移除 `views/tracks` 表和配方/类别的 `view` 字段；原生说明直接保留为 notes。新主干只读取当前契约，不再打包历史修订的解释器。旧离线副本继续保留并列出，使用对应旧查看器或重新下载当前资料；不会改写其修订、身份、文件，也不会迁移或清空浏览历史与收藏。前后端与发布包使用同一产物，`files.json` 记录大小和 SHA-256，NeoNEI 不导入编译器源码。

基因扫描区分分析状态与整叠处理，候选切换对应真实产物。关联随机产量显示精确整数范围及共享输入关系；这些范围不表示各项独立产出。原生必要信息在补充区域和完整明细中保留。在线和离线使用同一个 `quantityBounds` 整数实现。历史包和数据不会被自动清除。

前端脚本只保留当前存在的入口：`dev`、`build`、`typecheck`/`check`、`preview`、串行 `test` 与 `e2e`。旧 runtime-v3 等指向已不存在文件的命令已退出，不设置空成功替代。完整检查从仓库根运行上面的命令。



浏览查询以分片扫描构建有界检索索引，只常驻身份、顺序、分组与检索词；名称、提示文本和图标等展示记录按当前页读取。索引继续使用 256 MiB 估算预算，离线保存以同一查询实现验证可浏览性，文件保存进度按唯一路径计数。

离线查询通道最多发送 8 个并发操作，队列上限 2048；排队请求可取消，已发送请求在 Worker 确认结束后才释放并发名额。Worker 的 64 任务硬上限保持不变，避免首页图标突发查询造成永久占位。
