import type { ComponentProps, ReactElement } from "react";
import { AnimatePresence, DialogStackLayer } from "../shared/index";
import { AddApiKeyDialog, ApiKeyCreatedDialog, EditApiKeyDialog } from "./api-keys";
import { ConfigureClaudeDesignDialog, DeleteExtensionDialog, PluginSettingsDialog } from "./extensions";
import { AddProfileDialog, DeleteProfileDialog, ProfileOpenDialog } from "./profiles";
import { AddProviderDialog, DeleteProviderDialog, ProviderDeepLinkDialog } from "./providers";
import { AddRoutingRuleDialog, DeleteRoutingRuleDialog } from "./routing";
import { AppSettingsDialog } from "./settings";
import { UpdateDialog } from "./update";
import { InstallExtensionDialog, VirtualModelDialog } from "./virtual-models";

export function AppDialogStack({
  apiKeyAdd,
  apiKeyCreated,
  apiKeyEdit,
  claudeDesignConfig,
  cursorProxyConfig,
  extensionDelete,
  extensionInstall,
  extensionSettings,
  profileAdd,
  profileDelete,
  profileEdit,
  profileOpen,
  providerDeepLink,
  providerDelete,
  providerUpsert,
  routingDelete,
  routingUpsert,
  settings,
  update,
  virtualModelUpsert
}: {
  apiKeyAdd?: ComponentProps<typeof AddApiKeyDialog>;
  apiKeyCreated?: ComponentProps<typeof ApiKeyCreatedDialog>;
  apiKeyEdit?: ComponentProps<typeof EditApiKeyDialog>;
  claudeDesignConfig?: ComponentProps<typeof ConfigureClaudeDesignDialog>;
  cursorProxyConfig?: ComponentProps<typeof ConfigureClaudeDesignDialog>;
  extensionDelete?: ComponentProps<typeof DeleteExtensionDialog>;
  extensionInstall?: ComponentProps<typeof InstallExtensionDialog>;
  extensionSettings?: ComponentProps<typeof PluginSettingsDialog>;
  profileAdd?: ComponentProps<typeof AddProfileDialog>;
  profileDelete?: ComponentProps<typeof DeleteProfileDialog>;
  profileEdit?: ComponentProps<typeof AddProfileDialog>;
  profileOpen?: ComponentProps<typeof ProfileOpenDialog>;
  providerDeepLink?: ComponentProps<typeof ProviderDeepLinkDialog>;
  providerDelete?: ComponentProps<typeof DeleteProviderDialog>;
  providerUpsert?: ComponentProps<typeof AddProviderDialog>;
  routingDelete?: ComponentProps<typeof DeleteRoutingRuleDialog>;
  routingUpsert?: ComponentProps<typeof AddRoutingRuleDialog>;
  settings?: ComponentProps<typeof AppSettingsDialog>;
  update?: ComponentProps<typeof UpdateDialog>;
  virtualModelUpsert?: ComponentProps<typeof VirtualModelDialog>;
}) {
  const dialogs = [
    apiKeyAdd ? { key: "api-key-add", node: <AddApiKeyDialog {...apiKeyAdd} /> } : null,
    apiKeyCreated ? { key: "api-key-created", node: <ApiKeyCreatedDialog {...apiKeyCreated} /> } : null,
    profileAdd ? { key: "profile-add", node: <AddProfileDialog {...profileAdd} /> } : null,
    profileEdit ? { key: "profile-edit", node: <AddProfileDialog {...profileEdit} /> } : null,
    profileOpen ? { key: "profile-open", node: <ProfileOpenDialog {...profileOpen} /> } : null,
    profileDelete ? { key: "profile-delete", node: <DeleteProfileDialog {...profileDelete} /> } : null,
    apiKeyEdit ? { key: "api-key-edit", node: <EditApiKeyDialog {...apiKeyEdit} /> } : null,
    providerDeepLink ? { key: "provider-deep-link", node: <ProviderDeepLinkDialog {...providerDeepLink} /> } : null,
    providerUpsert ? { key: "provider-upsert", node: <AddProviderDialog {...providerUpsert} /> } : null,
    providerDelete ? { key: "provider-delete", node: <DeleteProviderDialog {...providerDelete} /> } : null,
    routingUpsert ? { key: "routing-upsert", node: <AddRoutingRuleDialog {...routingUpsert} /> } : null,
    routingDelete ? { key: "routing-delete", node: <DeleteRoutingRuleDialog {...routingDelete} /> } : null,
    virtualModelUpsert ? { key: "virtual-model-upsert", node: <VirtualModelDialog {...virtualModelUpsert} /> } : null,
    extensionInstall ? { key: "extension-install", node: <InstallExtensionDialog {...extensionInstall} /> } : null,
    extensionDelete ? { key: "extension-delete", node: <DeleteExtensionDialog {...extensionDelete} /> } : null,
    extensionSettings ? { key: "extension-settings", node: <PluginSettingsDialog {...extensionSettings} /> } : null,
    claudeDesignConfig ? { key: "extension-config", node: <ConfigureClaudeDesignDialog {...claudeDesignConfig} /> } : null,
    cursorProxyConfig ? { key: "cursor-proxy-config", node: <ConfigureClaudeDesignDialog {...cursorProxyConfig} /> } : null,
    settings ? { key: "settings", node: <AppSettingsDialog {...settings} /> } : null,
    update ? { key: "update", node: <UpdateDialog {...update} /> } : null
  ].filter((dialog): dialog is { key: string; node: ReactElement } => Boolean(dialog));

  return (
    <AnimatePresence initial={false}>
      {dialogs.map((dialog, index) => (
        <DialogStackLayer depth={dialogs.length - index - 1} key={dialog.key}>
          {dialog.node}
        </DialogStackLayer>
      ))}
    </AnimatePresence>
  );
}
