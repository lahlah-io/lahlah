import { Camera } from "lucide-react";

import type { Checkpoint } from "@/shared/types/checkpoint";
import { cn } from "@/shared/utils/cn";

const SIZES = {
  sm: { icon: "size-4", photo: "size-8", tail: "-mt-1 size-1.5" },
  md: { icon: "size-5", photo: "size-12", tail: "-mt-1.5 size-2.5" },
} as const;

/**
 * Pin bulat peta Lahlah.
 *
 * Dengan `checkpoint` menampilkan foto swafoto; tanpa itu jadi placeholder
 * ikon kamera yang menandakan destinasi belum punya checkpoint.
 */
export function CheckpointPin({
  checkpoint,
  alt = "",
  size = "md",
}: {
  checkpoint?: Checkpoint;
  alt?: string;
  size?: keyof typeof SIZES;
}) {
  const classes = SIZES[size];

  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          "grid place-items-center overflow-hidden rounded-full border-2 border-background bg-muted shadow-[0_4px_14px_rgb(0_0_0/0.4)] transition-transform duration-200 group-hover:scale-105",
          classes.photo,
          !checkpoint && "border-dashed border-muted-foreground/60 bg-background",
        )}
      >
        {checkpoint ? (
          <img
            src={checkpoint.photo}
            alt={alt}
            className="size-full object-cover"
          />
        ) : (
          <Camera
            aria-hidden="true"
            className={cn("text-muted-foreground", classes.icon)}
          />
        )}
      </div>
      <span
        aria-hidden="true"
        className={cn(
          "block rotate-45 rounded-[2px] bg-background shadow-[0_2px_6px_rgb(0_0_0/0.4)]",
          classes.tail,
        )}
      />
    </div>
  );
}
