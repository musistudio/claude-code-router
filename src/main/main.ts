import { app } from "electron";
import { setRuntimeAppPaths } from "./app-paths";

setRuntimeAppPaths({
  appData: app.getPath("appData"),
  home: app.getPath("home"),
  userData: app.getPath("userData")
});

void import("./main-app.js").catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  app.quit();
});
