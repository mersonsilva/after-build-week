export function isFavorite(favorites = [], profileId) {
  return favorites.includes(profileId);
}

export function toggleFavorite(favorites = [], profileId) {
  if (!profileId) return favorites;

  return isFavorite(favorites, profileId)
    ? favorites.filter((id) => id !== profileId)
    : [...favorites, profileId];
}



