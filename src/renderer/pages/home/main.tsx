import React from "react";
import { createRoot } from "react-dom/client";
import { BaseUiProvider } from "@/lib/baseui-provider";
import App from "./App";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root element not found");
}

createRoot(container).render(
  <React.StrictMode>
    <BaseUiProvider>
      <App />
    </BaseUiProvider>
  </React.StrictMode>
);
