import { useEffect, useRef } from "react";
export function useModalFocus(onCancel: () => void) {
  const ref = useRef<HTMLFormElement>(null);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    const previous = previousFocus.current;
    const form = ref.current!;
    (form.querySelector("input") as HTMLElement | null)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel.current();
      }
      if (event.key === "Tab") {
        const items = Array.from(
          form.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
          ),
        );
        const first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    form.addEventListener("keydown", keydown);
    return () => {
      form.removeEventListener("keydown", keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return ref;
}
