import { type ReactNode } from "react";
import { BaseProvider, LightTheme } from "baseui";
import { Client as Styletron } from "styletron-engine-atomic";
import { Provider as StyletronProvider } from "styletron-react";

const engine = new Styletron();

export function BaseUiProvider({ children }: { children: ReactNode }) {
  return (
    <StyletronProvider value={engine}>
      <BaseProvider
        overrides={{
          AppContainer: {
            style: {
              height: "100%",
              minHeight: "0",
              minWidth: "0",
              width: "100%"
            }
          }
        }}
        theme={LightTheme}
      >
        {children}
      </BaseProvider>
    </StyletronProvider>
  );
}
