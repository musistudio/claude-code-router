import type * as Monaco from "monaco-editor/esm/vs/editor/editor.api.js";

type MonacoModule = typeof Monaco;

type MonacoLanguageDefaults = {
  setCompilerOptions: (options: Record<string, unknown>) => void;
  setDiagnosticsOptions: (options: Record<string, unknown>) => void;
  setEagerModelSync: (value: boolean) => void;
  setModeConfiguration?: (configuration: Record<string, boolean>) => void;
};

type ConfigureMonacoLanguageServicesOptions = {
  eagerModelSync?: boolean;
};

let languageContributionsPromise: Promise<void> | null = null;

export async function loadMonacoLanguageContributions() {
  languageContributionsPromise ??= Promise.all([
    // @ts-expect-error Monaco's shared basic-language registrar has no declaration file.
    import("monaco-editor/esm/vs/basic-languages/_.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/css/css.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/dockerfile/dockerfile.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/go/go.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/html/html.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/java/java.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/less/less.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/mdx/mdx.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/php/php.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/powershell/powershell.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/python/python.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/rust/rust.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/scss/scss.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/shell/shell.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/swift/swift.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/xml/xml.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js"),
    import("monaco-editor/esm/vs/language/css/monaco.contribution.js"),
    import("monaco-editor/esm/vs/language/html/monaco.contribution.js"),
    import("monaco-editor/esm/vs/language/json/monaco.contribution.js"),
    import("monaco-editor/esm/vs/language/typescript/monaco.contribution.js")
  ]).then(() => undefined);

  await languageContributionsPromise;
}

export function configureMonacoLanguageServices(monacoModule: MonacoModule, options: ConfigureMonacoLanguageServicesOptions = {}) {
  const languages = monacoModule.languages as unknown as {
    json?: {
      jsonDefaults: {
        setDiagnosticsOptions: (options: Record<string, unknown>) => void;
      };
    };
    typescript?: {
      javascriptDefaults: MonacoLanguageDefaults;
      typescriptDefaults: MonacoLanguageDefaults;
      JsxEmit: Record<string, unknown>;
      ModuleKind: Record<string, unknown>;
      ModuleResolutionKind: Record<string, unknown>;
      ScriptTarget: Record<string, unknown>;
    };
  };

  const typescript = languages.typescript;
  if (typescript) {
    const compilerOptions = {
      allowJs: true,
      allowNonTsExtensions: true,
      checkJs: false,
      jsx: typescript.JsxEmit.ReactJSX,
      module: typescript.ModuleKind.ESNext,
      moduleResolution: typescript.ModuleResolutionKind.NodeJs,
      noEmit: true,
      target: typescript.ScriptTarget.ES2022
    };
    const modeConfiguration = {
      codeActions: true,
      completionItems: true,
      definitions: true,
      diagnostics: true,
      documentHighlights: true,
      documentRangeFormattingEdits: true,
      documentSymbols: true,
      hovers: true,
      inlayHints: true,
      references: true,
      rename: true,
      signatureHelp: true
    };
    const eagerModelSync = options.eagerModelSync ?? true;

    typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
    typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
    typescript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
    typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
    typescript.typescriptDefaults.setEagerModelSync(eagerModelSync);
    typescript.javascriptDefaults.setEagerModelSync(eagerModelSync);
    typescript.typescriptDefaults.setModeConfiguration?.(modeConfiguration);
    typescript.javascriptDefaults.setModeConfiguration?.(modeConfiguration);
  }

  languages.json?.jsonDefaults.setDiagnosticsOptions({
    allowComments: true,
    schemaValidation: "warning",
    trailingCommas: "ignore",
    validate: true
  });
}

export function getMonacoLanguage(filePath: string): string {
  const name = getPathBaseName(filePath).toLowerCase();
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";

  if (name === "dockerfile" || name.endsWith(".dockerfile")) return "dockerfile";
  if (name === "makefile") return "shell";

  switch (extension) {
    case ".bash":
    case ".fish":
    case ".sh":
    case ".zsh":
      return "shell";
    case ".c":
    case ".cc":
    case ".cpp":
    case ".cxx":
    case ".h":
    case ".hh":
    case ".hpp":
      return "cpp";
    case ".cs":
      return "csharp";
    case ".css":
      return "css";
    case ".go":
      return "go";
    case ".htm":
    case ".html":
      return "html";
    case ".java":
      return "java";
    case ".js":
    case ".cjs":
    case ".jsx":
    case ".mjs":
      return "javascript";
    case ".json":
    case ".jsonc":
      return "json";
    case ".kt":
    case ".kts":
      return "kotlin";
    case ".less":
      return "less";
    case ".md":
    case ".mdx":
      return "markdown";
    case ".php":
      return "php";
    case ".ps1":
      return "powershell";
    case ".py":
      return "python";
    case ".rb":
      return "ruby";
    case ".rs":
      return "rust";
    case ".scss":
      return "scss";
    case ".sql":
      return "sql";
    case ".swift":
      return "swift";
    case ".toml":
      return "ini";
    case ".ts":
    case ".tsx":
      return "typescript";
    case ".vue":
      return "html";
    case ".xml":
      return "xml";
    case ".yaml":
    case ".yml":
      return "yaml";
    default:
      return "plaintext";
  }
}

export function createMonacoFileUri(monacoModule: MonacoModule, filePath: string) {
  return monacoModule.Uri.from({
    path: normalizeUriPath(filePath),
    scheme: "file"
  });
}

export function createMonacoDiffUri(monacoModule: MonacoModule, namespace: string, side: "modified" | "original", filePath: string) {
  return monacoModule.Uri.from({
    authority: namespace,
    path: `/${side}${normalizeUriPath(filePath)}`,
    query: `side=${side}`,
    scheme: "inmemory"
  });
}

function getPathBaseName(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized.split("/").filter(Boolean).at(-1) ?? value;
}

function normalizeUriPath(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}
