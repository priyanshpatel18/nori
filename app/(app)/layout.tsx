import * as React from "react";

import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { AppTopbar } from "@/components/app-shell/app-topbar";
import { PageTransition } from "@/components/app-shell/page-transition";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen className="h-svh overflow-hidden">
      <AppSidebar />
      <SidebarInset className="bg-background">
        <AppTopbar />
        <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden">
          <PageTransition>{children}</PageTransition>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
