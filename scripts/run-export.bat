@echo off
chcp 65001 > nul
echo ======================================
echo V14 Recipe Exporter - 一键导出脚本
echo ======================================
echo.

cd /d "%~dp0"

echo [1/3] 检查Python...
python --version > nul 2>&1
if errorlevel 1 (
    echo ❌ 错误: 未找到Python
    echo 请先安装Python 3.8+: https://www.python.org/downloads/
    pause
    exit /b 1
)
python --version
echo.

echo [2/3] 检查依赖...
pip show jpype1 > nul 2>&1
if errorlevel 1 (
    echo 正在安装依赖...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo ❌ 依赖安装失败
        pause
        exit /b 1
    )
) else (
    echo ✓ 依赖已安装
)
echo.

echo [3/3] 开始导出V14配方...
echo.
python export-v14-from-hsqldb.py

echo.
echo ======================================
echo 导出完成！
echo ======================================
echo.
echo 文件位置:
echo C:\Users\CaeliaEve\AppData\Roaming\PrismLauncher\instances\GT_New_Horizons_2.8.4_Java_8\.minecraft\nesql\nesql-repository\v14-export\
echo.
pause
