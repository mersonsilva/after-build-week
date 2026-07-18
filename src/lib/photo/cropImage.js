import { canvasToPhotoFile } from "./photoPipeline.js";

export async function cropCanvasToPhotoFile(canvas, options = {}) {
  return canvasToPhotoFile(canvas, options);
}



