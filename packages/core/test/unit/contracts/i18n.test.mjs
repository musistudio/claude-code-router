import assert from "node:assert/strict";
import test from "node:test";
import { translateErrorMessage } from "@ccr/core/contracts/i18n.ts";

const zcodeSwitchMessage = "ZCode is already running. Switched CCR to MiMo 开发. Open ZCode > Settings > Model Settings and click Refresh to apply the latest configuration.";

test("translates the dynamic ZCode profile switch message into Chinese", () => {
  assert.equal(
    translateErrorMessage("zh", zcodeSwitchMessage),
    "ZCode 已在运行。CCR 已切换到 MiMo 开发。请在 ZCode 中打开「设置 → 模型设置」，点击「刷新」以应用最新配置。"
  );
});

test("keeps the dynamic ZCode profile switch message in English", () => {
  assert.equal(translateErrorMessage("en", zcodeSwitchMessage), zcodeSwitchMessage);
});
