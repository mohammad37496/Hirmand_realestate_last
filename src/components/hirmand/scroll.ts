import type { MouseEvent } from "react";

export function scrollToId(event: MouseEvent<HTMLAnchorElement>, id: string, onDone?: () => void) {
  event.preventDefault();
  const target = document.getElementById(id);
  const disclosure = target?.closest("details.home-secondary") as HTMLDetailsElement | null;
  if (disclosure) disclosure.open = true;
  window.requestAnimationFrame(() => {
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  history.replaceState(null, "", "#" + id);
  onDone?.();
}
