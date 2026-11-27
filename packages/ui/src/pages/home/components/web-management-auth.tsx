import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { detectSystemLanguage, readLanguagePreference } from "../shared/common";
import { appCopy, translateText } from "../shared/i18n";

export function WebManagementAuth({ children }: { children: ReactNode }) {
  // Only the HTTP bridge provides this method; Electron and browser previews bypass the gate.
  const authenticate = window.ccr?.authenticateWeb;
  const [state, setState] = useState<"checking" | "required" | "submitting" | "authenticated">(
    authenticate ? "checking" : "authenticated"
  );
  const [token, setToken] = useState("");
  const [error, setError] = useState<"unauthorized" | "unavailable">();
  const preference = readLanguagePreference();
  const language = preference === "system" ? detectSystemLanguage() : preference;
  const t = (text: string) => translateText(appCopy[language], text);

  function failed(reason: unknown) {
    setError(reason instanceof Error && "status" in reason && reason.status === 401 ? "unauthorized" : "unavailable");
    setState("required");
  }

  useEffect(() => {
    if (!authenticate) return;
    let active = true;
    const requireAuthentication = () => {
      setError("unauthorized");
      setState("required");
    };
    window.addEventListener("ccr:web-auth-required", requireAuthentication);
    void authenticate().then(() => {
      if (active) setState("authenticated");
    }).catch((reason: unknown) => {
      if (active) failed(reason);
    });
    return () => {
      active = false;
      window.removeEventListener("ccr:web-auth-required", requireAuthentication);
    };
  }, [authenticate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!authenticate || state === "submitting") return;
    setState("submitting");
    setError(undefined);
    try {
      await authenticate(token.trim() || undefined);
      setToken("");
      setState("authenticated");
    } catch (reason) {
      failed(reason);
    }
  }

  if (state === "authenticated") return <>{children}</>;
  return (
    <div className="flex h-full items-center justify-center bg-background text-foreground">
      {state === "checking" ? (
        <p role="status" className="text-sm text-muted-foreground">{t("Checking authentication…")}</p>
      ) : (
        <Dialog>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("Management authentication")}</DialogTitle>
            </DialogHeader>
            <form className="flex min-h-0 flex-col" onSubmit={(event) => void submit(event)}>
              <DialogBody className="space-y-4">
                <p className="text-sm text-muted-foreground">{t("Enter your management token to access Claude Code Router.")}</p>
                <label className="block space-y-2">
                  <span className="text-sm">{t("Management token")}</span>
                  <Input
                    autoComplete="current-password"
                    autoFocus
                    disabled={state === "submitting"}
                    onChange={(event) => setToken(event.target.value)}
                    required={error !== "unavailable"}
                    type="password"
                    value={token}
                  />
                </label>
                {error && <p role="alert" className="text-sm text-destructive">{t(error === "unauthorized"
                  ? "Management token is missing or invalid."
                  : "Unable to reach the management service. Try again.")}</p>}
              </DialogBody>
              <DialogFooter>
                <Button disabled={state === "submitting" || (!token.trim() && error !== "unavailable")} type="submit">
                  {t(state === "submitting" ? "Verifying…" : error === "unavailable" && !token.trim() ? "Retry" : "Continue")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
