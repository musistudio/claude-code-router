import type { ComponentProps } from "react";
import { AnimatePresence } from "../shared";
import { AddApiKeyDialog, EditApiKeyDialog } from "./api-keys";
import { ConfigureClaudeDesignDialog, DeleteExtensionDialog, PluginSettingsDialog } from "./extensions";
import { AddProfileDialog, ProfileOpenDialog } from "./profiles";
import { AddProviderDialog, DeleteProviderDialog, ProviderDeepLinkDialog } from "./providers";
import { AddRoutingRuleDialog, DeleteRoutingRuleDialog } from "./routing";
import { AppSettingsDialog } from "./settings";
import { InstallExtensionDialog, VirtualModelDialog } from "./virtual-models";

export function AppDialogStack({
  apiKeyAdd,
  apiKeyEdit,
  claudeDesignConfig,
  cursorProxyConfig,
  extensionDelete,
  extensionInstall,
  extensionSettings,
  profileAdd,
  profileEdit,
  profileOpen,
  providerDeepLink,
  providerDelete,
  providerUpsert,
  routingDelete,
  routingUpsert,
  settings,
  virtualModelUpsert
}: {
  apiKeyAdd?: ComponentProps<typeof AddApiKeyDialog>;
  apiKeyEdit?: ComponentProps<typeof EditApiKeyDialog>;
  claudeDesignConfig?: ComponentProps<typeof ConfigureClaudeDesignDialog>;
  cursorProxyConfig?: ComponentProps<typeof ConfigureClaudeDesignDialog>;
  extensionDelete?: ComponentProps<typeof DeleteExtensionDialog>;
  extensionInstall?: ComponentProps<typeof InstallExtensionDialog>;
  extensionSettings?: ComponentProps<typeof PluginSettingsDialog>;
  profileAdd?: ComponentProps<typeof AddProfileDialog>;
  profileEdit?: ComponentProps<typeof AddProfileDialog>;
  profileOpen?: ComponentProps<typeof ProfileOpenDialog>;
  providerDeepLink?: ComponentProps<typeof ProviderDeepLinkDialog>;
  providerDelete?: ComponentProps<typeof DeleteProviderDialog>;
  providerUpsert?: ComponentProps<typeof AddProviderDialog>;
  routingDelete?: ComponentProps<typeof DeleteRoutingRuleDialog>;
  routingUpsert?: ComponentProps<typeof AddRoutingRuleDialog>;
  settings?: ComponentProps<typeof AppSettingsDialog>;
  virtualModelUpsert?: ComponentProps<typeof VirtualModelDialog>;
}) {
  return (
    <AnimatePresence initial={false}>
      {apiKeyAdd ? <AddApiKeyDialog {...apiKeyAdd} key="api-key-add" /> : null}
      {profileAdd ? <AddProfileDialog {...profileAdd} key="profile-add" /> : null}
      {profileEdit ? <AddProfileDialog {...profileEdit} key="profile-edit" /> : null}
      {profileOpen ? <ProfileOpenDialog {...profileOpen} key="profile-open" /> : null}
      {apiKeyEdit ? <EditApiKeyDialog {...apiKeyEdit} key="api-key-edit" /> : null}
      {providerDeepLink ? <ProviderDeepLinkDialog {...providerDeepLink} key="provider-deep-link" /> : null}
      {providerUpsert ? <AddProviderDialog {...providerUpsert} key="provider-upsert" /> : null}
      {providerDelete ? <DeleteProviderDialog {...providerDelete} key="provider-delete" /> : null}
      {routingUpsert ? <AddRoutingRuleDialog {...routingUpsert} key="routing-upsert" /> : null}
      {routingDelete ? <DeleteRoutingRuleDialog {...routingDelete} key="routing-delete" /> : null}
      {virtualModelUpsert ? <VirtualModelDialog {...virtualModelUpsert} key="virtual-model-upsert" /> : null}
      {extensionInstall ? <InstallExtensionDialog {...extensionInstall} key="extension-install" /> : null}
      {extensionDelete ? <DeleteExtensionDialog {...extensionDelete} key="extension-delete" /> : null}
      {extensionSettings ? <PluginSettingsDialog {...extensionSettings} key="extension-settings" /> : null}
      {claudeDesignConfig ? <ConfigureClaudeDesignDialog {...claudeDesignConfig} key="extension-config" /> : null}
      {cursorProxyConfig ? <ConfigureClaudeDesignDialog {...cursorProxyConfig} key="cursor-proxy-config" /> : null}
      {settings ? <AppSettingsDialog {...settings} key="settings" /> : null}
    </AnimatePresence>
  );
}
