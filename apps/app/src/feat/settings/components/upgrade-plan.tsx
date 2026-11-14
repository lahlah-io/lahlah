import { useState } from "react";
import { BadgeCheck, Check, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Button } from "@/shared/components/ui/button";
import { useCurrentUser } from "@/shared/hooks/use-current-user";
import { cn } from "@/shared/utils/cn";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const FEATURES = [
  "Itinerary tanpa batas",
  "Rekomendasi AI tanpa batas harian",
  "Peta rute offline",
  "Kolaborasi itinerary bareng teman",
  "Prioritas dukungan",
  "Pembatalan kapan saja",
];

const PERIODS = [
  {
    id: "monthly",
    label: "Bulanan",
    price: 15000,
    suffix: "/ bulan",
    note: "Ditagih Rp15.000 setiap bulan. Batalkan kapan saja.",
  },
  {
    id: "annual",
    label: "Tahunan",
    price: 150000,
    suffix: "/ tahun",
    badge: "2 bulan gratis",
    note: "Ditagih Rp150.000 sekali setahun. Hemat dibanding bulanan.",
  },
] as const;

const rupiah = new Intl.NumberFormat("id-ID");

export function UpgradePlan() {
  const { plan } = useCurrentUser();
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");
  const reduceMotion = useReducedMotion();
  const isPlus = plan === "Plus";

  const period = PERIODS.find((item) => item.id === billing) ?? PERIODS[1];
  const shift = reduceMotion ? 0 : 18;
  const container = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };
  const item = {
    hidden: { opacity: 0, y: shift },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
  };

  return (
    <motion.section
      aria-labelledby="upgrade-plan-title"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={container}
      className="flex flex-col gap-5"
    >
      <motion.div variants={item} className="text-center">
        <h2 id="upgrade-plan-title" className="text-xl font-semibold tracking-tight">
          Satu paket. Semua fitur.
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Semua yang Lahlah punya, tanpa tingkatan yang memberatkan.
        </p>
      </motion.div>

      <motion.div variants={item} className="flex justify-center">
        <div
          role="group"
          aria-label="Periode tagihan"
          className="inline-flex rounded-full border bg-muted p-1"
        >
          {PERIODS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={billing === option.id}
              onClick={() => setBilling(option.id)}
              className={cn(
                "relative cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                billing === option.id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {billing === option.id ? (
                <motion.span
                  layoutId="upgrade-billing-thumb"
                  transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
                  className="absolute inset-0 rounded-full bg-background shadow-sm"
                />
              ) : null}
              <span className="relative z-10 flex items-center gap-1.5">
                {option.label}
                {"badge" in option ? (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none font-semibold text-primary-foreground">
                    {option.badge}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div
        variants={item}
        className="overflow-hidden rounded-2xl border bg-card shadow-lg"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="p-5 sm:p-7">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium">
              <BadgeCheck aria-hidden="true" className="size-3.5" />
              Paket Plus
            </span>

            <div className="mt-6 flex items-baseline gap-1.5">
              <span className="text-xl font-medium text-muted-foreground">Rp</span>
              <span className="relative inline-grid overflow-hidden">
                <span
                  aria-hidden="true"
                  className="invisible col-start-1 row-start-1 text-5xl font-semibold tracking-tight tabular-nums"
                >
                  {rupiah.format(period.price)}
                </span>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={period.price}
                    initial={{ opacity: 0, y: shift }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -shift }}
                    transition={{ duration: reduceMotion ? 0 : 0.3, ease: EASE }}
                    className="col-start-1 row-start-1 text-5xl font-semibold tracking-tight tabular-nums"
                  >
                    {rupiah.format(period.price)}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span className="text-sm text-muted-foreground">{period.suffix}</span>
            </div>

            <p className="mt-2 min-h-5 text-sm text-muted-foreground">
              {period.note}
            </p>

            {/* Endpoint pembayaran belum ada di API, jadi tombol ini tidak boleh
                mengubah paket secara lokal. Aktifkan saat POST /subscriptions
                tersedia. */}
            <Button
              className="mt-6 w-full sm:w-auto"
              disabled
            >
              {isPlus ? "Paket aktif" : "Segera hadir"}
            </Button>

            <p className="mt-6 text-xs text-muted-foreground">
              Harga dalam Rupiah. Pembayaran akan tersedia lewat penyedia pembayaran
              saat rilis.
            </p>
          </div>

          <div className="border-t p-5 sm:p-7 lg:border-t-0 lg:border-l">
            <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
              Semua termasuk
            </p>
            <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={item}
        className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2"
      >
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="size-4" />
          Batalkan kapan saja
        </span>
        <span className="text-sm text-muted-foreground">
          Tanpa biaya tersembunyi
        </span>
      </motion.div>
    </motion.section>
  );
}
