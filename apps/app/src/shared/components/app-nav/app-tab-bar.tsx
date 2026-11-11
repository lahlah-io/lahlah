import { NavLink } from "react-router";

import { cn } from "@/shared/utils/cn";

import { PRIMARY_NAV_ITEMS, SETTINGS_NAV_ITEM } from "./nav-items";

const TAB_ITEMS = [...PRIMARY_NAV_ITEMS, SETTINGS_NAV_ITEM];

/** Icon-only bottom navigation for small screens, mirroring the desktop rail. */
export function AppTabBar() {
  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-sidebar-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {TAB_ITEMS.map((item) => {
        const Icon = item.icon;

        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            aria-label={item.label}
            title={item.label}
            className={({ isActive }) =>
              cn(
                "grid min-h-14 flex-1 place-items-center text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset [&_svg]:block [&_svg]:shrink-0",
                isActive ? "text-white" : "hover:text-foreground",
              )
            }
          >
            <Icon aria-hidden="true" className="size-6" strokeWidth={1.75} />
          </NavLink>
        );
      })}
    </nav>
  );
}
