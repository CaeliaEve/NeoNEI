/**
 * 机器图标映射服务
 * 将机器类型和电压等级映射到对应的物品ID和图片文件名
 */

// GregTech 机器图标映射
// key: "machineType:voltageTier" 或 "machineType"
// value: { itemId, imageFileName }
const GREGTECH_MACHINE_ICONS: Record<string, { itemId: string; imageFileName: string }> = {
  // 研究站系列
  '研究站 (ULV)': { itemId: 'i~gregtech~gt.blockmachines~30', imageFileName: 'gt.blockmachines~30.png' },
  '研究站 (LV)': { itemId: 'i~gregtech~gt.blockmachines~31', imageFileName: 'gt.blockmachines~31.png' },
  '研究站 (MV)': { itemId: 'i~gregtech~gt.blockmachines~32', imageFileName: 'gt.blockmachines~32.png' },
  '研究站 (HV)': { itemId: 'i~gregtech~gt.blockmachines~33', imageFileName: 'gt.blockmachines~33.png' },
  '研究站 (EV)': { itemId: 'i~gregtech~gt.blockmachines~34', imageFileName: 'gt.blockmachines~34.png' },
  '研究站 (IV)': { itemId: 'i~gregtech~gt.blockmachines~35', imageFileName: 'gt.blockmachines~35.png' },
  '研究站 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~36', imageFileName: 'gt.blockmachines~36.png' },
  '研究站 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~37', imageFileName: 'gt.blockmachines~37.png' },
  '研究站 (UV)': { itemId: 'i~gregtech~gt.blockmachines~38', imageFileName: 'gt.blockmachines~38.png' },
  '研究站 (UHV)': { itemId: 'i~gregtech~gt.blockmachines~39', imageFileName: 'gt.blockmachines~39.png' },
  '研究站 (UEV)': { itemId: 'i~gregtech~gt.blockmachines~40', imageFileName: 'gt.blockmachines~40.png' },
  '研究站 (UIV)': { itemId: 'i~gregtech~gt.blockmachines~41', imageFileName: 'gt.blockmachines~41.png' },
  '研究站 (UMV)': { itemId: 'i~gregtech~gt.blockmachines~42', imageFileName: 'gt.blockmachines~42.png' },
  '研究站 (UXV)': { itemId: 'i~gregtech~gt.blockmachines~43', imageFileName: 'gt.blockmachines~43.png' },
  '研究站 (MAX)': { itemId: 'i~gregtech~gt.blockmachines~44', imageFileName: 'gt.blockmachines~44.png' },

  // 组装机系列
  '组装机 (ULV)': { itemId: 'i~gregtech~gt.blockmachines~14', imageFileName: 'gt.blockmachines~14.png' },
  '组装机 (LV)': { itemId: 'i~gregtech~gt.blockmachines~15', imageFileName: 'gt.blockmachines~15.png' },
  '组装机 (MV)': { itemId: 'i~gregtech~gt.blockmachines~16', imageFileName: 'gt.blockmachines~16.png' },
  '组装机 (HV)': { itemId: 'i~gregtech~gt.blockmachines~17', imageFileName: 'gt.blockmachines~17.png' },
  '组装机 (EV)': { itemId: 'i~gregtech~gt.blockmachines~18', imageFileName: 'gt.blockmachines~18.png' },
  '组装机 (IV)': { itemId: 'i~gregtech~gt.blockmachines~19', imageFileName: 'gt.blockmachines~19.png' },
  '组装机 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~20', imageFileName: 'gt.blockmachines~20.png' },
  '组装机 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~21', imageFileName: 'gt.blockmachines~21.png' },
  '组装机 (UV)': { itemId: 'i~gregtech~gt.blockmachines~22', imageFileName: 'gt.blockmachines~22.png' },
  '组装机 (UHV)': { itemId: 'i~gregtech~gt.blockmachines~23', imageFileName: 'gt.blockmachines~23.png' },
  '组装机 (UEV)': { itemId: 'i~gregtech~gt.blockmachines~24', imageFileName: 'gt.blockmachines~24.png' },
  '组装机 (UIV)': { itemId: 'i~gregtech~gt.blockmachines~25', imageFileName: 'gt.blockmachines~25.png' },
  '组装机 (UMV)': { itemId: 'i~gregtech~gt.blockmachines~26', imageFileName: 'gt.blockmachines~26.png' },
  '组装机 (UXV)': { itemId: 'i~gregtech~gt.blockmachines~27', imageFileName: 'gt.blockmachines~27.png' },
  '组装机 (MAX)': { itemId: 'i~gregtech~gt.blockmachines~28', imageFileName: 'gt.blockmachines~28.png' },

  // 压缩机系列
  '压缩机 (ULV)': { itemId: 'i~gregtech~gt.blockmachines~114', imageFileName: 'gt.blockmachines~114.png' },
  '压缩机 (LV)': { itemId: 'i~gregtech~gt.blockmachines~115', imageFileName: 'gt.blockmachines~115.png' },
  '压缩机 (MV)': { itemId: 'i~gregtech~gt.blockmachines~116', imageFileName: 'gt.blockmachines~116.png' },
  '压缩机 (HV)': { itemId: 'i~gregtech~gt.blockmachines~117', imageFileName: 'gt.blockmachines~117.png' },
  '压缩机 (EV)': { itemId: 'i~gregtech~gt.blockmachines~118', imageFileName: 'gt.blockmachines~118.png' },
  '压缩机 (IV)': { itemId: 'i~gregtech~gt.blockmachines~119', imageFileName: 'gt.blockmachines~119.png' },
  '压缩机 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~120', imageFileName: 'gt.blockmachines~120.png' },
  '压缩机 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~121', imageFileName: 'gt.blockmachines~121.png' },
  '压缩机 (UV)': { itemId: 'i~gregtech~gt.blockmachines~122', imageFileName: 'gt.blockmachines~122.png' },
  '压缩机 (UHV)': { itemId: 'i~gregtech~gt.blockmachines~123', imageFileName: 'gt.blockmachines~123.png' },
  '压缩机 (UIV)': { itemId: 'i~gregtech~gt.blockmachines~124', imageFileName: 'gt.blockmachines~124.png' },
  '压缩机 (UMV)': { itemId: 'i~gregtech~gt.blockmachines~125', imageFileName: 'gt.blockmachines~125.png' },
  '压缩机 (UXV)': { itemId: 'i~gregtech~gt.blockmachines~126', imageFileName: 'gt.blockmachines~126.png' },

  // 电解机
  '电解机 (LV)': { itemId: 'i~gregtech~gt.blockmachines~245', imageFileName: 'gt.blockmachines~245.png' },
  '电解机 (MV)': { itemId: 'i~gregtech~gt.blockmachines~246', imageFileName: 'gt.blockmachines~246.png' },
  '电解机 (HV)': { itemId: 'i~gregtech~gt.blockmachines~247', imageFileName: 'gt.blockmachines~247.png' },
  '电解机 (EV)': { itemId: 'i~gregtech~gt.blockmachines~248', imageFileName: 'gt.blockmachines~248.png' },
  '电解机 (IV)': { itemId: 'i~gregtech~gt.blockmachines~249', imageFileName: 'gt.blockmachines~249.png' },
  '电解机 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~250', imageFileName: 'gt.blockmachines~250.png' },
  '电解机 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~251', imageFileName: 'gt.blockmachines~251.png' },
  '电解机 (UV)': { itemId: 'i~gregtech~gt.blockmachines~252', imageFileName: 'gt.blockmachines~252.png' },

  // 离心机
  '离心机 (LV)': { itemId: 'i~gregtech~gt.blockmachines~215', imageFileName: 'gt.blockmachines~215.png' },
  '离心机 (MV)': { itemId: 'i~gregtech~gt.blockmachines~216', imageFileName: 'gt.blockmachines~216.png' },
  '离心机 (HV)': { itemId: 'i~gregtech~gt.blockmachines~217', imageFileName: 'gt.blockmachines~217.png' },
  '离心机 (EV)': { itemId: 'i~gregtech~gt.blockmachines~218', imageFileName: 'gt.blockmachines~218.png' },
  '离心机 (IV)': { itemId: 'i~gregtech~gt.blockmachines~219', imageFileName: 'gt.blockmachines~219.png' },
  '离心机 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~220', imageFileName: 'gt.blockmachines~220.png' },
  '离心机 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~221', imageFileName: 'gt.blockmachines~221.png' },
  '离心机 (UV)': { itemId: 'i~gregtech~gt.blockmachines~222', imageFileName: 'gt.blockmachines~222.png' },
  '离心机 (UHV)': { itemId: 'i~gregtech~gt.blockmachines~223', imageFileName: 'gt.blockmachines~223.png' },
  '离心机 (ULV)': { itemId: 'i~gregtech~gt.blockmachines~214', imageFileName: 'gt.blockmachines~214.png' },

  // 其他常用机器
  '高炉': { itemId: 'i~gregtech~gt.blockmachines~85', imageFileName: 'gt.blockmachines~85.png' },
  '高炉 (EV)': { itemId: 'i~gregtech~gt.blockmachines~88', imageFileName: 'gt.blockmachines~88.png' },
  '高炉 (HV)': { itemId: 'i~gregtech~gt.blockmachines~87', imageFileName: 'gt.blockmachines~87.png' },
  '高炉 (IV)': { itemId: 'i~gregtech~gt.blockmachines~89', imageFileName: 'gt.blockmachines~89.png' },
  '高炉 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~90', imageFileName: 'gt.blockmachines~90.png' },
  '高炉 (MV)': { itemId: 'i~gregtech~gt.blockmachines~86', imageFileName: 'gt.blockmachines~86.png' },
  '高炉 (UEV)': { itemId: 'i~gregtech~gt.blockmachines~91', imageFileName: 'gt.blockmachines~91.png' },
  '高炉 (UHV)': { itemId: 'i~gregtech~gt.blockmachines~92', imageFileName: 'gt.blockmachines~92.png' },
  '高炉 (UIV)': { itemId: 'i~gregtech~gt.blockmachines~93', imageFileName: 'gt.blockmachines~93.png' },
  '高炉 (ULV)': { itemId: 'i~gregtech~gt.blockmachines~84', imageFileName: 'gt.blockmachines~84.png' },
  '高炉 (UMV)': { itemId: 'i~gregtech~gt.blockmachines~94', imageFileName: 'gt.blockmachines~94.png' },
  '高炉 (UV)': { itemId: 'i~gregtech~gt.blockmachines~95', imageFileName: 'gt.blockmachines~95.png' },
  '高炉 (UXV)': { itemId: 'i~gregtech~gt.blockmachines~96', imageFileName: 'gt.blockmachines~96.png' },
  '高炉 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~97', imageFileName: 'gt.blockmachines~97.png' },
  '高炉 (MAX)': { itemId: 'i~gregtech~gt.blockmachines~98', imageFileName: 'gt.blockmachines~98.png' },

  // ========== 装配线加工系列 ==========
  '装配线加工 (ULV)': { itemId: 'i~gregtech~gt.blockmachines~4', imageFileName: 'gt.blockmachines~4.png' },
  '装配线加工 (LV)': { itemId: 'i~gregtech~gt.blockmachines~5', imageFileName: 'gt.blockmachines~5.png' },
  '装配线加工 (MV)': { itemId: 'i~gregtech~gt.blockmachines~6', imageFileName: 'gt.blockmachines~6.png' },
  '装配线加工 (HV)': { itemId: 'i~gregtech~gt.blockmachines~7', imageFileName: 'gt.blockmachines~7.png' },
  '装配线加工 (EV)': { itemId: 'i~gregtech~gt.blockmachines~8', imageFileName: 'gt.blockmachines~8.png' },
  '装配线加工 (IV)': { itemId: 'i~gregtech~gt.blockmachines~9', imageFileName: 'gt.blockmachines~9.png' },
  '装配线加工 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~10', imageFileName: 'gt.blockmachines~10.png' },
  '装配线加工 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~11', imageFileName: 'gt.blockmachines~11.png' },
  '装配线加工 (UV)': { itemId: 'i~gregtech~gt.blockmachines~12', imageFileName: 'gt.blockmachines~12.png' },
  '装配线加工 (UHV)': { itemId: 'i~gregtech~gt.blockmachines~13', imageFileName: 'gt.blockmachines~13.png' },
  '装配线加工 (UEV)': { itemId: 'i~gregtech~gt.blockmachines~14', imageFileName: 'gt.blockmachines~14.png' },
  '装配线加工 (UIV)': { itemId: 'i~gregtech~gt.blockmachines~2059', imageFileName: 'gt.blockmachines~2059.png' },
  '装配线加工 (UMV)': { itemId: 'i~gregtech~gt.blockmachines~2060', imageFileName: 'gt.blockmachines~2060.png' },
  '装配线加工 (UXV)': { itemId: 'i~gregtech~gt.blockmachines~2061', imageFileName: 'gt.blockmachines~2061.png' },
  '装配线加工 (MAX)': { itemId: 'i~gregtech~gt.blockmachines~2062', imageFileName: 'gt.blockmachines~2062.png' },

  // ========== 其他常用机器 ==========
  '电弧炉': { itemId: 'i~gregtech~gt.blockmachines~131', imageFileName: 'gt.blockmachines~131.png' },
  '电弧炉 (LV)': { itemId: 'i~gregtech~gt.blockmachines~132', imageFileName: 'gt.blockmachines~132.png' },
  '电弧炉 (MV)': { itemId: 'i~gregtech~gt.blockmachines~133', imageFileName: 'gt.blockmachines~133.png' },
  '电弧炉 (HV)': { itemId: 'i~gregtech~gt.blockmachines~134', imageFileName: 'gt.blockmachines~134.png' },
  '电弧炉 (UEV)': { itemId: 'i~gregtech~gt.blockmachines~135', imageFileName: 'gt.blockmachines~135.png' },
  '电弧炉 (UHV)': { itemId: 'i~gregtech~gt.blockmachines~136', imageFileName: 'gt.blockmachines~136.png' },

  '分子重组仪': { itemId: 'i~gregtech~gt.blockmachines~7', imageFileName: 'gt.blockmachines~7.png' },
  '分子重组仪 (EV)': { itemId: 'i~gregtech~gt.blockmachines~7', imageFileName: 'gt.blockmachines~7.png' },
  '分子重组仪 (IV)': { itemId: 'i~gregtech~gt.blockmachines~207', imageFileName: 'gt.blockmachines~207.png' },
  '分子重组仪 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~207', imageFileName: 'gt.blockmachines~207.png' },
  '分子重组仪 (UHV)': { itemId: 'i~gregtech~gt.blockmachines~208', imageFileName: 'gt.blockmachines~208.png' },
  '分子重组仪 (UV)': { itemId: 'i~gregtech~gt.blockmachines~209', imageFileName: 'gt.blockmachines~209.png' },
  '分子重组仪 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~210', imageFileName: 'gt.blockmachines~210.png' },

  '等离子电弧炉': { itemId: 'i~gregtech~gt.blockmachines~137', imageFileName: 'gt.blockmachines~137.png' },
  '等离子电弧炉 (HV)': { itemId: 'i~gregtech~gt.blockmachines~138', imageFileName: 'gt.blockmachines~138.png' },
  '等离子电弧炉 (IV)': { itemId: 'i~gregtech~gt.blockmachines~139', imageFileName: 'gt.blockmachines~139.png' },
  '等离子电弧炉 (LV)': { itemId: 'i~gregtech~gt.blockmachines~140', imageFileName: 'gt.blockmachines~140.png' },
  '等离子电弧炉 (MV)': { itemId: 'i~gregtech~gt.blockmachines~141', imageFileName: 'gt.blockmachines~141.png' },

  '锻造锤': { itemId: 'i~gregtech~gt.blockmachines~105', imageFileName: 'gt.blockmachines~105.png' },
  '锻造锤 (EV)': { itemId: 'i~gregtech~gt.blockmachines~375', imageFileName: 'gt.blockmachines~375.png' },
  '锻造锤 (HV)': { itemId: 'i~gregtech~gt.blockmachines~376', imageFileName: 'gt.blockmachines~376.png' },
  '锻造锤 (IV)': { itemId: 'i~gregtech~gt.blockmachines~377', imageFileName: 'gt.blockmachines~377.png' },
  '锻造锤 (LV)': { itemId: 'i~gregtech~gt.blockmachines~378', imageFileName: 'gt.blockmachines~378.png' },
  '锻造锤 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~379', imageFileName: 'gt.blockmachines~379.png' },
  '锻造锤 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~380', imageFileName: 'gt.blockmachines~380.png' },
  '锻造锤 (UEV)': { itemId: 'i~gregtech~gt.blockmachines~381', imageFileName: 'gt.blockmachines~381.png' },
  '锻造锤 (UHV)': { itemId: 'i~gregtech~gt.blockmachines~382', imageFileName: 'gt.blockmachines~382.png' },
  '锻造锤 (UIV)': { itemId: 'i~gregtech~gt.blockmachines~383', imageFileName: 'gt.blockmachines~383.png' },
  '锻造锤 (ULV)': { itemId: 'i~gregtech~gt.blockmachines~374', imageFileName: 'gt.blockmachines~374.png' },
  '锻造锤 (UMV)': { itemId: 'i~gregtech~gt.blockmachines~384', imageFileName: 'gt.blockmachines~384.png' },
  '锻造锤 (UXV)': { itemId: 'i~gregtech~gt.blockmachines~385', imageFileName: 'gt.blockmachines~385.png' },
  '锻造锤 (MAX)': { itemId: 'i~gregtech~gt.blockmachines~386', imageFileName: 'gt.blockmachines~386.png' },

  '板材切割机 (LV)': { itemId: 'i~gregtech~gt.blockmachines~285', imageFileName: 'gt.blockmachines~285.png' },
  '板材切割机 (MV)': { itemId: 'i~gregtech~gt.blockmachines~286', imageFileName: 'gt.blockmachines~286.png' },
  '板材切割机 (EV)': { itemId: 'i~gregtech~gt.blockmachines~288', imageFileName: 'gt.blockmachines~288.png' },
  '板材切割机 (HV)': { itemId: 'i~gregtech~gt.blockmachines~287', imageFileName: 'gt.blockmachines~287.png' },
  '板材切割机 (IV)': { itemId: 'i~gregtech~gt.blockmachines~289', imageFileName: 'gt.blockmachines~289.png' },
  '板材切割机 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~290', imageFileName: 'gt.blockmachines~290.png' },
  '板材切割机 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~291', imageFileName: 'gt.blockmachines~291.png' },
  '板材切割机 (UV)': { itemId: 'i~gregtech~gt.blockmachines~292', imageFileName: 'gt.blockmachines~292.png' },
  '板材切割机 (UHV)': { itemId: 'i~gregtech~gt.blockmachines~293', imageFileName: 'gt.blockmachines~293.png' },
  '板材切割机 (UEV)': { itemId: 'i~gregtech~gt.blockmachines~295', imageFileName: 'gt.blockmachines~295.png' },
  '板材切割机 (ULV)': { itemId: 'i~gregtech~gt.blockmachines~284', imageFileName: 'gt.blockmachines~284.png' },
  '板材切割机 (MAX)': { itemId: 'i~gregtech~gt.blockmachines~291', imageFileName: 'gt.blockmachines~291.png' },

  '车床 (EV)': { itemId: 'i~gregtech~gt.blockmachines~311', imageFileName: 'gt.blockmachines~311.png' },
  '车床 (HV)': { itemId: 'i~gregtech~gt.blockmachines~312', imageFileName: 'gt.blockmachines~312.png' },
  '车床 (IV)': { itemId: 'i~gregtech~gt.blockmachines~313', imageFileName: 'gt.blockmachines~313.png' },
  '车床 (LV)': { itemId: 'i~gregtech~gt.blockmachines~314', imageFileName: 'gt.blockmachines~314.png' },
  '车床 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~315', imageFileName: 'gt.blockmachines~315.png' },
  '车床 (MV)': { itemId: 'i~gregtech~gt.blockmachines~316', imageFileName: 'gt.blockmachines~316.png' },
  '车床 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~317', imageFileName: 'gt.blockmachines~317.png' },
  '车床 (UV)': { itemId: 'i~gregtech~gt.blockmachines~318', imageFileName: 'gt.blockmachines~318.png' },
  '车床 (UEV)': { itemId: 'i~gregtech~gt.blockmachines~319', imageFileName: 'gt.blockmachines~319.png' },
  '车床 (UHV)': { itemId: 'i~gregtech~gt.blockmachines~320', imageFileName: 'gt.blockmachines~320.png' },
  '车床 (UIV)': { itemId: 'i~gregtech~gt.blockmachines~321', imageFileName: 'gt.blockmachines~321.png' },
  '车床 (ULV)': { itemId: 'i~gregtech~gt.blockmachines~310', imageFileName: 'gt.blockmachines~310.png' },
  '车床 (UMV)': { itemId: 'i~gregtech~gt.blockmachines~322', imageFileName: 'gt.blockmachines~322.png' },
  '车床 (UXV)': { itemId: 'i~gregtech~gt.blockmachines~323', imageFileName: 'gt.blockmachines~323.png' },

  '卷板机 (LV)': { itemId: 'i~gregtech~gt.blockmachines~149', imageFileName: 'gt.blockmachines~149.png' },
  '卷板机 (MV)': { itemId: 'i~gregtech~gt.blockmachines~150', imageFileName: 'gt.blockmachines~150.png' },
  '卷板机 (HV)': { itemId: 'i~gregtech~gt.blockmachines~151', imageFileName: 'gt.blockmachines~151.png' },
  '卷板机 (EV)': { itemId: 'i~gregtech~gt.blockmachines~152', imageFileName: 'gt.blockmachines~152.png' },
  '卷板机 (IV)': { itemId: 'i~gregtech~gt.blockmachines~153', imageFileName: 'gt.blockmachines~153.png' },
  '卷板机 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~154', imageFileName: 'gt.blockmachines~154.png' },
  '卷板机 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~155', imageFileName: 'gt.blockmachines~155.png' },
  '卷板机 (UV)': { itemId: 'i~gregtech~gt.blockmachines~156', imageFileName: 'gt.blockmachines~156.png' },
  '卷板机 (UHV)': { itemId: 'i~gregtech~gt.blockmachines~157', imageFileName: 'gt.blockmachines~157.png' },
  '卷板机 (UEV)': { itemId: 'i~gregtech~gt.blockmachines~158', imageFileName: 'gt.blockmachines~158.png' },
  '卷板机 (ULV)': { itemId: 'i~gregtech~gt.blockmachines~148', imageFileName: 'gt.blockmachines~148.png' },
  '卷板机 (UMV)': { itemId: 'i~gregtech~gt.blockmachines~160', imageFileName: 'gt.blockmachines~160.png' },
  '卷板机 (UXV)': { itemId: 'i~gregtech~gt.blockmachines~161', imageFileName: 'gt.blockmachines~161.png' },
  '卷板机 (MAX)': { itemId: 'i~gregtech~gt.blockmachines~162', imageFileName: 'gt.blockmachines~162.png' },

  '压模机 (LV)': { itemId: 'i~gregtech~gt.blockmachines~173', imageFileName: 'gt.blockmachines~173.png' },
  '压模机 (MV)': { itemId: 'i~gregtech~gt.blockmachines~174', imageFileName: 'gt.blockmachines~174.png' },
  '压模机 (HV)': { itemId: 'i~gregtech~gt.blockmachines~175', imageFileName: 'gt.blockmachines~175.png' },
  '压模机 (EV)': { itemId: 'i~gregtech~gt.blockmachines~176', imageFileName: 'gt.blockmachines~176.png' },
  '压模机 (IV)': { itemId: 'i~gregtech~gt.blockmachines~177', imageFileName: 'gt.blockmachines~177.png' },
  '压模机 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~178', imageFileName: 'gt.blockmachines~178.png' },
  '压模机 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~179', imageFileName: 'gt.blockmachines~179.png' },
  '压模机 (UV)': { itemId: 'i~gregtech~gt.blockmachines~180', imageFileName: 'gt.blockmachines~180.png' },
  '压模机 (UHV)': { itemId: 'i~gregtech~gt.blockmachines~181', imageFileName: 'gt.blockmachines~181.png' },
  '压模机 (ULV)': { itemId: 'i~gregtech~gt.blockmachines~172', imageFileName: 'gt.blockmachines~172.png' },
  '压模机 (UMV)': { itemId: 'i~gregtech~gt.blockmachines~183', imageFileName: 'gt.blockmachines~183.png' },
  '压模机 (UXV)': { itemId: 'i~gregtech~gt.blockmachines~184', imageFileName: 'gt.blockmachines~184.png' },
  '压模机 (MAX)': { itemId: 'i~gregtech~gt.blockmachines~185', imageFileName: 'gt.blockmachines~185.png' },

  '冲压机床 (LV)': { itemId: 'i~gregtech~gt.blockmachines~167', imageFileName: 'gt.blockmachines~167.png' },
  '冲压机床 (MV)': { itemId: 'i~gregtech~gt.blockmachines~168', imageFileName: 'gt.blockmachines~168.png' },
  '冲压机床 (ULV)': { itemId: 'i~gregtech~gt.blockmachines~166', imageFileName: 'gt.blockmachines~166.png' },

  '萃取机 (EV)': { itemId: 'i~gregtech~gt.blockmachines~229', imageFileName: 'gt.blockmachines~229.png' },
  '萃取机 (HV)': { itemId: 'i~gregtech~gt.blockmachines~230', imageFileName: 'gt.blockmachines~230.png' },
  '萃取机 (IV)': { itemId: 'i~gregtech~gt.blockmachines~231', imageFileName: 'gt.blockmachines~231.png' },
  '萃取机 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~232', imageFileName: 'gt.blockmachines~232.png' },
  '萃取机 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~233', imageFileName: 'gt.blockmachines~233.png' },
  '萃取机 (UV)': { itemId: 'i~gregtech~gt.blockmachines~234', imageFileName: 'gt.blockmachines~234.png' },
  '萃取机 (UHV)': { itemId: 'i~gregtech~gt.blockmachines~235', imageFileName: 'gt.blockmachines~235.png' },

  '固体机': { itemId: 'i~gregtech~gt.blockmachines~47', imageFileName: 'gt.blockmachines~47.png' },

  '微波机': { itemId: 'i~gregtech~gt.blockmachines~53', imageFileName: 'gt.blockmachines~53.png' },

  '能源激光': { itemId: 'i~gregtech~gt.blockmachines~50', imageFileName: 'gt.blockmachines~50.png' },

  '烧结炉': { itemId: 'i~gregtech~gt.blockmachines~48', imageFileName: 'gt.blockmachines~48.png' },

  '化学反应釜 (LV)': { itemId: 'i~gregtech~gt.blockmachines~209', imageFileName: 'gt.blockmachines~209.png' },
  '化学反应釜 (MV)': { itemId: 'i~gregtech~gt.blockmachines~210', imageFileName: 'gt.blockmachines~210.png' },
  '化学反应釜 (HV)': { itemId: 'i~gregtech~gt.blockmachines~211', imageFileName: 'gt.blockmachines~211.png' },
  '化学反应釜 (EV)': { itemId: 'i~gregtech~gt.blockmachines~212', imageFileName: 'gt.blockmachines~212.png' },
  '化学反应釜 (IV)': { itemId: 'i~gregtech~gt.blockmachines~213', imageFileName: 'gt.blockmachines~213.png' },
  '化学反应釜 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~214', imageFileName: 'gt.blockmachines~214.png' },
  '化学反应釜 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~215', imageFileName: 'gt.blockmachines~215.png' },
  '化学反应釜 (UV)': { itemId: 'i~gregtech~gt.blockmachines~216', imageFileName: 'gt.blockmachines~216.png' },
  '化学反应釜 (UHV)': { itemId: 'i~gregtech~gt.blockmachines~217', imageFileName: 'gt.blockmachines~217.png' },
  '化学反应釜 (ULV)': { itemId: 'i~gregtech~gt.blockmachines~208', imageFileName: 'gt.blockmachines~208.png' },

  '蒸馏塔 (EV)': { itemId: 'i~gregtech~gt.blockmachines~301', imageFileName: 'gt.blockmachines~301.png' },
  '蒸馏塔 (HV)': { itemId: 'i~gregtech~gt.blockmachines~302', imageFileName: 'gt.blockmachines~302.png' },
  '蒸馏塔 (IV)': { itemId: 'i~gregtech~gt.blockmachines~303', imageFileName: 'gt.blockmachines~303.png' },
  '蒸馏塔 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~304', imageFileName: 'gt.blockmachines~304.png' },
  '蒸馏塔 (MV)': { itemId: 'i~gregtech~gt.blockmachines~305', imageFileName: 'gt.blockmachines~305.png' },
  '蒸馏塔 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~306', imageFileName: 'gt.blockmachines~306.png' },
  '蒸馏塔 (UV)': { itemId: 'i~gregtech~gt.blockmachines~307', imageFileName: 'gt.blockmachines~307.png' },
  '蒸馏塔 (UHV)': { itemId: 'i~gregtech~gt.blockmachines~308', imageFileName: 'gt.blockmachines~308.png' },

  '蒸馏室 (LV)': { itemId: 'i~gregtech~gt.blockmachines~293', imageFileName: 'gt.blockmachines~293.png' },
  '蒸馏室 (MV)': { itemId: 'i~gregtech~gt.blockmachines~294', imageFileName: 'gt.blockmachines~294.png' },
  '蒸馏室 (HV)': { itemId: 'i~gregtech~gt.blockmachines~295', imageFileName: 'gt.blockmachines~295.png' },
  '蒸馏室 (ULV)': { itemId: 'i~gregtech~gt.blockmachines~292', imageFileName: 'gt.blockmachines~292.png' },

  '真空冷冻机 (EV)': { itemId: 'i~gregtech~gt.blockmachines~197', imageFileName: 'gt.blockmachines~197.png' },
  '真空冷冻机 (HV)': { itemId: 'i~gregtech~gt.blockmachines~198', imageFileName: 'gt.blockmachines~198.png' },
  '真空冷冻机 (IV)': { itemId: 'i~gregtech~gt.blockmachines~199', imageFileName: 'gt.blockmachines~199.png' },
  '真空冷冻机 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~200', imageFileName: 'gt.blockmachines~200.png' },
  '真空冷冻机 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~201', imageFileName: 'gt.blockmachines~201.png' },
  '真空冷冻机 (UV)': { itemId: 'i~gregtech~gt.blockmachines~202', imageFileName: 'gt.blockmachines~202.png' },
  '真空冷冻机 (UHV)': { itemId: 'i~gregtech~gt.blockmachines~203', imageFileName: 'gt.blockmachines~203.png' },
  '真空冷冻机 (UIV)': { itemId: 'i~gregtech~gt.blockmachines~204', imageFileName: 'gt.blockmachines~204.png' },
  '真空冷冻机 (ULV)': { itemId: 'i~gregtech~gt.blockmachines~196', imageFileName: 'gt.blockmachines~196.png' },
  '真空冷冻机 (UMV)': { itemId: 'i~gregtech~gt.blockmachines~2064', imageFileName: 'gt.blockmachines~2064.png' },
  '真空冷冻机 (UXV)': { itemId: 'i~gregtech~gt.blockmachines~2065', imageFileName: 'gt.blockmachines~2065.png' },
  '真空冷冻机 (MAX)': { itemId: 'i~gregtech~gt.blockmachines~2066', imageFileName: 'gt.blockmachines~2066.png' },

  '真空干燥炉 (EV)': { itemId: 'i~gregtech~gt.blockmachines~207', imageFileName: 'gt.blockmachines~207.png' },
  '真空干燥炉 (IV)': { itemId: 'i~gregtech~gt.blockmachines~208', imageFileName: 'gt.blockmachines~208.png' },
  '真空干燥炉 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~209', imageFileName: 'gt.blockmachines~209.png' },
  '真空干燥炉 (UV)': { itemId: 'i~gregtech~gt.blockmachines~210', imageFileName: 'gt.blockmachines~210.png' },
  '真空干燥炉 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~211', imageFileName: 'gt.blockmachines~211.png' },

  '脱水机 (EV)': { itemId: 'i~gregtech~gt.blockmachines~212', imageFileName: 'gt.blockmachines~212.png' },
  '脱水机 (HV)': { itemId: 'i~gregtech~gt.blockmachines~213', imageFileName: 'gt.blockmachines~213.png' },
  '脱水机 (IV)': { itemId: 'i~gregtech~gt.blockmachines~214', imageFileName: 'gt.blockmachines~214.png' },
  '脱水机 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~215', imageFileName: 'gt.blockmachines~215.png' },
  '脱水机 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~216', imageFileName: 'gt.blockmachines~216.png' },
  '脱水机 (UV)': { itemId: 'i~gregtech~gt.blockmachines~217', imageFileName: 'gt.blockmachines~217.png' },
  '脱水机 (UHV)': { itemId: 'i~gregtech~gt.blockmachines~218', imageFileName: 'gt.blockmachines~218.png' },

  'Autoclave': { itemId: 'i~gregtech~gt.blockmachines~219', imageFileName: 'gt.blockmachines~219.png' },

  '大规模化学反应釜 (EV)': { itemId: 'i~gregtech~gt.blockmachines~193', imageFileName: 'gt.blockmachines~193.png' },
  '大规模化学反应釜 (HV)': { itemId: 'i~gregtech~gt.blockmachines~194', imageFileName: 'gt.blockmachines~194.png' },
  '大规模化学反应釜 (IV)': { itemId: 'i~gregtech~gt.blockmachines~195', imageFileName: 'gt.blockmachines~195.png' },
  '大规模化学反应釜 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~196', imageFileName: 'gt.blockmachines~196.png' },
  '大规模化学反应釜 (MV)': { itemId: 'i~gregtech~gt.blockmachines~197', imageFileName: 'gt.blockmachines~197.png' },
  '大规模化学反应釜 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~198', imageFileName: 'gt.blockmachines~198.png' },
  '大规模化学反应釜 (UV)': { itemId: 'i~gregtech~gt.blockmachines~199', imageFileName: 'gt.blockmachines~199.png' },
  '大规模化学反应釜 (UHV)': { itemId: 'i~gregtech~gt.blockmachines~200', imageFileName: 'gt.blockmachines~200.png' },

  'UltraVoltage注振机': { itemId: 'i~gregtech~gt.blockmachines~110', imageFileName: 'gt.blockmachines~110.png' },

  '精密组装机': { itemId: 'i~gregtech~gt.blockmachines~201', imageFileName: 'gt.blockmachines~201.png' },
  '精密组装机 (IV)': { itemId: 'i~gregtech~gt.blockmachines~202', imageFileName: 'gt.blockmachines~202.png' },
  '精密组装机 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~203', imageFileName: 'gt.blockmachines~203.png' },
  '精密组装机 (MV)': { itemId: 'i~gregtech~gt.blockmachines~204', imageFileName: 'gt.blockmachines~204.png' },
  '精密组装机 (UV)': { itemId: 'i~gregtech~gt.blockmachines~205', imageFileName: 'gt.blockmachines~205.png' },
  '精密组装机 (ZPM)': { itemId: 'i~gregtech~gt.blockmachines~206', imageFileName: 'gt.blockmachines~206.png' },

  '高能粒子加速器 (EV)': { itemId: 'i~gregtech~gt.blockmachines~29', imageFileName: 'gt.blockmachines~29.png' },
  '高能粒子加速器 (LuV)': { itemId: 'i~gregtech~gt.blockmachines~2059', imageFileName: 'gt.blockmachines~2059.png' },
  '高能粒子加速器 (IV)': { itemId: 'i~gregtech~gt.blockmachines~2058', imageFileName: 'gt.blockmachines~2058.png' },

  '旋转式离心机': { itemId: 'i~gregtech~gt.blockmachines~50', imageFileName: 'gt.blockmachines~50.png' },

  '热解炉 (LV)': { itemId: 'i~gregtech~gt.blockmachines~225', imageFileName: 'gt.blockmachines~225.png' },
  '热解炉 (MV)': { itemId: 'i~gregtech~gt.blockmachines~226', imageFileName: 'gt.blockmachines~226.png' },
  '热解炉 (UV)': { itemId: 'i~gregtech~gt.blockmachines~227', imageFileName: 'gt.blockmachines~227.png' },

  '打包机 (LV)': { itemId: 'i~gregtech~gt.blockmachines~263', imageFileName: 'gt.blockmachines~263.png' },
  '打包机 (ULV)': { itemId: 'i~gregtech~gt.blockmachines~262', imageFileName: 'gt.blockmachines~262.png' },

  '线材轧机 (MV)': { itemId: 'i~gregtech~gt.blockmachines~189', imageFileName: 'gt.blockmachines~189.png' },
  '线材轧机 (ULV)': { itemId: 'i~gregtech~gt.blockmachines~188', imageFileName: 'gt.blockmachines~188.png' },

  '清洗机': { itemId: 'i~gregtech~gt.blockmachines~220', imageFileName: 'gt.blockmachines~220.png' },
  '清洗机 (LV)': { itemId: 'i~gregtech~gt.blockmachines~221', imageFileName: 'gt.blockmachines~221.png' },
  '清洗机 (ULV)': { itemId: 'i~gregtech~gt.blockmachines~222', imageFileName: 'gt.blockmachines~222.png' },
};

/**
 * 获取机器图标信息
 * @param machineType 机器类型（如 "研究站 (UXV)"）
 * @returns 机器图标信息，如果没有找到则返回null
 */
export function getMachineIcon(machineType: string): { itemId: string; imageFileName: string } | null {
  return GREGTECH_MACHINE_ICONS[machineType] || null;
}

/**
 * 为配方添加机器图标信息
 * @param machineType 机器类型
 * @returns 机器图标物品对象
 */
export function getMachineIconItem(machineType: string): {
  itemId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  imageFileName: string;
} | null {
  const icon = getMachineIcon(machineType);
  if (!icon) return null;

  // 从itemId中解析出modId和internalName
  const parts = icon.itemId.split('~');
  if (parts.length >= 4) {
    const modId = parts[1];
    return {
      itemId: icon.itemId,
      modId: modId,
      internalName: parts[2],
      localizedName: machineType, // 使用机器类型作为名称
      imageFileName: `${modId}/${icon.imageFileName}` // ⭐ 添加modId路径
    };
  }

  return null;
}

interface RecipeWithMachineInfo {
  machineInfo?: {
    machineType?: string;
    machineIcon?: unknown;
  };
}

/**
 * 批量为配方列表添加机器图标
 * @param recipes 配方列表
 */
export function addMachineIconsToRecipes<T extends RecipeWithMachineInfo>(recipes: T[]): T[] {
  return recipes.map(recipe => {
    if (recipe.machineInfo && recipe.machineInfo.machineType) {
      const iconItem = getMachineIconItem(recipe.machineInfo.machineType);
      if (iconItem && !recipe.machineInfo.machineIcon) {
        recipe.machineInfo.machineIcon = iconItem;
      }
    }
    return recipe;
  });
}
