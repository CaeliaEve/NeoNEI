"""
V14 Recipe Exporter - 从HSQLDB数据库导出配方到V14 JSON格式

这个脚本独立于Minecraft运行，直接读取nesql-db数据库并导出V14格式的JSON文件。

依赖安装:
pip install hsqldb jaydebeapi

使用方法:
1. 确保游戏已运行过/nesql-data命令
2. 运行: python export-v14-from-hsqldb.py
"""

import os
import sys
import json
import gzip
import hashlib
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict
import jpype

# ==================== 配置 ====================
# 自动检测Minecraft路径
MINECRAFT_DIR = r"C:\Users\CaeliaEve\AppData\Roaming\PrismLauncher\instances\GT_New_Horizons_2.8.4_Java_8\.minecraft"
DB_PATH = os.path.join(MINECRAFT_DIR, "nesql", "nesql-repository", "nesql-db")
EXPORT_DIR = os.path.join(MINECRAFT_DIR, "nesql", "nesql-repository", "v14-export")

# ==================== 数据类定义 ====================

@dataclass
class FluidDTO:
    fluidId: str
    modId: str
    internalName: str
    localizedName: str
    temperature: int

@dataclass
class FluidStackDTO:
    fluid: FluidDTO
    amount: int  # 毫升
    probability: float

@dataclass
class FluidGroupDTO:
    slotIndex: int
    fluids: List[FluidStackDTO]

@dataclass
class ItemStackDTO:
    itemId: str
    modId: str
    internalName: str
    localizedName: str
    damage: int
    maxDamage: int
    maxSize: int
    nbt: str
    imageFileName: str

@dataclass
class GregTechMetadataDTO:
    voltageTier: Optional[str]
    voltage: Optional[int]
    amperage: Optional[int]
    duration: Optional[int]
    totalEU: Optional[int]
    requiresCleanroom: Optional[bool]
    requiresLowGravity: Optional[bool]
    additionalInfo: Optional[str]
    specialItems: Optional[List[ItemStackDTO]]

@dataclass
class RecipeMetadataDTO:
    gregTech: Optional[GregTechMetadataDTO] = None

@dataclass
class MachineInfoDTO:
    voltageTier: Optional[str] = None
    voltage: Optional[int] = None

@dataclass
class RecipeDTO:
    id: str
    recipeType: str
    inputs: List[List[ItemStackDTO]]  # 二维数组表示配方槽
    outputs: List[ItemStackDTO]
    fluidInputs: List[FluidGroupDTO]
    fluidOutputs: List[FluidStackDTO]
    machineInfo: Optional[MachineInfoDTO] = None
    metadata: Optional[RecipeMetadataDTO] = None

# ==================== 数据库连接 ====================

class DatabaseConnection:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn = None

    def connect(self):
        """连接到HSQLDB数据库"""
        print(f"连接数据库: {self.db_path}")

        # 添加HSQLDB驱动
        jpype.addClassPath(r"E:\MC-test\nesql-exporter-main\build\libs\*")
        from java.sql import DriverManager

        # 加载驱动
        try:
            driver_class = "org.hsqldb.jdbcDriver"
            jpype.imports.registerDriver(driver_class)
        except:
            pass  # 已经注册过

        # 连接数据库
        url = f"jdbc:hsqldb:file:{self.db_path};shutdown=true"
        self.conn = DriverManager.getConnection(url, "sa", "")

        print("✓ 数据库连接成功")
        return self.conn

    def close(self):
        """关闭数据库连接"""
        if self.conn:
            self.conn.close()

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

# ==================== 配方导出器 ====================

class V14RecipeExporter:
    def __init__(self, connection, export_dir: str):
        self.conn = connection
        self.export_dir = Path(export_dir)

    def export_all_recipes(self):
        """导出所有配方"""
        print(f"\n=== 开始导出配方到V14格式 ===")
        print(f"导出目录: {self.export_dir}")
        print()

        # 创建导出目录
        self.export_dir.mkdir(parents=True, exist_ok=True)

        # 导出crafting配方
        self.export_recipes_by_type("crafting", "合成配方")

        print("\n=== 配方导出完成！===")
        print(f"导出目录: {self.export_dir}")

    def export_recipes_by_type(self, recipe_type: str, type_name: str):
        """按类型导出配方"""
        print(f"\n--- 导出{type_name}配方 ---")

        try:
            # 获取所有配方ID
            recipe_ids = self.get_recipe_ids(recipe_type)
            print(f"找到 {len(recipe_ids)} 个{type_name}配方")

            if not recipe_ids:
                print("没有配方，跳过")
                return

            # 分批加载配方（避免内存溢出）
            batch_size = 5000
            all_recipes = []

            for i in range(0, len(recipe_ids), batch_size):
                batch = recipe_ids[i:i+batch_size]
                print(f"加载配方 {i+1}-{min(i+batch_size, len(recipe_ids))}...")
                batch_recipes = self.load_recipes_batch(batch)
                all_recipes.extend(batch_recipes)

            # 按mod分组
            recipes_by_mod = self.group_recipes_by_mod(all_recipes)
            print(f"发现 {len(recipes_by_mod)} 个mod")

            # 导出每个mod的配方
            self.export_mods(recipes_by_mod, recipe_type)

        except Exception as e:
            print(f"❌ 导出{type_name}配方失败: {e}")
            import traceback
            traceback.print_exc()

    def get_recipe_ids(self, recipe_type: str) -> List[str]:
        """获取指定类型的所有配方ID"""
        query = """
        SELECT r.id
        FROM Recipe r
        JOIN RecipeType rt ON r.recipeType_id = rt.id
        WHERE rt.type = ?
        ORDER BY r.id
        """

        recipe_ids = []
        with self.conn.createStatement() as stmt:
            stmt.setString(1, recipe_type)
            rs = stmt.executeQuery(query)
            while rs.next():
                recipe_ids.append(rs.getString("id"))
            rs.close()

        return recipe_ids

    def load_recipes_batch(self, recipe_ids: List[str]) -> List[RecipeDTO]:
        """批量加载配方数据"""
        if not recipe_ids:
            return []

        placeholders = ",".join(["?"] * len(recipe_ids))
        query = f"""
        SELECT r.id, r.recipeType_id, rt.type, rt.category,
               rt.itemInputDimensionWidth, rt.itemInputDimensionHeight,
               rt.itemOutputDimensionWidth, rt.itemOutputDimensionHeight
        FROM Recipe r
        JOIN RecipeType rt ON r.recipeType_id = rt.id
        WHERE r.id IN ({placeholders})
        """

        recipes = []
        with self.conn.createStatement() as stmt:
            # 设置参数
            for i, recipe_id in enumerate(recipe_ids):
                stmt.setString(i + 1, recipe_id)

            rs = stmt.executeQuery(query)

            while rs.next():
                recipe_id = rs.getString("id")
                recipe_type_id = rs.getString("recipeType_id")
                recipe_type = rs.getString("type")
                category = rs.getString("category")

                # 加载完整的配方数据
                recipe = self.load_full_recipe(recipe_id, recipe_type, category)
                if recipe:
                    recipes.append(recipe)

            rs.close()

        return recipes

    def load_full_recipe(self, recipe_id: str, recipe_type: str, category: str) -> Optional[RecipeDTO]:
        """加载单个配方的完整数据"""
        try:
            # 加载输入输出物品
            inputs = self.load_item_inputs(recipe_id)
            outputs = self.load_item_outputs(recipe_id)
            fluid_inputs = self.load_fluid_inputs(recipe_id)
            fluid_outputs = self.load_fluid_outputs(recipe_id)

            # 加载GregTech元数据
            gregtech_metadata = self.load_gregtech_metadata(recipe_id)

            # 创建DTO
            dto = RecipeDTO(
                id=recipe_id,
                recipeType=recipe_type,
                inputs=inputs,
                outputs=outputs,
                fluidInputs=fluid_inputs,
                fluidOutputs=fluid_outputs,
                metadata=RecipeMetadataDTO(gregTech=gregtech_metadata) if gregtech_metadata else None
            )

            return dto

        except Exception as e:
            print(f"警告: 加载配方{recipe_id}失败: {e}")
            return None

    def load_item_inputs(self, recipe_id: str) -> List[List[ItemStackDTO]]:
        """加载配方输入物品"""
        query = """
        SELECT ii.itemInputs_key, ii.itemInputs_items_id
        FROM recipe_item_inputs ii
        WHERE ii.recipe_id = ?
        ORDER BY ii.itemInputs_key
        """

        # 按槽分组
        slot_map = {}
        with self.conn.createStatement() as stmt:
            stmt.setString(1, recipe_id)
            rs = stmt.executeQuery(query)
            while rs.next():
                slot_key = rs.getInt("itemInputs_key")
                item_id = rs.getString("itemInputs_items_id")
                slot_map.setdefault(slot_key, []).append(item_id)
            rs.close()

        # 加载物品详情并组织成二维数组
        input_slots = []
        max_slot = max(slot_map.keys()) if slot_map else 0

        for slot in range(max_slot + 1):
            if slot in slot_map:
                items = []
                for item_id in slot_map[slot]:
                    item = self.load_item(item_id)
                    if item:
                        items.append(item)
                if items:
                    input_slots.append(items)
            else:
                input_slots.append([])

        return input_slots

    def load_item_outputs(self, recipe_id: str) -> List[ItemStackDTO]:
        """加载配方输出物品"""
        query = """
        SELECT io.itemOutputs_value_item_id, io.itemOutputs_value_stack_size,
               io.itemOutputs_value_probability
        FROM recipe_item_outputs io
        WHERE io.recipe_id = ?
        ORDER BY io.itemOutputs_key
        """

        outputs = []
        with self.conn.createStatement() as stmt:
            stmt.setString(1, recipe_id)
            rs = stmt.executeQuery(query)
            while rs.next():
                item = self.load_item(rs.getString("itemOutputs_value_item_id"))
                if item:
                    # 设置stack size
                    item.stackSize = rs.getInt("itemOutputs_value_stack_size")
                    # 设置概率
                    prob = rs.getDouble("itemOutputs_value_probability")
                    if prob != 1.0:
                        item.probability = prob
                    outputs.append(item)
            rs.close()

        return outputs

    def load_fluid_inputs(self, recipe_id: str) -> List[FluidGroupDTO]:
        """加载流体输入"""
        query = """
        SELECT fi.recipeFluidInputs_key, fi.recipeFluidInputs_fluidInputs_id
        FROM recipe_fluid_group fi
        WHERE fi.recipe_id = ?
        ORDER BY fi.recipeFluidInputs_key
        """

        fluid_groups = []
        with self.conn.createStatement() as stmt:
            stmt.setString(1, recipe_id)
            rs = stmt.executeQuery(query)
            while rs.next():
                group_key = rs.getInt("recipeFluidInputs_key")
                group_id = rs.getString("recipeFluidInputs_fluidInputs_id")
                fluid_stacks = self.load_fluid_stacks(group_id)

                if fluid_stacks:
                    fluid_groups.append(FluidGroupDTO(
                        slotIndex=group_key,
                        fluids=fluid_stacks
                    ))
            rs.close()

        return fluid_groups

    def load_fluid_outputs(self, recipe_id: str) -> List[FluidStackDTO]:
        """加载流体输出"""
        query = """
        SELECT fo.recipeFluidOutputs_value_fluid_id,
               fo.recipeFluidOutputs_value_amount,
               fo.recipeFluidOutputs_value_probability
        FROM recipe_fluid_outputs fo
        WHERE fo.recipe_id = ?
        ORDER BY fo.recipeFluidOutputs_key
        """

        outputs = []
        with self.conn.createStatement() as stmt:
            stmt.setString(1, recipe_id)
            rs = stmt.executeQuery(query)
            while rs.next():
                fluid = self.load_fluid(rs.getString("recipeFluidOutputs_value_fluid_id"))
                if fluid:
                    outputs.append(FluidStackDTO(
                        fluid=fluid,
                        amount=rs.getInt("recipeFluidOutputs_value_amount"),
                        probability=rs.getDouble("recipeFluidOutputs_value_probability")
                    ))
            rs.close()

        return outputs

    def load_fluid_stacks(self, group_id: str) -> List[FluidStackDTO]:
        """加载流体组的所有流体栈"""
        query = """
        SELECT fluidStacks_fluid_id, fluidStacks_amount
        FROM fluid_group_fluid_stacks
        WHERE fluid_group_id = ?
        ORDER BY fluidStacks_key
        """

        stacks = []
        with self.conn.createStatement() as stmt:
            stmt.setString(1, group_id)
            rs = stmt.executeQuery(query)
            while rs.next():
                fluid = self.load_fluid(rs.getString("fluidStacks_fluid_id"))
                if fluid:
                    stacks.append(FluidStackDTO(
                        fluid=fluid,
                        amount=rs.getInt("fluidStacks_amount"),
                        probability=1.0
                    ))
            rs.close()

        return stacks

    def load_item(self, item_id: str) -> Optional[ItemStackDTO]:
        """加载物品详情"""
        query = """
        SELECT itemId, modId, internalName, localizedName, itemDamage,
               maxDamage, maxStackSize, nbt, imageFileName
        FROM Item
        WHERE itemId = ?
        """

        with self.conn.createStatement() as stmt:
            stmt.setString(1, item_id)
            rs = stmt.executeQuery(query)
            if rs.next():
                item = ItemStackDTO(
                    itemId=rs.getString("itemId"),
                    modId=rs.getString("modId"),
                    internalName=rs.getString("internalName"),
                    localizedName=rs.getString("localizedName"),
                    damage=rs.getInt("itemDamage"),
                    maxDamage=rs.getInt("maxDamage"),
                    maxSize=rs.getInt("maxStackSize"),
                    nbt=rs.getString("nbt") or "",
                    imageFileName=rs.getString("imageFileName")
                )
                rs.close()
                return item
            rs.close()

        return None

    def load_fluid(self, fluid_id: str) -> Optional[FluidDTO]:
        """加载流体详情"""
        query = """
        SELECT fluidId, modId, internalName, localizedName, temperature
        FROM Fluid
        WHERE fluidId = ?
        """

        with self.conn.createStatement() as stmt:
            stmt.setString(1, fluid_id)
            rs = stmt.executeQuery(query)
            if rs.next():
                fluid = FluidDTO(
                    fluidId=rs.getString("fluidId"),
                    modId=rs.getString("modId"),
                    internalName=rs.getString("internalName"),
                    localizedName=rs.getString("localizedName"),
                    temperature=rs.getInt("temperature")
                )
                rs.close()
                return fluid
            rs.close()

        return None

    def load_gregtech_metadata(self, recipe_id: str) -> Optional[GregTechMetadataDTO]:
        """加载GregTech元数据"""
        query = """
        SELECT voltageTier, voltage, amperage, duration,
               requiresCleanroom, requiresLowGravity, additionalInfo
        FROM GregTechRecipe
        WHERE recipe_id = ?
        """

        with self.conn.createStatement() as stmt:
            stmt.setString(1, recipe_id)
            rs = stmt.executeQuery(query)

            if rs.next():
                # 加载特殊物品
                special_items = self.load_special_items(recipe_id)

                metadata = GregTechMetadataDTO(
                    voltageTier=rs.getString("voltageTier"),
                    voltage=rs.getInt("voltage") if rs.getObject("voltage") else None,
                    amperage=rs.getInt("amperage") if rs.getObject("amperage") else None,
                    duration=rs.getInt("duration") if rs.getObject("duration") else None,
                    totalEU=None,  # 可以计算：voltage * amperage * duration / EUt
                    requiresCleanroom=rs.getBoolean("requiresCleanroom"),
                    requiresLowGravity=rs.getBoolean("requiresLowGravity"),
                    additionalInfo=rs.getString("additionalInfo"),
                    specialItems=special_items
                )
                rs.close()
                return metadata
            rs.close()

        return None

    def load_special_items(self, recipe_id: str) -> Optional[List[ItemStackDTO]]:
        """加载GregTech特殊物品（电路板等）"""
        query = """
        SELECT special_items_id
        FROM greg_tech_recipe_special_items
        WHERE greg_tech_recipe_id = ?
        """

        items = []
        with self.conn.createStatement() as stmt:
            stmt.setString(1, recipe_id)
            rs = stmt.executeQuery(query)
            while rs.next():
                item = self.load_item(rs.getString("special_items_id"))
                if item:
                    items.append(item)
            rs.close()

        return items if items else None

    def group_recipes_by_mod(self, recipes: List[RecipeDTO]) -> Dict[str, List[RecipeDTO]]:
        """按输出物品的mod分组"""
        print("按mod分组配方中...")

        mod_recipes = {}

        for recipe in recipes:
            if recipe.outputs:
                output_item = recipe.outputs[0]
                mod_id = output_item.modId
                mod_recipes.setdefault(mod_id, []).append(recipe)

        return mod_recipes

    def export_mods(self, recipes_by_mod: Dict[str, List[RecipeDTO]], recipe_type: str):
        """导出每个mod的配方"""
        # 创建输出目录
        recipes_dir = self.export_dir / "recipes" / recipe_type
        recipes_dir.mkdir(parents=True, exist_ok=True)

        # 配置JSON
        json_config = {
            'ensure_ascii': False,
            'indent': 2,
            'separators': ',,
            'default': str,
        }

        # 导出每个mod
        mod_count = 0
        total_mods = len(recipes_by_mod)

        for mod_id, recipes in recipes_by_mod.items():
            mod_count += 1
            print(f"[{mod_count}/{total_mods}] 导出mod: {mod_id} ({len(recipes)}个配方)")

            # 清理mod ID中的非法字符
            safe_mod_id = self.sanitize_mod_id(mod_id)

            # 创建mod目录
            mod_dir = recipes_dir / safe_mod_id
            mod_dir.mkdir(parents=True, exist_ok=True)

            # 写入JSON文件
            mod_file = mod_dir / "recipes.json"
            with open(mod_file, 'w', encoding='utf-8') as f:
                json.dump(recipes, f, **json_config)

            # 压缩JSON文件
            compressed_file = self.compress_file(mod_file)

            # 计算大小
            original_size = mod_file.stat().st_size
            compressed_size = compressed_file.stat().st_size
            ratio = (1.0 - compressed_size / original_size) * 100

            print(f"  ✓ 已导出: {mod_id}")
            print(f"    压缩: {original_size/1024/1024:.2f} MB → {compressed_size/1024/1024:.2f} MB (节省 {ratio:.1f}%)")

            # 删除未压缩文件
            mod_file.unlink()

            # 每10个mod报告一次进度
            if mod_count % 10 == 0:
                print(f"进度: {mod_count}/{total_mods} mod已完成")

        print(f"✓ {type_name}导出完成: {total_mods}个mod, {sum(len(r) for r in recipes_by_mod.values())}个配方")

    def sanitize_mod_id(self, mod_id: str) -> str:
        """清理mod ID中的非法字符（Windows文件系统限制）"""
        # 替换非法字符
        illegal_chars = ['<', '>', ':', '"', '|', '?', '*', '\\']
        safe_id = mod_id
        for char in illegal_chars:
            safe_id = safe_id.replace(char, '_')
        return safe_id

    def compress_file(self, file_path: Path) -> Path:
        """压缩文件"""
        compressed_path = file_path.with_suffix('.json.gz')

        with open(file_path, 'rb') as f_in:
            with gzip.open(compressed_path, 'wt', encoding='utf-8') as f_out:
                f_out.write(f_in.read().decode('utf-8'))

        # 删除原文件
        file_path.unlink()

        return compressed_path

# ==================== 主程序 ====================

def main():
    print("=" * 60)
    print("V14 Recipe Exporter - 从HSQLDB数据库导出配方")
    print("=" * 60)
    print()

    # 检查数据库是否存在
    if not os.path.exists(DB_PATH):
        print(f"❌ 错误: 数据库不存在: {DB_PATH}")
        print("\n请先运行游戏并执行 /nesql-data 命令来创建数据库")
        return

    print(f"数据库: {DB_PATH}")
    print(f"导出目录: {EXPORT_DIR}")
    print()

    # 创建导出器并导出
    with DatabaseConnection(DB_PATH) as conn:
        exporter = V14RecipeExporter(conn, EXPORT_DIR)
        exporter.export_all_recipes()

    print(f"\n✓ 导出完成！")
    print(f"\n文件结构:")
    print(f"  {EXPORT_DIR}/")
    print(f"    recipes/")
    print(f"      crafting/")
    print(f"        <modId>/")
    print(f"          recipes.json.gz")
    print(f"          ...")

if __name__ == "__main__":
    main()
