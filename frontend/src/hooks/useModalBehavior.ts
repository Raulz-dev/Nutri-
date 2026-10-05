import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const openDialogs: HTMLElement[] = [];
let previousBodyOverflow = "";

const focusableSelector = 'button, input, select, textarea, a[href], [tabindex]';

function focusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => element.tabIndex >= 0 && !element.matches(":disabled") && !element.closest("[inert]") && element.getClientRects().length > 0,
  );
}

export function useModalBehavior(
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  open = true,
) {
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousTabIndex = dialog.getAttribute("tabindex");
    if (!openDialogs.length) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openDialogs.push(dialog);
    dialog.tabIndex = -1;
    (dialog.querySelector<HTMLElement>("[data-modal-initial-focus]") ?? focusableElements(dialog)[0] ?? dialog).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (openDialogs.at(-1) !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const elements = focusableElements(dialog!);
      const first = elements[0];
      const last = elements.at(-1);
      const active = document.activeElement;
      if (!first) {
        event.preventDefault();
        dialog!.focus();
      } else if (!dialog!.contains(active) || active === dialog || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const index = openDialogs.indexOf(dialog);
      if (index !== -1) openDialogs.splice(index, 1);
      if (!openDialogs.length) document.body.style.overflow = previousBodyOverflow;
      if (previousTabIndex === null) dialog.removeAttribute("tabindex");
      else dialog.setAttribute("tabindex", previousTabIndex);
      if (previousFocus?.isConnected && !previousFocus.closest("[inert]")) previousFocus.focus();
    };
  }, [dialogRef, open]);
}
