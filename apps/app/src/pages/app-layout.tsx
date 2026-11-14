import { Outlet } from "react-router";

import { ChatThreadsProvider } from "@/feat/chat/context/chat-threads-context";
import { AppRail } from "@/shared/components/app-nav/app-rail";
import { AppTabBar } from "@/shared/components/app-nav/app-tab-bar";
import { TooltipProvider } from "@/shared/components/ui/tooltip";

/** App chrome shared by every route: icon rail, page outlet, mobile tab bar. */
export function AppLayout() {
  return (
    <ChatThreadsProvider>
      <TooltipProvider delayDuration={300}>
        <div className="flex h-svh w-full overflow-hidden bg-background">
          <AppRail />
          <main className="min-w-0 flex-1 overflow-hidden">
            <Outlet />
          </main>
          <AppTabBar />
        </div>
      </TooltipProvider>
    </ChatThreadsProvider>
  );
}
