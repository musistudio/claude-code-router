import { useRef, useState } from "react";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, useAppText } from "../shared/index";

/** Drafts stay in their parent while the user decides whether to leave. */
export function useDraftClose(draft: unknown, onClose: () => void) {
  const t = useAppText();
  const initial = useRef(JSON.stringify(draft));
  const [confirming, setConfirming] = useState(false);
  const close = () => {
    if (JSON.stringify(draft) === initial.current) onClose();
    else setConfirming(true);
  };
  const confirmation = confirming ? (
    <Dialog className="z-[140]" onOpenChange={(open) => !open && setConfirming(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("Unsaved changes")}</DialogTitle></DialogHeader>
        <DialogBody><p className="text-[13px] leading-6">{t("Your changes have not been saved. Keep editing or discard them?")}</p></DialogBody>
        <DialogFooter>
          <Button autoFocus onClick={() => setConfirming(false)} variant="outline">{t("Keep editing")}</Button>
          <Button onClick={onClose} variant="destructive">{t("Discard changes")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;
  return { close, confirmation };
}
