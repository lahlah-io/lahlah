import BoringAvatar from "boring-avatars";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/shared/components/ui/avatar";

/**
 * Palet literal untuk `boring-avatars`: komponennya tidak menerima `oklch()`
 * atau token CSS, jadi nilai token tema dikonversi ke hex di sini.
 * Urutan penting — warna pertama dipakai sebagai latar varian `beam`.
 * ponytail: varian terkunci `beam` + 5 hex statis; tambah pemilih varian/palet
 * saat butuh tema dinamis atau branding baru.
 */
const AVATAR_COLORS = [
  "#1447e6", // sidebar-primary
  "#3c91fd", // blue
  "#46c473", // green
  "#f5ae39", // amber
  "#d4d4d4", // netral
];

/**
 * Avatar pengguna: foto bila `src` diisi, selain itu avatar generatif dari
 * `boring-avatars` yang di-seed dengan username supaya stabil per pengguna.
 */
export function UserAvatar({
  name,
  seed,
  src,
  className,
}: {
  name: string;
  /** Seed avatar generatif; pakai username agar tetap sama tiap render. */
  seed?: string;
  src?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {src ? <AvatarImage src={src} alt={name} /> : null}
      <AvatarFallback className="bg-transparent">
        <BoringAvatar
          name={seed ?? name}
          size="100%"
          variant="beam"
          colors={AVATAR_COLORS}
          aria-hidden="true"
        />
      </AvatarFallback>
    </Avatar>
  );
}
