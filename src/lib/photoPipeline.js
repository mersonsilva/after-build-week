const IMAGE_SIGNATURES = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif"
};

export const PHOTO_PIPELINE_LIMITS = {
  profile: { maxBytes: 25 * 1024 * 1024, outputMaxSide: 1600, quality: 0.9 },
  gallery: { maxBytes: 25 * 1024 * 1024, outputMaxSide: 1800, quality: 0.9 },
  chat: { maxBytes: 25 * 1024 * 1024, outputMaxSide: 1800, quality: 0.88 },
  signup: { maxBytes: 25 * 1024 * 1024, outputMaxSide: 1400, quality: 0.9 }
};

export function getPhotoPipelineContext(target = "profile") {
  if (target === "chat") return "chat";
  if (target === "main" || target === "profile") return "profile";
  if (target === "signup") return "signup";
  return "gallery";
}

export async function createPhotoEditorSource(file, options = {}) {
  const context = getPhotoPipelineContext(options.context);
  assertPhotoCandidate(file, context);
  const objectUrl = URL.createObjectURL(file);
  return {
    url: objectUrl,
    kind: "object-url",
    mime: getDeclaredImageMime(file),
    needsRevoke: true
  };
}

export async function createFallbackPhotoEditorSource(file, failedSource = null, options = {}) {
  const context = getPhotoPipelineContext(options.context);
  assertPhotoCandidate(file, context);

  if (failedSource?.needsRevoke && failedSource.url?.startsWith("blob:")) {
    URL.revokeObjectURL(failedSource.url);
  }

  const dataUrl = await fileToImageDataUrl(file);
  return {
    url: dataUrl,
    kind: "data-url",
    mime: getDataUrlMime(dataUrl),
    needsRevoke: false
  };
}

export function revokePhotoEditorSource(source) {
  if (source?.needsRevoke && source.url?.startsWith("blob:")) {
    URL.revokeObjectURL(source.url);
  }
}

export function assertPhotoCandidate(file, context = "profile") {
  if (!file) throw new Error("Nenhuma foto foi selecionada.");
  const limit = PHOTO_PIPELINE_LIMITS[getPhotoPipelineContext(context)] || PHOTO_PIPELINE_LIMITS.profile;
  if (file.size > limit.maxBytes) throw new Error("A foto é grande demais. Escolha uma imagem de até 25 MB.");
}

export async function fileToImageDataUrl(file) {
  const raw = await readFileAsDataUrl(file);
  const normalized = normalizeImageDataUrl(raw, file);
  if (!normalized.startsWith("data:image/")) {
    throw new Error("Este arquivo não parece ser uma imagem compatível.");
  }
  return normalized;
}

export function normalizeImageDataUrl(dataUrl, file) {
  const value = String(dataUrl || "");
  if (!value.startsWith("data:")) return value;
  if (value.startsWith("data:image/")) return value;

  const mime = getDeclaredImageMime(file) || inferImageMimeFromDataUrl(value);
  if (!mime) return value;
  return value.replace(/^data:[^;,]*(?=[;,])/, `data:${mime}`);
}

export function getDeclaredImageMime(file) {
  const type = String(file?.type || "").split(";")[0].toLowerCase();
  if (type.startsWith("image/")) return type;

  const extension = String(file?.name || "").split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return IMAGE_SIGNATURES.jpeg;
  if (extension === "png") return IMAGE_SIGNATURES.png;
  if (extension === "webp") return IMAGE_SIGNATURES.webp;
  if (extension === "heic") return IMAGE_SIGNATURES.heic;
  if (extension === "heif") return IMAGE_SIGNATURES.heif;
  return "";
}

export function inferImageMimeFromDataUrl(dataUrl) {
  const payload = String(dataUrl || "").split(",")[1] || "";
  if (!payload) return "";

  try {
    const binary = window.atob(payload.slice(0, 80));
    const bytes = Array.from(binary.slice(0, 16), (char) => char.charCodeAt(0));
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return IMAGE_SIGNATURES.jpeg;
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return IMAGE_SIGNATURES.png;
    if (binary.slice(0, 4) === "RIFF" && binary.slice(8, 12) === "WEBP") return IMAGE_SIGNATURES.webp;
    if (binary.slice(4, 12) === "ftypheic") return IMAGE_SIGNATURES.heic;
    if (binary.slice(4, 12) === "ftypheif" || binary.slice(4, 12) === "ftypmif1") return IMAGE_SIGNATURES.heif;
  } catch {
    return "";
  }

  return "";
}

export async function canvasToPhotoFile(canvas, options = {}) {
  if (!canvas) throw new Error("Não foi possível gerar a imagem final.");
  const context = getPhotoPipelineContext(options.context);
  const config = PHOTO_PIPELINE_LIMITS[context] || PHOTO_PIPELINE_LIMITS.profile;
  const outputCanvas = resizeCanvasForPhoto(canvas, config.outputMaxSide);
  let blob = await canvasToBlob(outputCanvas, "image/webp", config.quality);
  let extension = "webp";
  if (!blob) {
    blob = await canvasToBlob(outputCanvas, "image/jpeg", config.quality);
    extension = "jpg";
  }
  if (!blob) throw new Error("Não foi possível converter esta imagem.");

  const name = String(options.name || "after-foto").replace(/\.[^.]+$/, "") || "after-foto";
  return new File([blob], `${name}.${extension}`, { type: blob.type || "image/webp" });
}

export function canvasToBlob(canvas, type = "image/webp", quality = 0.9) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Não foi possível ler esta foto."));
    reader.readAsDataURL(file);
  });
}

export function getDataUrlMime(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)/);
  return match?.[1] || "";
}

function resizeCanvasForPhoto(canvas, maxSide) {
  const width = Number(canvas.width) || 1;
  const height = Number(canvas.height) || 1;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  if (scale >= 1) return canvas;

  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(width * scale));
  output.height = Math.max(1, Math.round(height * scale));
  const context = output.getContext("2d", { alpha: false });
  context.fillStyle = "#061014";
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(canvas, 0, 0, output.width, output.height);
  return output;
}



