import { defaultProviderAccountConfig, type ProviderPreset, type ProviderPresetEndpointVariable } from "@ccr/core/providers/presets/types";

// Alibaba Bailian serves model APIs from two domain types: the public DashScope
// domain, and workspace-dedicated {WorkspaceId}.{Region}.maas.aliyuncs.com
// domains (the default in the current Bailian console). Both expose an
// OpenAI-compatible endpoint and an Anthropic-compatible endpoint.
const bailianWorkspaceEndpointVariables: ProviderPresetEndpointVariable[] = [
  { kind: "text", label: "Workspace ID", name: "WorkspaceId" },
  {
    kind: "select",
    label: "Service region",
    name: "Region",
    options: [
      { label: "North China 2 (Beijing)", value: "cn-beijing" },
      { label: "Singapore", value: "ap-southeast-1" },
      { label: "Japan (Tokyo)", value: "ap-northeast-1" },
      { label: "Germany (Frankfurt)", value: "eu-central-1" },
      { label: "US (Virginia)", value: "us-east-1" },
      { label: "Hong Kong (China)", value: "cn-hongkong" }
    ]
  }
];

export const bailianProviderPreset: ProviderPreset = {
  account: defaultProviderAccountConfig,
  aliases: ["qwen", "dashscope", "bailian", "alibaba"],
  endpoints: [
    {
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      protocols: ["openai_chat_completions"]
    },
    {
      baseUrl: "https://dashscope.aliyuncs.com/apps/anthropic",
      protocols: ["anthropic_messages"]
    },
    {
      baseUrl: "https://{WorkspaceId}.{Region}.maas.aliyuncs.com/compatible-mode/v1",
      protocols: ["openai_chat_completions"],
      variables: bailianWorkspaceEndpointVariables
    },
    {
      baseUrl: "https://{WorkspaceId}.{Region}.maas.aliyuncs.com/apps/anthropic",
      protocols: ["anthropic_messages"],
      variables: bailianWorkspaceEndpointVariables
    }
  ],
  id: "bailian",
  name: "Alibaba Bailian",
  websiteUrl: "https://bailian.console.aliyun.com/"
};
