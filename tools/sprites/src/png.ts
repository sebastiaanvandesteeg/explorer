import { PNG } from "pngjs";
import type { Canvas } from "./canvas";

export function encodePng(canvas: Canvas): Buffer {
  const png = new PNG({ width: canvas.width, height: canvas.height });
  png.data = Buffer.from(canvas.data.buffer, canvas.data.byteOffset, canvas.data.byteLength);
  return PNG.sync.write(png, { colorType: 6, deflateLevel: 9 });
}
