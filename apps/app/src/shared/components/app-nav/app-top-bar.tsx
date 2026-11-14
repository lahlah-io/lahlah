import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/shared/utils/cn";

/**
 * Topbar utama: logo di kiri, aksi halaman di kanan.
 *
 * Sembunyi saat scroll ke bawah dan muncul lagi begitu scroll ke atas, supaya
 * layar terasa lebih lega. Transisi transform saja, tanpa mengubah layout.
 */
export function AppTopBar({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // ponytail: kontainer scroll dicari lewat kelas halaman; ganti ke ref kalau
    // pola `overflow-y-auto` berubah.
    const scroller = ref.current?.closest<HTMLElement>(".overflow-y-auto");
    if (!scroller) return;
    const el = scroller;

    let last = el.scrollTop;

    function onScroll() {
      const y = el.scrollTop;
      const delta = y - last;

      if (y <= 8) setHidden(false);
      else if (delta > 8) setHidden(true);
      else if (delta < -8) setHidden(false);

      last = y;
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      ref={ref}
      className={cn(
        "sticky top-0 z-30 flex h-14 shrink-0 items-center border-b border-border bg-background/95 px-4 backdrop-blur transition-transform duration-200 ease-out motion-reduce:transition-none",
        hidden && "-translate-y-full",
      )}
    >
      <img src="/logo.svg" alt="Lahlah" className="h-5 w-auto" />
      {children ? (
        <div className="ml-auto flex items-center gap-2">{children}</div>
      ) : null}
    </header>
  );
}
