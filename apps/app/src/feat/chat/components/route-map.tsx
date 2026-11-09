import { motion } from "motion/react";

const ROUTE_PATH =
  "M56 236 C 132 214, 168 186, 232 172 S 330 150, 386 112 S 470 78, 512 44";

const NODES = [
  { cx: 56, cy: 236 },
  { cx: 232, cy: 172 },
  { cx: 386, cy: 112 },
  { cx: 512, cy: 44 },
];

export function RouteMap() {
  return (
    <section aria-label="Peta rute" className="px-4 sm:px-6">
      <div className="relative aspect-16/9 w-full overflow-hidden rounded-xl border bg-muted/40">
        <svg
          viewBox="0 0 568 280"
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
            <path d="M0 92 H568" />
            <path d="M0 188 H568" />
            <path d="M148 0 V280" />
            <path d="M300 0 V280" />
            <path d="M444 0 V280" />
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
