"use client";

import {
  ClockIcon,
  DollarSendIcon,
  FileSecurityIcon,
  UserGroupIcon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { NoriMark } from "@/components/logos";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: typeof DollarSendIcon;
};

const NAV: NavItem[] = [
  {
    href: "/pay",
    label: "Pay",
    description: "Send a single private payment.",
    icon: DollarSendIcon,
  },
  {
    href: "/payroll",
    label: "Payroll",
    description: "Run a roster in one click.",
    icon: UserMultipleIcon,
  },
  {
    href: "/team",
    label: "Team",
    description: "Save recipients and recurring schedules.",
    icon: UserGroupIcon,
  },
  {
    href: "/history",
    label: "History",
    description: "Every transfer, only you can read it.",
    icon: ClockIcon,
  },
  {
    href: "/compliance",
    label: "Compliance",
    description: "Viewing keys and signed reports.",
    icon: FileSecurityIcon,
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="inset" className="border-r-0">
      <SidebarHeader>
        <Link
          href="/"
          className="group/brand flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-sidebar-accent/60"
        >
          <motion.span
            className="grid size-7 place-items-center"
            initial={{ rotate: -8, scale: 0.85, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
          >
            <NoriMark className="size-7" />
          </motion.span>
          <motion.span
            className="text-[15px] font-semibold tracking-tight text-sidebar-foreground group-data-[collapsible=icon]:hidden"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08, duration: 0.25 }}
          >
            Nori
          </motion.span>
        </Link>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item, i) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);

                return (
                  <SidebarMenuItem key={item.href}>
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: 0.06 + i * 0.04,
                        duration: 0.28,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="relative"
                    >
                      {isActive && (
                        <motion.span
                          layoutId="sidebar-active"
                          aria-hidden="true"
                          className="absolute inset-0 -z-0 rounded-lg bg-sidebar-accent"
                          transition={{
                            type: "spring",
                            stiffness: 380,
                            damping: 30,
                          }}
                        />
                      )}
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.label}
                        className={cn(
                          "relative z-10 bg-transparent! data-active:bg-transparent!",
                          isActive && "text-sidebar-accent-foreground",
                        )}
                        render={<Link href={item.href} />}
                      >
                        <HugeiconsIcon
                          icon={item.icon}
                          size={16}
                          strokeWidth={1.8}
                          className={cn(
                            "transition-colors",
                            isActive ? "text-primary" : "text-sidebar-foreground/70",
                          )}
                        />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </motion.div>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.3 }}
          className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3 group-data-[collapsible=icon]:hidden"
        >
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
            Mainnet
          </p>
          <p className="mt-1 truncate font-mono text-[11.5px] text-sidebar-foreground/80">
            zh1eLd6r…6qRkW
          </p>
        </motion.div>
      </SidebarFooter>
    </Sidebar>
  );
}
