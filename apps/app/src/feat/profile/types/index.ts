/** Data minimum satu tile di grid profil. */
export interface ProfileTripCard {
  id: string;
  title: string;
  viewCount: number;
  /** Koordinat `[longitude, latitude]` untuk cover peta rute. */
  waypoints: [number, number][];
}

/** Angka header profil yang sudah diformat untuk ditampilkan. */
export interface ProfileStats {
  distance: string;
  likes: string;
  trips: string;
}
