declare module 'shell-quote' {
  export function quote(args: string[]): string;
  export function parse(cmd: string): string[];
}

declare module 'minimist' {
  interface Options {
    string?: string[];
    boolean?: string | string[];
    alias?: Record<string, string | string[]>;
    default?: Record<string, any>;
    stopEarly?: boolean;
    '--'?: boolean;
    unknown?: (arg: string) => boolean;
  }

  interface ParsedArgs {
    _: string[];
    [key: string]: any;
  }

  function minimist(args?: string[], opts?: Options): ParsedArgs;
  export = minimist;
}

declare module '@inquirer/prompts' {
  export function select<T>(config: {
    message: string;
    choices: Array<{ name: string; value: T; description?: string }>;
    pageSize?: number;
  }): Promise<T>;
  export function input(config: {
    message: string;
    default?: string;
    validate?: (value: string) => boolean | string | Promise<boolean | string>;
  }): Promise<string>;
  export function confirm(config: {
    message: string;
    default?: boolean;
  }): Promise<boolean>;
}

declare module 'find-process' {
  export default function find(
    type: 'pid' | 'name' | 'port',
    value: string | number
  ): Promise<Array<{ pid: number; name: string; ppid?: number; cmd?: string }>>;
}

declare module 'json5' {
  export function parse(text: string): any;
  export function stringify(value: any, replacer?: any, space?: string | number): string;
}

declare namespace NodeJS {
  interface ProcessEnv {
    CI?: string;
    FORCE_COLOR?: string;
    NODE_NO_READLINE?: string;
    TERM?: string;
    ANTHROPIC_SMALL_FAST_MODEL?: string;
  }
}

interface ClaudeSettingsFlag {
  env: {
    ANTHROPIC_AUTH_TOKEN?: any;
    ANTHROPIC_API_KEY: string;
    ANTHROPIC_BASE_URL: string;
    NO_PROXY: string;
    DISABLE_TELEMETRY: string;
    DISABLE_COST_WARNINGS: string;
    API_TIMEOUT_MS: string;
    CLAUDE_CODE_USE_BEDROCK?: undefined;
    [key: string]: any;
  };
  statusLine?: {
    type: string;
    command: string;
    padding: number;
  };
}
