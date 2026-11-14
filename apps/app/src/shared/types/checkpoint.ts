/** Swafoto checkpoint yang tersimpan di perangkat. */
export interface Checkpoint {
  destinationId: string;
  /** Data URL JPEG hasil kamera, sudah diperkecil. */
  photo: string;
  latitude: number;
  longitude: number;
  /** Akurasi GPS dalam meter. */
  accuracy: number;
  createdAt: number;
}
