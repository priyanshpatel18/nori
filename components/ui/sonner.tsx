"use client";

import { Toaster as SonnerToaster } from "sonner";

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      offset={20}
      gap={8}
      closeButton
      visibleToasts={4}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--popover)",
          "--success-text": "var(--popover-foreground)",
          "--success-border":
            "color-mix(in oklch, var(--primary) 35%, var(--border))",
          "--error-bg": "var(--popover)",
          "--error-text": "var(--popover-foreground)",
          "--error-border":
            "color-mix(in oklch, var(--destructive) 45%, var(--border))",
          "--info-bg": "var(--popover)",
          "--info-text": "var(--popover-foreground)",
          "--info-border": "var(--border)",
          "--border-radius": "var(--radius-lg)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "group/toast font-sans !rounded-xl !shadow-[0_18px_50px_-18px_color-mix(in_oklch,black_70%,transparent)] !backdrop-blur-md",
          title: "text-[13.5px] font-medium tracking-[-0.005em]",
          description: "!text-[12.5px] !text-muted-foreground",
          actionButton:
            "!bg-primary !text-primary-foreground !rounded-md !text-[12px] !font-semibold",
          cancelButton:
            "!bg-muted !text-muted-foreground !rounded-md !text-[12px]",
          closeButton:
            "!bg-muted !text-muted-foreground !border-border hover:!bg-secondary",
          success: "[&_[data-icon]]:!text-primary",
          error: "[&_[data-icon]]:!text-destructive",
          loading: "[&_[data-icon]]:!text-primary",
        },
      }}
      {...props}
    />
  );
}
