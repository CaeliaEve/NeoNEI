export interface NativeLayout {
  size: number;
  edge: number;
  count: number;
  dimensions: number[][];
  files: Array<{path: string}>;
}

export function nativeFrame(layout: NativeLayout, sprite: number) {
  if (!Number.isSafeInteger(sprite) || sprite < 0 || sprite >= layout.count) throw Error('图标编号无效');
  const columns = layout.edge / layout.size, perPage = columns * columns;
  const cell = sprite % perPage, dimensions = layout.dimensions[sprite];
  if (!dimensions || dimensions.length !== 2 || dimensions.some(n => !Number.isInteger(n) || n < 1 || n > layout.size)) throw Error('原生图标尺寸无效');
  const file = layout.files[Math.floor(sprite / perPage)];
  if (!file) throw Error('原生图标页缺失');
  return {path:file.path, x:(cell % columns)*layout.size, y:Math.floor(cell / columns)*layout.size,
    width:dimensions[0]!, height:dimensions[1]!, ticks:1};
}
