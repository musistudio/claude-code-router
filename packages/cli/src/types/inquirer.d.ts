// Type declarations for @inquirer packages
declare module '@inquirer/input' {
  import { DistinctChoice } from '@inquirer/core';
  interface PromptConfig {
    message: string;
    default?: string;
  }
  export default function prompt<T = string>(config: PromptConfig): Promise<T>;
}

declare module '@inquirer/confirm' {
  interface PromptConfig {
    message: string;
    default?: boolean;
  }
  export default function prompt(config: PromptConfig): Promise<boolean>;
}

declare module '@inquirer/select' {
  export default function prompt<T = string>(config: {
    message: string;
    choices: Array<{ name: string; value: T; description?: string }>;
    default?: T;
  }): Promise<T>;
}

declare module '@inquirer/password' {
  interface PromptConfig {
    message: string;
    mask?: string;
  }
  export default function prompt(config: PromptConfig): Promise<string>;
}

declare module '@inquirer/checkbox' {
  export default function prompt<T = string>(config: {
    message: string;
    choices: Array<{ name: string; value: T; checked?: boolean }>;
  }): Promise<T[]>;
}

declare module '@inquirer/editor' {
  interface PromptConfig {
    message: string;
    default?: string;
  }
  export default function prompt(config: PromptConfig): Promise<string>;
}
