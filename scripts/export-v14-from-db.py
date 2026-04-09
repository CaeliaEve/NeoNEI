"""
V14 Recipe Exporter - 从HSQLDB数据库导出配方到V14 JSON格式

这个脚本独立于Minecraft运行，直接读取nesql-db数据库并导出V14格式的JSON文件。

使用方法:
1. 确保Python环境已安装: pip install hsql5d jupyter
2. 运行: python export-v14-from-db.py
"""

import os
import json
import gzip
from pathlib import Path
import jpype
import jpype.imports
from datetime import datetime

# ==================== 配置 ====================
MINECRAFT_DIR = r"C:\Users\CaeliaEve\AppData\Roaming\PrismLauncher\instances\GT_New_Horizons_2.8.4_Java_8\.minecraft"
DB_PATH = os.path.join(MINECRAFT_DIR, "nesql", "nesql-repository", "nesql-db")
EXPORT_DIR = os.path.join(MINECRAFT_DIR, "nesql", "nesql-repository", "v14-export")

# ==================== 初始化HSQLDB ====================
print("初始化HSQLDB...")
jpype.addClassPath(r"E:\MC-test\nesql-exporter-main\build\libs\*")

# 导入HSQLDB类
from java.sql import DriverManager, Connection

# 注册HSQLDB驱动
driver_class = "org.hsqldb.jdbcDriver"
jpype.imports.registerDriver(driver_class)

# ==================== 数据库函数 ====================

def get_recipes_by_type(connection, recipe_type="crafting"):
    """从数据库获取指定类型的配方"""
    query = """
    SELECT DISTINCT r
    FROM Recipe r
    LEFT JOIN FETCH r.recipeType rt
    LEFT JOIN FETCH r.itemOutputs io
    LEFT JOIN FETCH r.itemInputs ii
    LEFT JOIN FETCH r.fluidInputs fi
    LEFT JOIN r.fluidOutputs fo
    WHERE rt.type = ?
    """

    # 注意: JPQL不支持LEFT JOIN FETCH在WHERE子句中，需要使用内连接
    # 简化版本：先获取Recipe，然后手动加载关联数据

    query_simple = """
    SELECT r.id
    FROM Recipe r
    JOIN RecipeType rt ON r.recipeType_id = rt.id
    WHERE rt.type = ?
    """

    recipe_ids = []
    with connection.createStatement() as stmt:
        rs = stmt.executeQuery(query_simple)
        while rs.next():
            recipe_ids.append(rs.getString("id"))

    # 分批加载（避免内存溢出）
    batch_size = 1000
    all_recipes = []

    for i in range(0, len(recipe_ids), batch_size):
        batch = recipe_ids[i:i+batch_size]
        placeholders = ",".join(["?"] * len(batch))

        batch_query = f"""
        SELECT r FROM Recipe r
        WHERE r.id IN ({placeholders})
        """

        with connection.createStatement() as stmt:
            stmt.setString(1, recipe_type)
            rs = stmt.executeQuery(batch_query)
            all_recipes.extend(rs)

    return all_recipes

def main():
    print(f"=== V14 Recipe Exporter ===")
    print(f"数据库: {DB_PATH}")
    print(f"导出目录: {EXPORT_DIR}")
    print()

    # 连接数据库
    url = f"jdbc:hsqldb:file:{DB_PATH};shutdown=true"

    try:
        with DriverManager.getConnection(url, "sa", "") as conn:
            print("✓ 数据库连接成功")

            # 创建导出目录
            os.makedirs(EXPORT_DIR, exist_ok=True)

            # TODO: 实现配方导出逻辑
            # 这里需要：
            # 1. 查询所有配方
            # 2. 按mod分组
            # 3. 转换为DTO
            # 4. 写入JSON文件

            print("⚠️ 脚本尚未完成，需要实现配方导出逻辑")
            print("建议: 使用数据库导出的数据，后端可以直接读取HSQLDB数据库")

    except Exception as e:
        print(f"❌ 导出失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
