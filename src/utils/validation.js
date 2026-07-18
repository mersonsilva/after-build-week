export const BIO_MAX_LENGTH = 160;
export const PHOTO_MAX_MB = 25;
export const PHOTO_MAX_BYTES = PHOTO_MAX_MB * 1024 * 1024;
export const CHAT_IMAGE_MAX_MB = 25;
export const CHAT_IMAGE_MAX_BYTES = CHAT_IMAGE_MAX_MB * 1024 * 1024;
export const CHAT_AUDIO_MAX_BYTES = 8 * 1024 * 1024;
export const CHAT_AUDIO_MAX_SECONDS = 60;
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ALLOWED_CHAT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ALLOWED_CHAT_AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"];
export const DEFAULT_PROFILE_PHOTO = "assets/after-mark.svg";

export function hasProfilePhoto(photo) {
  return Boolean(photo) && !String(photo).includes(DEFAULT_PROFILE_PHOTO);
}

export function hasAgeConfirmed(user) {
  if (!user) return false;
  if (user.ageVerified === true && isAdultBirthDate(user.birthDate)) return true;
  return user?.ageConfirmed === true || Number(user?.age) >= 18;
}

export function calculateAgeFromBirthDate(birthDate, referenceDate = new Date()) {
  if (!birthDate) return null;
  const date = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  let age = referenceDate.getFullYear() - date.getFullYear();
  const monthDiff = referenceDate.getMonth() - date.getMonth();
  const dayDiff = referenceDate.getDate() - date.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age;
}

export function isAdultBirthDate(birthDate) {
  const age = calculateAgeFromBirthDate(birthDate);
  return Number.isFinite(age) && age >= 18;
}

export function validateAgeGate({ birthDate, acceptedTerms, acceptedPrivacy, adultConfirmed }) {
  if (!birthDate) return "Informe sua data de nascimento para continuar.";
  const age = calculateAgeFromBirthDate(birthDate);
  if (!Number.isFinite(age)) return "Informe uma data de nascimento válida.";
  if (age < 18) return "Você precisa ter 18 anos ou mais para usar o AFTER.";
  if (!adultConfirmed) return "Confirme que você tem 18 anos ou mais.";
  if (!acceptedTerms) return "Aceite os Termos de Uso para continuar.";
  if (!acceptedPrivacy) return "Aceite a Política de Privacidade para continuar.";
  return "";
}

export function getProfileCompletenessScore(profile) {
  const score =
    (Number(profile?.age) >= 18 ? 35 : 0) +
    20 +
    (String(profile?.city || "").trim() ? 20 : 0) +
    (String(profile?.bio || "").trim() ? 20 : 0) +
    (hasProfilePhoto(profile?.photo || profile?.privatePhoto) && profile?.photoVisible !== false ? 5 : 0);

  return Math.min(100, score);
}

export function isVerifiedProfile(profile) {
  return Boolean(profile?.verified || profile?.perfilVerificado);
}

export function validatePhotoFile(file) {
  if (!file) return "Escolha uma foto de perfil.";

  if (!isSupportedImageFile(file, ALLOWED_PHOTO_TYPES)) {
    return "Use uma foto em JPG, PNG ou WebP.";
  }

  if (file.size > PHOTO_MAX_BYTES) {
    return `A foto deve ter no máximo ${PHOTO_MAX_MB} MB.`;
  }

  return "";
}

export function validateChatImageFile(file) {
  if (!file) return "Escolha uma imagem.";

  if (!isSupportedImageFile(file, ALLOWED_CHAT_IMAGE_TYPES)) {
    return "Envie imagem em JPG, PNG ou WebP.";
  }

  if (file.size > CHAT_IMAGE_MAX_BYTES) {
    return `A imagem deve ter no máximo ${CHAT_IMAGE_MAX_MB} MB.`;
  }

  return "";
}

function isSupportedImageFile(file, allowedTypes) {
  const type = String(file?.type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  if (allowedTypes.includes(type)) return true;
  const extension = String(file?.name || "").split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(extension || "")) return true;
  return Boolean(file?.size) && (!type || type === "application/octet-stream");
}

export function validateChatAudioBlob(blob, durationSeconds = 0) {
  const audioType = String(blob?.type || "").split(";")[0];

  if (!blob || blob.size < 200) return "Não foi possível gravar este áudio.";

  if (blob.size > CHAT_AUDIO_MAX_BYTES) {
    return "O áudio ficou grande demais. Grave até 60 segundos.";
  }

  if (audioType && !ALLOWED_CHAT_AUDIO_TYPES.includes(audioType)) {
    return "Formato de áudio não suportado neste aparelho.";
  }

  if (Number(durationSeconds) > CHAT_AUDIO_MAX_SECONDS) {
    return "Grave áudios de até 60 segundos.";
  }

  return "";
}

export function validateProfile(profile, options = {}) {
  const errors = [];
  const bio = String(profile.bio || "");
  const age = Number(profile.age);
  const requiresAge = options.requiresAge !== false;

  if (requiresAge && (!Number.isFinite(age) || age < 18)) errors.push("A idade mínima é 18 anos.");
  if (bio.length > BIO_MAX_LENGTH) errors.push(`A bio deve ter no máximo ${BIO_MAX_LENGTH} caracteres.`);
  if (profile.heightCm && (Number(profile.heightCm) < 120 || Number(profile.heightCm) > 230)) {
    errors.push("Informe uma altura válida em centímetros.");
  }
  if (profile.weightKg && (Number(profile.weightKg) < 35 || Number(profile.weightKg) > 250)) {
    errors.push("Informe um peso válido em kg.");
  }

  return errors;
}

export function isProfileComplete(user) {
  return hasAgeConfirmed(user);
}



