import * as React from "react"

const MOBILE_BREAKPOINT = 768

function getIsMobile() {
  if (typeof window === "undefined") return false
  return window.innerWidth < MOBILE_BREAKPOINT
}

export function useIsMobile() {
  const isMobile = React.useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
      mql.addEventListener("change", cb)
      return () => mql.removeEventListener("change", cb)
    },
    getIsMobile,
    () => false,
  )

  return isMobile
}
