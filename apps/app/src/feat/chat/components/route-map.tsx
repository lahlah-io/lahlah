import { motion } from "motion/react";

const ROUTE_PATH =
  "M60 156 C 170 150, 240 120, 330 112 S 470 96, 560 70 S 740 46, 840 44";

const NODES = [
  { cx: 60, cy: 156 },
  { cx: 330, cy: 112 },
  { cx: 560, cy: 70 },
  { cx: 840, cy: 44 },
];

export function RouteMap() {
  return (
    <section
      aria-label="Peta rute"
      className="mx-auto w-full max-w-4xl px-4 sm:px-6"
    >
      <div className="relative h-[200px] w-full overflow-hidden rounded-xl border bg-muted/40">
        <svg
          viewBox="0 0 900 200"
          preserveAspectRatio="xMidYMid slice"
          role="img"
          aria-label="Peta rute perjalanan"
          className="size-full"
        >
          <g
            aria-hidden="true"
            stroke="var(--color-border)"
            strokeWidth={1}
            opacity={0.5}
          >
            <path d="M0 66 H900" />
            <path d="M0 134 H900" />
            <path d="M225 0 V200" />
            <path d="M450 0 V200" />
            <path d="M675 0 V200" />
          </g>

          <path
            d={ROUTE_PATH}
            fill="none"
            stroke="var(--color-foreground)"
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray="2 10"
            opacity={0.18}
          />
          <motion.path
            d={ROUTE_PATH}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth={4}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.6, ease: "easeOut" }}
          />

          {NODES.map((node, index) => (
            <g key={`${node.cx}-${node.cy}`}>
              <circle
                cx={node.cx}
                cy={node.cy}
                r={index === 0 || index === NODES.length - 1 ? 12 : 8}
                fill="var(--color-card)"
                stroke="var(--color-primary)"
                strokeWidth={3}
              />
              <circle
                cx={node.cx}
                cy={node.cy}
                r={3}
                fill="var(--color-primary)"
              />
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}
