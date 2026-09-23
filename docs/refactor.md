# NeoNEI 重构边界

`refactor/core` 已切换到新 catalog 链路。完整 GTNH 领域迁移和游戏验收仍在进行。OC Pattern、样板导入及样板导出已取消。

## 数据和模块

输入依赖产物由 `Output.change` 描述。查询按页补齐所有结果示例及原始模板；界面随中心候选切换结果，从具体输入/产物进入时选择相应候选。选择由 Recipe 统一管理，Slot 只管理自己的展开状态。规则和当前结果 NBT 可展开检查；Vue 显示编译后的记录，不执行游戏函数。所有样本都参与反向查询，在线与完整离线资料库保持相同结果。

页面只消费 `elysium.catalog`。Rust 是契约权威，发布 `@elysium/contracts` 的 schema、TypeScript 类型和解码器；前后端锁定同一 tarball。没有旧 JSON、SQL、runtime、WASM 或 URL 兼容入口。

法杖替换沿用通用 Recipe/Slot：输入候选切换时产物 NBT 同步更新；匹配提示区分键值、存在和缺失。patch 的多根替换与数值裁剪可展开查看。供能说明区分额外法杖和输入自行付款，保留/清空配置、容量、玩家折扣及创造模式豁免均按契约展示。默认样本不冒充自行付款后的精确余量。payment 的要素引用也由共享查询补齐，在线与离线一致；任意未知 NBT 的反向匹配仍不是当前索引能力。

当前契约为 0.11.0，source/catalog 修订 11。配方候选各自拥有匹配规则，网格独立于截图；魔法成本和研究通过 Related.topics 统一加载图标与资料引用。视图 cost 元素可跳转到对应要素。结构 variants 列表为各组参数保存构建引用或失败原因，builds/blocks/models 集合保留实际方块、完整NBT、控制器坐标和外观；几何共用Cell.index。旧离线副本提示下载当前资料，不进行旧格式转换。

| 模块 | 职责 |
| --- | --- |
| `catalog/src` | 存储无关的清单/分片验证、只读查询与响应结构 |
| `backend/src/catalog` | 本地文件读取、快照管理与 HTTP |
| `frontend/src/catalog` | 固定快照的客户端、图集、动画时钟和精确格式化 |
| `frontend/src/offline` | IndexedDB 副本、Worker 查询、完整保存和离线页面缓存 |
| `frontend/src/components` | 游戏文本、物品/流体链接、槽位、配方、类型化属性 |
| `frontend/src/state` | 共用快照会话、请求取消、过期结果隔离、本机书签、历史与设置 |

后端使用 Express 5 的 async handler。配方筛选分批读取紧凑 `index`，只对当前页读取完整 Recipe；分类筛选只解析引用的名称。失败的 memo 会清除，磁盘数据修复后可以重试。

图集缓存以解码字节计费，预算 192 MiB，最多并发加载 3 页。组件共享租约，释放后关闭 bitmap；单一动画时钟在页面不可见时暂停。资源错误显式显示，不以占位纹理冒充采集成功。

## HTTP

配方接口通过 `Related.tracks` 批量加载当前页引用的动画轨迹。在线和离线查询共用去重及引用预算；每张配方卡的动态图层共用播放相位。暂停保留当前帧并解除动画回调，恢复不重新请求纹理；图层在不可见或组件销毁时释放订阅。背景与文字覆盖层不拦截槽位点击，裁剪播放只解释明确的矩形区域，不执行导出端脚本。

| 入口 | 内容 |
| --- | --- |
| `GET /api/health` | 数据就绪状态，未就绪返回 503 |
| `GET /api/catalog` | 当前快照清单，no-cache |
| `GET /api/catalog/:catalog` | 按内容 ID 固定的清单 |
| `GET /api/catalog/:catalog/facets` | 模组、类型和分组筛选 |
| `GET /api/catalog/:catalog/items` | 搜索和分页物品/流体，附当前页纹理描述 |
| `GET /api/catalog/:catalog/recipes` | 指定物品的配方或用途，分类计数和当前页引用 |
| `GET /api/catalog/:catalog/recipes/:id` | 单个配方及其引用 |
| `GET /api/catalog/:catalog/topics` | `kind=material/circuit/bee/tree` 的搜索、分页和物品关联 |
| `GET /api/catalog/:catalog/materials/:id` | 材料、组成名称及部件引用 |
| `GET /api/catalog/:catalog/circuits/:id` | 电路板、配件系列、等级及物品引用 |
| `GET /api/catalog/:catalog/species/:id` | 物种、基因、产物、来源/参与突变计数及引用 |
| `GET /api/catalog/:catalog/species/:id/mutations` | `direction=origins/crosses`、offset/limit；当前页突变、物种索引和引用 |
| `GET /api/catalog/:catalog/structures/:id` | 控制器、说明、结构片段、规则和物品引用 |
| `GET /api/catalog/:catalog/structures/:id/shapes` | `piece`、offset/limit；只读取当前页几何块，limit 最大 8 |
| `GET /api/catalog/:catalog/builds/:id` | 整体构建、方块调色板、完整实体NBT和物品引用 |
| `GET /api/catalog/:catalog/builds/:id/shapes` | offset/limit；只读取当前页整体几何块，limit 最大 8 |
| `GET /api/catalog/:catalog/builds/:id/models` | offset/limit；按调色板首次引用顺序读取去重模型及所需纹理，limit 最大8 |
| `GET /api/catalog/:catalog/items/:id/aspects` | 物品的要素数量、轻量资料引用及图标 |
| `GET /api/catalog/:catalog/aspects/:id` | 要素组成、颜色与快照发现状态 |
| `GET /api/catalog/:catalog/research/:id` | 研究前置、关联解锁、要素、发现线索与快照状态 |
| `GET /api/catalog/:catalog/records/:kind/:id` | 共享 schema 声明的单条记录 |
| `GET /assets/:catalog/*asset` | 清单声明的 MessagePack 或 WebP 文件 |

资源 URL 和查询都固定同一 catalog ID。发布新快照不影响已打开页面，用户明确切换后才使用新快照。JSON 查询结果上限 16 MiB；纹理和表文件按清单校验大小及 SHA-256。错误使用 `{error:{code,message}}`，缺失或损坏数据不返回伪造的空结果。

## 构建和发布

Node.js 24；三个 npm workspace 统一使用根目录 `npm ci` 和根锁文件。根脚本为 `check`、`build`、`test`、`e2e`、`release`。`scripts/release.mjs` 只复制现存后端和共享查询源码对应的编译模块、前端 dist、共同锁定的契约及运行文档，并生成 `files.json`。目标目录必须不存在。

此前受审批限制的旧二进制残留已完成物理清理。历史运行数据按用户要求保留到新的真实游戏导出验证完成。Vite 使用 `publicDir: false`，发布和 Docker 允许清单排除历史数据。原有 `reach-audit.mjs` 和 `reach-graph.json` 按要求保留。

## 离线读取

`/offline` 主动保存固定 catalog ID 声明的全部文件。下载与校验最多并发三个文件；IndexedDB 单文件事务提交，只有完整大小、摘要与表结构验证成功后才提交 ready。暂停保留 partial，继续时复用校验合格文件；跨标签页写入由 Web Locks 串行，删除通过 BroadcastChannel 通知现有会话。最多保存四份副本，空间不足会保留已经提交的部分。

Worker 直接复用 `catalog/src` 的校验、查询和响应，不复制查询业务、不读取游戏原始导出。显式离线链接固定 `catalog` 和 `offline=1`；网络错误只能切换到相同 catalog ID 的完整副本。HTTP 或数据错误仍明确报错。单次响应上限 16 MiB，分片缓存估算 64 MiB，单个完整查询索引估算上限 256 MiB；全量导出的大小和性能仍待实测。

构建插件为 HTML、全部页面、Worker、字体等输出生成带 SHA-256 的完整缓存清单。Service Worker 验证后缓存页面，支持断网导航与冷启动，资料文件始终经 IndexedDB 和共享校验器读取。准备保存时会修复不完整的页面缓存。更新保留仍有旧页面使用的应用缓存，最多四版；不会缓存 API JSON 响应替代完整资料。

## 验证

保留 4 组 API、3 组前端逻辑、4 组 Chromium 行为检查，共用由 Java 写入、Rust 编译的 fixture。覆盖实际查询/分页、数量与引用、损坏后重试、索引筛选、图集像素、动画/资源释放、取消/过期搜索、书签和重载。在线和完全断网时运行相同领域浏览流程；离线生命周期还覆盖暂停续传、损坏拒绝及修复、关闭并重启浏览器、跨标签移除与本地文件清理。已删除旧格式兼容、源码拼字和重复 gate 测试。

新索引及 Express 5 切换后的构建和浏览器检查已通过，前后端 npm audit 无已知漏洞。夹具不是全量性能基线。

材料与电路已加入共享样本及浏览器验收：成分比例、部件形态、系列、电压、搜索、分页和物品关联。资料列表读取 `topics`，不会解码未选中的完整材料。页面使用 `/entry/:id`、`/recipe/:id`、`/materials`、`/material/:id`、`/circuits`、`/circuit/:id`，没有旧 URL 别名。

蜜蜂和树木页面使用 `/bees`、`/bee/:id`、`/trees`、`/tree/:id`。与材料/电路共用 `TopicBrowser` 和 `useCatalog`，统一搜索、分页、取消和快照释放。列表只读轻量索引；杂交查询使用 `lineage`，不会解码其他页的突变或完整物种。产物按 48 条展示，杂交按 6 条查询。

默认基因和突变结果基因分别展示；自然夜行与跨昼夜活动基因分开。蜜蜂显示基础概率，树木的未知概率明确显示未提供，并提示默认果实家族不匹配。隐藏物种、黑名单和重复突变登记保留来源含义；不据此推导不可获得或当前可执行。

`/structures` 和 `/structure/:id` 共用 TopicBrowser 与快照会话。几何按块读取并验证数量；一个 WebGL2 instanced draw 显示选中的格位，无每格 DOM 或常驻动画循环。支持切层、规则隔离、拾取和资源销毁。颜色表示规则，片段没有推测的装配关系；建议部件不替代成型判定或完整材料清单。

结构页默认显示原生整体构建预览，可切换片段定义。Build.palette为block/model/problem，不同位置的相同方块可以有不同外观；方块统计与隔离按Block分组，避免重复计数。Scene共用相机、过滤和拾取，Diagram绘制规则/方块示意及控制器线框，Mesh绘制模型。原生模型用金色线框标记控制器，外观省略与缺失原因明确展示。构建选择用数量及通道值标识，`variant` URL 参数是规范化列表的从零开始下标，配合 catalog ID 保持重载、导航和离线读取一致；不存在的下标明确报错。加载构建时核对结构归属及参数，失败变体保留原因。片段提示单独说明使用首组参数。

模型和纹理分页同样经过共享catalog查询及离线Worker。客户端只裁取所需sprite帧，及时释放大图集的引用；裁取纹理预算128MiB，模型面数预算262144。静态模型不启动常驻动画，动画复用frameAt时间线，隐藏页面停止刷新。实体外形与方向来自顶点，透明面在不同模型、位置和材质之间按视深排序，普通表面按模型和材质实例化；切层后透明面最多100000。纹理用最近邻采样和透明度测试，拾取遵循可见像素。模型、裁取图像和GPU资源随页面、模式和变体变化释放。

浏览器入口由scripts/browser.mjs直接管理本地应用服务，使用系统分配的loopback端口和无shell的Playwright进程，退出时关闭连接与服务。既可测试工作区，也可通过NEONEI_TEST_BUNDLE测试实际发布包，不复用其他正在运行的服务。仍保留原4组浏览器行为入口。

材料、电路、遗传和结构片段的实际采集仍待游戏验证；多方块完整装配、魔法语义与动态 UI 仍需迁移。只有相应记录、编译校验、Web 展示和真实采集同时成立，才能标记采集领域完成。不得用通用截图或空集合替代这些领域。

Model.hidden仅允许空几何，表示该位置由原生渲染规则省略，常见于双箱的第二个方块。客户端核对hidden与faces一致，不为其上传假模型；原生视图说明省略位置的数量，Block统计与方块示意仍包含全部物理格位。这不属于采集失败，也不会产生缺失纹理提示。

要素与研究关系已接入 `/aspects`、`/aspect/:id`、`/research`、`/research/:id`。TopicLink 与 TopicBrowser 共用图集和快照，AspectBar 显示选定物品的精确要素数量。研究界面区分未知与未完成，显示真实前置和 `@` 知识标记；不推断当前可解锁，也不将元数据页面称为完整魔法配方／魔导手册实现。

研究线索按Clue原始条件和matches物品示例分开读取。空示例保留原始registry/meta/NBT/矿辞信息，页面显示未收录示例，不创建不存在的ItemLink。示例分页展示，在线与完整离线使用同一查询。修订11替换原字符串数组，旧副本保留到用户最终清理。
# Scanner analysis and whole-stack recipes

Contract0.13.0/catalog revision13 distinguishes a native Forestry member predicate, whole-stack consumption, and the analyze output operation. Scanner input choices are concrete genotype examples. Selecting another example selects its corresponding analyzed output online and in a complete offline library. The display labels the quantity as an example and the operation as processing the whole offered stack.

Unanalyzed and already analyzed members use separate recipes and separate costs. Both need at least100mB honey; only the former consumes it. The interface explains native NBT serialization on first analysis and unchanged return for previously analyzed inputs. Historical revision12 catalogs are retained but require a fresh export/compile/offline save for use with this release.
