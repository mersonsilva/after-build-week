import { canvasToPhotoFile } from "./photoPipeline.js";

export async function compressPhotoCanvas(canvas, options = {}) {
  return canvasToPhotoFile(canvas, options);
}



