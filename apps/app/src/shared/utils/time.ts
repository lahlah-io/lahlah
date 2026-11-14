/**
 * Waktu relatif pendek (`5 mnt`, `2 jam`, `3 h lalu`); fallback tanggal.
 *
 * API mengirim `updatedAt` ISO, feed menampilkannya sebagai label siapa-kapan.
 * Invalid date tidak dilempar: kembalikan string asal supaya UI tetap jalan.
 */
export function formatRelativeTime(value: string): string {
  const stamp = Date.parse(value);
  if (Number.isNaN(stamp)) return value;

  const diff = Date.now() - stamp;
  if (diff < 0) return "baru saja";

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "baru saja";
  if (diff < hour) return `${Math.floor(diff / minute)} mnt`;
  if (diff < day) return `${Math.floor(diff / hour)} jam`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} hari`;

  const date = new Date(stamp);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
