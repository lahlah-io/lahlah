const STORAGE_KEY = "lahlah.app.token";

/**
 * `sessionStorage` dipilih daripada `localStorage`: sesi bertahan saat reload
 * tetapi hilang ketika tab ditutup, sehingga token tidak menetap di perangkat
 * bersama. Token tetap dapat dibaca JavaScript, jadi jangan pakai di perangkat
 * yang tidak dipercaya.
 */
export function readStoredToken(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Mode privat atau storage penuh: sesi tetap jalan sampai halaman di-reload.
  }
}

export function clearStoredToken(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Tidak ada yang perlu dilakukan bila storage tidak bisa diakses.
  }
}
