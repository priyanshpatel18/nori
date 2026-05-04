"use client";

import {
  ClockIcon,
  DollarSendIcon,
  Exchange01Icon,
  FileSecurityIcon,
  UserGroupIcon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { NoriWordmark } from "@/components/logos";
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
import { cloakConfig } from "@/lib/cloak/config";
import { solanaConfig, type SolanaCluster } from "@/lib/solana/config";
import { solscanAddressUrl } from "@/lib/solana/explorer";
import { cn } from "@/lib/utils";

const CLUSTER_LABEL: Record<SolanaCluster, string> = {
  "mainnet-beta": "Mainnet",
  devnet: "Devnet",
  testnet: "Testnet",
  localnet: "Localnet",
};

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
    href: "/swap",
    label: "Swap",
    description: "Trade tokens privately inside the pool.",
    icon: Exchange01Icon,
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
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
          >
            <NoriWordmark
              markClassName="size-6"
              textClassName="text-[20px] group-data-[collapsible=icon]:hidden"
            />
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
                          "relative z-10 h-11 gap-3 bg-transparent! data-active:bg-transparent!",
                          isActive && "text-sidebar-accent-foreground",
                        )}
                        render={<Link href={item.href} />}
                      >
                        <HugeiconsIcon
                          icon={item.icon}
                          size={20}
                          strokeWidth={1.8}
                          className={cn(
                            "size-5! transition-colors",
                            isActive ? "text-primary" : "text-sidebar-foreground/70",
                          )}
                        />
                        <span className="text-[15px]">{item.label}</span>
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
        <motion.a
          href={solscanAddressUrl(cloakConfig.programId.toBase58())}
          target="_blank"
          rel="noreferrer"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.3 }}
          className="block rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3 transition-colors hover:border-primary/30 hover:bg-sidebar-accent/70 group-data-[collapsible=icon]:hidden"
          aria-label={`Open shield-pool program on Solscan (${CLUSTER_LABEL[solanaConfig.cluster]})`}
        >
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
            {CLUSTER_LABEL[solanaConfig.cluster]}
          </p>
          <p className="mt-1 truncate font-mono text-[11.5px] text-sidebar-foreground/80">
            {shortProgramId(cloakConfig.programId.toBase58())}
          </p>
        </motion.a>
      </SidebarFooter>
    </Sidebar>
  );
}

function shortProgramId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-5)}`;
}
