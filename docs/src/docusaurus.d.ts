/// <reference types="@docusaurus/module-type-aliases" />
/// <reference types="@docusaurus/types" />

// Additional theme component type declarations
declare module '@theme/Heading' {
  import type {ReactNode, CSSProperties} from 'react';

  export type Props = {
    readonly as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    readonly className?: string;
    readonly style?: CSSProperties;
    readonly children?: ReactNode;
  };

  export default function Heading(props: Props): ReactNode;
}
