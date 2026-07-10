import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export function useSpotlightVisibility(inputRef: RefObject<HTMLInputElement>) {
  const showFrameRef = useRef<number | null>(null);
  const [shown, setShown] = useState(false);

  const focusInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [inputRef]);

  useEffect(() => {
    focusInput();
    return window.agentConsole?.ipc.on("agent-console:spotlight:focus", focusInput);
  }, [focusInput]);

  useEffect(() => {
    const showSpotlight = () => {
      setShown(false);
      if (showFrameRef.current !== null) {
        window.cancelAnimationFrame(showFrameRef.current);
      }

      showFrameRef.current = window.requestAnimationFrame(() => {
        showFrameRef.current = window.requestAnimationFrame(() => {
          showFrameRef.current = null;
          setShown(true);
        });
      });
    };

    const hideSpotlight = () => {
      if (showFrameRef.current !== null) {
        window.cancelAnimationFrame(showFrameRef.current);
        showFrameRef.current = null;
      }
      setShown(false);
    };

    const removePrepareShowListener = window.agentConsole?.ipc.on("agent-console:spotlight:will-show", hideSpotlight);
    const removeShowListener = window.agentConsole?.ipc.on("agent-console:spotlight:did-show", showSpotlight);
    const removeHideListener = window.agentConsole?.ipc.on("agent-console:spotlight:will-hide", hideSpotlight);

    return () => {
      removePrepareShowListener?.();
      removeShowListener?.();
      removeHideListener?.();
      if (showFrameRef.current !== null) {
        window.cancelAnimationFrame(showFrameRef.current);
      }
    };
  }, []);

  return shown;
}
