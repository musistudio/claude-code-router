export type ErrorI18nLanguage = "en" | "zh";

const languagePreferenceStorageKey = "ccr.ui.language";

type PatternTranslator = {
  pattern: RegExp;
  translate: (...matches: string[]) => string;
};

const zhExactErrorMessages: Record<string, string> = {
  "Account endpoint returned a non-object payload.": "账户端点返回的内容不是对象。",
  "Account endpoint returned malformed JSON.": "账户端点返回了格式错误的 JSON。",
  "Base URL is required.": "Base URL 不能为空。",
  "Browser controls are only available from the built-in browser window.": "浏览器控制仅可在内置浏览器窗口中使用。",
  "Bot Gateway QR start response missing qrCodeUrl.": "Bot Gateway 扫码登录启动响应缺少 qrCodeUrl。",
  "Bot Gateway QR start response missing sessionId.": "Bot Gateway 扫码登录启动响应缺少 sessionId。",
  "Bot Gateway SDK client does not expose request().": "Bot Gateway SDK client 未暴露 request()。",
  "CCR gateway did not start.": "CCR 网关未能启动。",
  "Claude App opening is available from the CCR desktop app.": "Claude App 打开功能仅可在 CCR 桌面端使用。",
  "Claude Code access token was not found.": "未找到 Claude Code access token。",
  "Codex login token was not found.": "未找到 Codex 登录 token。",
  "CONNECT target is missing.": "缺少 CONNECT 目标。",
  "Core gateway auth token is not initialized.": "核心网关认证 token 尚未初始化。",
  "Failed to start proxy mode.": "未能启动代理模式。",
  "Gateway plugin service is not configured.": "网关插件服务尚未配置。",
  "Local agent account credential was not found. Sign in again, then re-import the local login provider.": "未找到本机 Agent 账户凭据。请重新登录，然后重新导入本机登录供应商。",
  "Local agent login is not importable.": "本机 Agent 登录态不可导入。",
  "Local agent provider was not found.": "未找到本机 Agent 供应商。",
  "MCP server must be saved before tool discovery.": "需要先保存 MCP 服务器后才能发现工具。",
  "MCP server name is required.": "MCP 服务器名称不能为空。",
  "Missing vision API key. Set VISION_API_KEY.": "缺少视觉 API Key。请设置 VISION_API_KEY。",
  "Model name is too long.": "模型名称过长。",
  "Network capture MCP is disabled.": "网络捕获 MCP 已禁用。",
  "No available models": "没有可用模型",
  "No available models. Configure at least one provider with a model before starting CCR Gateway or opening an agent through CCR.": "没有可用模型。请先配置至少一个包含模型的供应商，再启动 CCR 网关或通过 CCR 打开 Agent。",
  "No Bot Gateway conversationRef is available for inbound bot response.": "没有可用于入站 Bot 响应的 Bot Gateway conversationRef。",
  "No Bot Gateway conversationRef is configured and no inbound bot event context is available.": "未配置 Bot Gateway conversationRef，且没有可用的入站 Bot 事件上下文。",
  "No endpoint candidates available.": "没有可用的端点候选项。",
  "No search provider configured. Set SEARCH_PROVIDER and its API key.": "未配置搜索供应商。请设置 SEARCH_PROVIDER 及其 API Key。",
  "No Wi-Fi/LAN targets found.": "未找到 Wi-Fi/LAN 目标。",
  "Only http and https QR login URLs can be opened.": "只能打开 http 或 https 的扫码登录 URL。",
  "Only http and https URLs can be opened.": "只能打开 http 或 https URL。",
  "Plugin module must export a function, default plugin, or plugin object.": "插件模块必须导出函数、默认插件或插件对象。",
  "Provider Base URL is invalid.": "供应商 Base URL 无效。",
  "Provider Base URL must use http or https.": "供应商 Base URL 必须使用 http 或 https。",
  "Provider link is too long.": "供应商链接过长。",
  "Provider manifest must be a JSON object.": "供应商 manifest 必须是 JSON 对象。",
  "Provider manifest URL cannot include credentials.": "供应商 manifest URL 不能包含凭据。",
  "Provider manifest URL is invalid.": "供应商 manifest URL 无效。",
  "Provider manifest URL must use https.": "供应商 manifest URL 必须使用 https。",
  "Provider payload must be a JSON object.": "供应商载荷必须是 JSON 对象。",
  "Proxy mode is not running.": "代理模式未运行。",
  "Proxy request is missing Host header.": "代理请求缺少 Host 头。",
  "Proxy service failed to start.": "代理服务未能启动。",
  "QR window sessionId is required.": "二维码窗口 sessionId 不能为空。",
  "Remote provider manifests cannot define sensitive Fetch usage headers.": "远程供应商 manifest 不能定义敏感的 Fetch 用量请求头。",
  "Request body must be a JSON object.": "请求体必须是 JSON 对象。",
  "Service did not start.": "服务未能启动。",
  "Service paused.": "服务已暂停。",
  "Service started.": "服务已启动。",
  "Proxy is stopped.": "代理已停止。",
  "Proxy restarted.": "代理已重启。",
  "Too many models in provider link.": "供应商链接中的模型数量过多。",
  "tools/call params must include a tool name.": "tools/call 参数必须包含工具名称。",
  "This app build does not expose API key persistence. Rebuild and restart the Electron app.": "当前应用构建未暴露 API Key 持久化能力。请重新构建并重启 Electron App。",
  "Unable to load @the-next-ai/bot-gateway-sdk.": "无法加载 @the-next-ai/bot-gateway-sdk。",
  "Unsupported CCR link target.": "不支持的 CCR 链接目标。",
  "Unsupported link protocol.": "不支持的链接协议。",
  "Unknown error": "未知错误",
  "ZCode profiles can only open the app; agent arguments are not supported.": "ZCode 配置档案只能打开 App，不支持 Agent 参数。",
  "ZCode provider API key was not found in ZCode config.": "未在 ZCode 配置中找到供应商 API Key。"
};

const zhPatternErrorMessages: PatternTranslator[] = [
  {
    pattern: /^(.+ App) was not found\. Install \1 or set ([A-Z0-9_]+) to its executable, then try again\.$/,
    translate: (appName, envKey) => `${appName} 未找到。请安装 ${appName}，或将 ${envKey} 设置为它的可执行文件后重试。`
  },
  {
    pattern: /^Profile launcher was not found: (.+)\. Re-save the profile and try again\.$/,
    translate: (command) => `未找到配置档案启动器：${command}。请重新保存配置档案后重试。`
  },
  {
    pattern: /^Profile launcher was not found: (.+)\. Open CCR once or re-save the profile\.$/,
    translate: (command) => `未找到配置档案启动器：${command}。请打开一次 CCR，或重新保存配置档案。`
  },
  {
    pattern: /^CCR CLI runtime was not found\. Rebuild or reinstall CCR and try again\.$/,
    translate: () => "未找到 CCR CLI 运行时。请重新构建或重新安装 CCR 后重试。"
  },
  {
    pattern: /^CCR config was not found: (.+)$/,
    translate: (file) => `未找到 CCR 配置：${file}`
  },
  {
    pattern: /^CCR config has no profiles: (.+)$/,
    translate: (file) => `CCR 配置中没有配置档案：${file}`
  },
  {
    pattern: /^Profile "(.+)" is ambiguous\. Use the profile ID instead\.$/,
    translate: (profile) => `配置档案 "${profile}" 不唯一。请改用配置档案 ID。`
  },
  {
    pattern: /^Profile "(.+)" was not found or is disabled\.$/,
    translate: (profile) => `配置档案 "${profile}" 未找到或已禁用。`
  },
  {
    pattern: /^(.+) does not support ([A-Z]+) opening\.$/,
    translate: (profile, surface) => `${profile} 不支持以 ${surface} 方式打开。`
  },
  {
    pattern: /^(.+) does not support stopping ([A-Z]+) from CCR\.$/,
    translate: (profile, surface) => `${profile} 不支持从 CCR 停止 ${surface}。`
  },
  {
    pattern: /^No CCR API key was found for profile "(.+)"\. Re-save the profile and try again\.$/,
    translate: (profile) => `未找到配置档案 "${profile}" 的 CCR API Key。请重新保存配置档案后重试。`
  },
  {
    pattern: /^(.+ App) did not open a window for (.+)\. Command: (.+) User data: (.+)$/,
    translate: (appName, profile, command, userData) => `${appName} 没有为 ${profile} 打开窗口。命令：${command} 用户数据：${userData}`
  },
  {
    pattern: /^(.+ App) is already running with (.+)\.$/,
    translate: (appName, profile) => `${appName} 已使用 ${profile} 运行。`
  },
  {
    pattern: /^Opened (.+ App) with (.+)\.$/,
    translate: (appName, profile) => `已使用 ${profile} 打开 ${appName}。`
  },
  {
    pattern: /^Opened (.+)\.$/,
    translate: (profile) => `已打开 ${profile}。`
  },
  {
    pattern: /^CCR gateway did not start for (.+)\.$/,
    translate: (appName) => `${appName} 的 CCR 网关未能启动。`
  },
  {
    pattern: /^Core gateway endpoint is already in use: (.+)$/,
    translate: (endpoint) => `核心网关端点已被占用：${endpoint}`
  },
  {
    pattern: /^Proxy restarted, but system proxy switching failed: (.+)$/,
    translate: (detail) => `代理已重启，但系统代理切换失败：${translateErrorMessage("zh", detail)}`
  },
  {
    pattern: /^Proxy mode is running at (.+), but HTTPS CONNECT is not available(.*)\.$/,
    translate: (endpoint, detail) => `代理模式正在 ${endpoint} 运行，但 HTTPS CONNECT 不可用${detail}。`
  },
  {
    pattern: /^Failed to start the dedicated proxy endpoint for the built-in browser\.$/,
    translate: () => "未能启动内置浏览器专用代理端点。"
  },
  {
    pattern: /^Account endpoint returned HTTP ([0-9]+)(?:: ([\s\S]+))?\.$/,
    translate: (status, detail = "") => `账户端点返回 HTTP ${status}${detail ? `：${detail}` : ""}。`
  },
  {
    pattern: /^Account endpoint returned non-JSON response(?: \((.+)\))?\.$/,
    translate: (contentType = "") => `账户端点返回了非 JSON 响应${contentType ? `（${contentType}）` : ""}。`
  },
  {
    pattern: /^Account connectors JSON is invalid: ([\s\S]+)$/,
    translate: (detail) => `账户连接器 JSON 无效：${detail}`
  },
  {
    pattern: /^Usage request body JSON is invalid: ([\s\S]+)$/,
    translate: (detail) => `用量请求体 JSON 无效：${detail}`
  },
  {
    pattern: /^Unsupported provider protocol: (.+)$/,
    translate: (protocol) => `不支持的供应商协议：${protocol}`
  },
  {
    pattern: /^(.+) is too long\.$/,
    translate: (label) => `${label} 过长。`
  },
  {
    pattern: /^(.+) from a remote manifest must use https\.$/,
    translate: (label) => `远程 manifest 中的 ${label} 必须使用 https。`
  },
  {
    pattern: /^(.+) cannot include credentials\.$/,
    translate: (label) => `${label} 不能包含凭据。`
  },
  {
    pattern: /^(.+) cannot target a local or internal host\.$/,
    translate: (label) => `${label} 不能指向本机或内网主机。`
  },
  {
    pattern: /^(.+) is invalid\.$/,
    translate: (label) => `${label} 无效。`
  },
  {
    pattern: /^Could not resolve host: (.+)$/,
    translate: (hostname) => `无法解析主机：${hostname}`
  },
  {
    pattern: /^Remote manifest host resolved to a private or reserved address: (.+)$/,
    translate: (address) => `远程 manifest 主机解析到了私有或保留地址：${address}`
  },
  {
    pattern: /^Invalid proxy endpoint: (.+)$/,
    translate: (endpoint) => `代理端点无效：${endpoint}`
  },
  {
    pattern: /^Failed to start MITM server for (.+)$/,
    translate: (hostname) => `未能为 ${hostname} 启动 MITM 服务。`
  },
  {
    pattern: /^MCP tools discovery timed out after ([0-9]+) ms\.$/,
    translate: (timeout) => `MCP 工具发现超时（${timeout} ms）。`
  },
  {
    pattern: /^SSE MCP discovery failed with HTTP ([0-9]+)\.$/,
    translate: (status) => `SSE MCP 发现失败，HTTP ${status}。`
  },
  {
    pattern: /^MCP discovery request failed with HTTP ([0-9]+)(?:: ([\s\S]+))?$/,
    translate: (status, detail = "") => `MCP 发现请求失败，HTTP ${status}${detail ? `：${detail}` : ""}`
  },
  {
    pattern: /^Unknown network capture tool: (.+)$/,
    translate: (tool) => `未知的网络捕获工具：${tool}`
  },
  {
    pattern: /^Network capture not found: (.+)$/,
    translate: (id) => `未找到网络捕获：${id}`
  },
  {
    pattern: /^network_capture_get requires id\.$/,
    translate: () => "network_capture_get 需要 id。"
  },
  {
    pattern: /^network_capture_set_enabled requires boolean enabled\.$/,
    translate: () => "network_capture_set_enabled 需要布尔值 enabled。"
  },
  {
    pattern: /^Unknown fusion tool: (.+)$/,
    translate: (tool) => `未知的 Fusion 工具：${tool}`
  },
  {
    pattern: /^(.+) requires prompt\.$/,
    translate: (tool) => `${tool} 需要 prompt。`
  },
  {
    pattern: /^(.+) requires imageUrl, imagePath, imageBase64, or images\.$/,
    translate: (tool) => `${tool} 需要 imageUrl、imagePath、imageBase64 或 images。`
  },
  {
    pattern: /^Missing (.+)\. Set (.+)\.$/,
    translate: (label, envKey) => `缺少 ${label}。请设置 ${envKey}。`
  },
  {
    pattern: /^(Vision|Search) request failed \(([0-9]+)\): ([\s\S]+)$/,
    translate: (kind, status, detail) => `${kind === "Vision" ? "视觉" : "搜索"}请求失败（${status}）：${detail}`
  },
  {
    pattern: /^Invalid JSON from provider: ([\s\S]+)$/,
    translate: (detail) => `供应商返回了无效 JSON：${detail}`
  },
  {
    pattern: /^Local image exceeds ([0-9]+) bytes: (.+)$/,
    translate: (bytes, file) => `本地图片超过 ${bytes} 字节：${file}`
  },
  {
    pattern: /^Claude App CDP page target was not available on port ([0-9]+)(?:: ([\s\S]+))?\.$/,
    translate: (port, detail = "") => `端口 ${port} 上没有可用的 Claude App CDP 页面目标${detail ? `：${detail}` : ""}。`
  },
  {
    pattern: /^CDP (.+) returned HTTP ([0-9]+)$/,
    translate: (endpoint, status) => `CDP ${endpoint} 返回 HTTP ${status}`
  },
  {
    pattern: /^Timed out waiting for Codex App response: (.+)$/,
    translate: (requestId) => `等待 Codex App 响应超时：${requestId}`
  },
  {
    pattern: /^No active turn for thread (.+)$/,
    translate: (threadId) => `线程 ${threadId} 没有活跃回合。`
  },
  {
    pattern: /^thread not found: (.+)$/,
    translate: (threadId) => `未找到线程：${threadId}`
  },
  {
    pattern: /^Backend (.+) failed to start\.$/,
    translate: (backend) => `后端 ${backend} 未能启动。`
  },
  {
    pattern: /^Plugin (.+) registered a gateway route without path or pathPrefix\.$/,
    translate: (pluginId) => `插件 ${pluginId} 注册了缺少 path 或 pathPrefix 的网关路由。`
  },
  {
    pattern: /^Plugin (.+) registered a proxy route without host\.$/,
    translate: (pluginId) => `插件 ${pluginId} 注册了缺少 host 的代理路由。`
  },
  {
    pattern: /^Plugin (.+) registered an invalid provider account connector\.$/,
    translate: (pluginId) => `插件 ${pluginId} 注册了无效的供应商账户连接器。`
  },
  {
    pattern: /^HTTP ([0-9]+)$/,
    translate: (status) => `HTTP ${status}`
  }
];

export function resolveErrorI18nLanguage(
  preference: string | undefined | null,
  languages: readonly string[] = []
): ErrorI18nLanguage {
  if (preference === "en" || preference === "zh") {
    return preference;
  }
  return languages.some((language) => language.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

export function browserErrorI18nLanguage(): ErrorI18nLanguage {
  const preference = readBrowserLanguagePreference();
  const languages = typeof navigator !== "undefined"
    ? (navigator.languages?.length ? navigator.languages : [navigator.language])
    : [];
  return resolveErrorI18nLanguage(preference, languages);
}

export function formatLocalizedErrorMessage(language: ErrorI18nLanguage, error: unknown): string {
  return translateErrorMessage(language, error instanceof Error ? error.message : String(error));
}

export function translateErrorMessage(language: ErrorI18nLanguage, message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return message;
  }

  const invokingRemoteMethod = trimmed.match(/^Error invoking remote method '([^']+)': Error: ([\s\S]+)$/);
  if (invokingRemoteMethod) {
    return translateErrorMessage(language, invokingRemoteMethod[2]);
  }

  const invokingRemoteMethodWithoutError = trimmed.match(/^Error invoking remote method '([^']+)': ([\s\S]+)$/);
  if (invokingRemoteMethodWithoutError) {
    return translateErrorMessage(language, invokingRemoteMethodWithoutError[2]);
  }

  const withChecked = trimmed.match(/^([\s\S]*?)\s+Checked:\s+([\s\S]+)$/);
  if (withChecked) {
    return translateErrorMessage(language, withChecked[1]);
  }

  if (language !== "zh") {
    return trimmed;
  }

  const exact = zhExactErrorMessages[trimmed];
  if (exact) {
    return exact;
  }

  for (const translator of zhPatternErrorMessages) {
    const match = trimmed.match(translator.pattern);
    if (match) {
      return translator.translate(...match.slice(1));
    }
  }

  return message;
}

function readBrowserLanguagePreference(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    return window.localStorage.getItem(languagePreferenceStorageKey) ?? undefined;
  } catch {
    return undefined;
  }
}
