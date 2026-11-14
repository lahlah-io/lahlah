import { NavLink, useLocation } from "react-router";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { cn } from "@/shared/utils/cn";

import { PRIMARY_NAV_ITEMS, SETTINGS_NAV_ITEM, type NavItem } from "./nav-items";

function RailLink({ item }: { item: NavItem }) {
  const { pathname } = useLocation();
  const isActive = item.end
    ? pathname === item.to
    : pathname === item.to || pathname.startsWith(`${item.to}/`);
  const Icon = item.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={item.to}
          end={item.end}
          aria-label={item.label}
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring [&_svg]:block [&_svg]:shrink-0",
            isActive
              ? "text-white hover:text-white"
              : "hover:text-foreground",
          )}
        >
          <Icon aria-hidden="true" className="size-6" strokeWidth={1.75} />
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

/** Icon-only navigation rail, shown from `md` upward. */
export function AppRail() {
  return (
    <aside className="hidden h-svh w-[4.5rem] shrink-0 flex-col items-center py-4 md:flex">
      <NavLink
        to="/"
        aria-label="Lahlah, kembali ke Chat"
        className="size-10 shrink-0 overflow-hidden rounded-xl outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <img src="/logo-mark.svg" alt="" className="size-full object-cover" />
      </NavLink>

      <div className="flex w-full flex-1 flex-col items-center justify-center">
        <nav
          aria-label="Navigasi utama"
          className="flex flex-col items-center gap-2"
        >
          {PRIMARY_NAV_ITEMS.map((item) => (
            <RailLink key={item.to} item={item} />
          ))}
        </nav>
      </div>

      <div className="flex w-full flex-col items-center border-t border-sidebar-border pt-3">
        <RailLink item={SETTINGS_NAV_ITEM} />
      </div>
    </aside>
  );
}
