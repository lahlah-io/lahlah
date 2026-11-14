import { useEffect, useRef, useState } from "react";
import { Camera, CircleCheck, LocateFixed } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import type { Checkpoint } from "@/shared/types/checkpoint";
import type { Trip } from "@/shared/types/itinerary";
import {
  CHECKPOINT_RADIUS_METERS,
  findNearestDestination,
  formatDistance,
} from "@/shared/utils/geo";

type CameraState = "starting" | "ready" | "unavailable";

type CapturedLocation = Pick<
  GeolocationCoordinates,
  "accuracy" | "latitude" | "longitude"
>;

type CheckpointResult = { destinationName: string; capturedAt: number };

function locationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return "Izin lokasi ditolak. Aktifkan lokasi untuk checkpoint.";
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "Lokasi tidak tersedia. Coba di area terbuka.";
  }
  return "Gagal mengambil lokasi. Coba lagi.";
}

function formatArrivalTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Ambil frame video jadi JPEG kecil supaya aman disimpan di localStorage. */
function capturePhoto(video: HTMLVideoElement): string | null {
  if (!video.videoWidth || !video.videoHeight) return null;

  const scale = Math.min(1, 640 / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);

  const context = canvas.getContext("2d");
  if (!context) return null;

  // Selfie dicerminkan supaya hasil foto sama dengan preview kamera depan.
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/jpeg", 0.72);
}

function CheckpointCamera({
  trip,
  expectedDestinationId,
  onSave,
  onClose,
}: {
  trip: Trip;
  expectedDestinationId?: string;
  onSave: (checkpoint: Checkpoint) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Diputuskan di render, bukan di effect, supaya lint aman.
  const [support] = useState(() =>
    typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia
      ? "unsupported"
      : "supported",
  );
  const unavailable = support === "unsupported";
  const [camera, setCamera] = useState<CameraState>(
    unavailable ? "unavailable" : "starting",
  );
  const [photo, setPhoto] = useState<string | null>(null);
  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(
    unavailable ? "Kamera tidak tersedia di browser ini." : null,
  );
  const [result, setResult] = useState<CheckpointResult | null>(null);

  useEffect(() => {
    if (unavailable) return;

    let active = true;
    const video = videoRef.current;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (video) {
          video.srcObject = stream;
          void video.play().catch(() => undefined);
        }
      })
      .catch(() => {
        if (!active) return;
        setCamera("unavailable");
        setError(
          "Kamera tidak bisa dibuka. Izinkan akses kamera lalu coba lagi.",
        );
      });

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [unavailable]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function handleCapture() {
    const video = videoRef.current;
    const image = video ? capturePhoto(video) : null;

    if (!image) {
      setError("Kamera belum siap. Tunggu sebentar lalu coba lagi.");
      return;
    }

    setPhoto(image);
    setError(null);

    if (!("geolocation" in navigator)) {
      setError("Browser ini tidak mendukung lokasi.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          accuracy: position.coords.accuracy,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setLocation(coords);
        setLocating(false);

        const nearest = findNearestDestination(trip, coords);
        if (!nearest || nearest.distance > CHECKPOINT_RADIUS_METERS) {
          setError(
            nearest
              ? `Belum sampai. ${nearest.destination.name} ${formatDistance(nearest.distance)} dari sini.`
              : "Belum ada destinasi untuk checkpoint.",
          );
          return;
        }

        const expected = expectedDestinationId
          ? trip.days
              .flatMap((day) => day.destinations)
              .find((destination) => destination.id === expectedDestinationId)
          : undefined;
        if (expected && nearest.destination.id !== expected.id) {
          setError(
            `Kamu di dekat ${nearest.destination.name}, belum sampai ${expected.name}.`,
          );
          return;
        }

        const checkpoint: Checkpoint = {
          destinationId: nearest.destination.id,
          photo: image,
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          createdAt: Date.now(),
        };
        onSave(checkpoint);
        setResult({
          destinationName: nearest.destination.name,
          capturedAt: checkpoint.createdAt,
        });
        stopCamera();
      },
      (geoError) => {
        setError(locationErrorMessage(geoError));
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );
  }

  if (result) {
    return (
      <>
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-muted">
          {photo ? (
            <img
              src={photo}
              alt="Swafoto checkpoint"
              className="size-full object-cover"
            />
          ) : null}
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CircleCheck aria-hidden="true" className="size-4 text-green" />
            Checkpoint tercatat
          </p>
          <p className="mt-1 text-sm">{result.destinationName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Datang pukul {formatArrivalTime(result.capturedAt)}
          </p>
        </div>

        <Button type="button" className="w-full" onClick={onClose}>
          Selesai
        </Button>
      </>
    );
  }

  return (
    <>
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-muted">
        <video
          ref={videoRef}
          muted
          playsInline
          onLoadedMetadata={() => setCamera("ready")}
          className="size-full scale-x-[-1] object-cover"
        />

        {photo ? (
          <img
            src={photo}
            alt="Pratinjau swafoto checkpoint"
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}

        {camera === "starting" && !photo ? (
          <p className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-muted-foreground">
            Membuka kamera…
          </p>
        ) : null}
      </div>

      <div aria-live="polite" className="min-h-5 text-xs">
        {error ? (
          <p className="text-destructive">{error}</p>
        ) : locating ? (
          <p className="text-muted-foreground">Mengecek lokasi kamu…</p>
        ) : location ? (
          <p className="flex items-center gap-1.5 text-green">
            <CircleCheck aria-hidden="true" className="size-3.5" />
            Di lokasi · ±{Math.round(location.accuracy)} m
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <LocateFixed aria-hidden="true" className="size-3.5" />
            Lokasi dan waktu datang dicek otomatis.
          </p>
        )}
      </div>

      <DialogFooter className="flex-row">
        <Button
          type="button"
          className="flex-1"
          onClick={handleCapture}
          disabled={camera !== "ready" || locating}
        >
          <Camera aria-hidden="true" />
          {photo ? "Ulangi foto" : "Ambil foto"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function CheckpointDialog({
  trip,
  open,
  expectedDestinationId,
  onOpenChange,
  onSave,
}: {
  trip: Trip;
  open: boolean;
  expectedDestinationId?: string;
  onOpenChange: (open: boolean) => void;
  onSave: (checkpoint: Checkpoint) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Checkpoint</DialogTitle>
          <DialogDescription>
            Ambil swafoto. Kami cocokkan lokasi kamu dengan destinasi trip dan
            catat waktu datangnya.
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <CheckpointCamera
            trip={trip}
            expectedDestinationId={expectedDestinationId}
            onSave={onSave}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
