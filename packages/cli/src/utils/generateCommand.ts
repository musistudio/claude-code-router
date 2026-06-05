import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";
import { generateCcrConfig } from "../../core/src/services/config-generator";
import { CONFIG_FILE } from "@CCR/shared";

export async function handleGenerateCommand(args: string[]): Promise<void> {
  let yamlPath = "";
  let outputPath = "";

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--yaml" || args[i] === "-y") && args[i + 1]) {
      yamlPath = args[i + 1];
      i++;
    } else if ((args[i] === "--output" || args[i] === "-o") && args[i + 1]) {
      outputPath = args[i + 1];
      i++;
    } else if (!yamlPath && !args[i].startsWith("-")) {
      yamlPath = args[i];
    }
  }

  if (!yamlPath) {
    console.error("Error: YAML file path is required.");
    console.error("Usage: ccr generate --yaml <providers.yaml> [--output <config.json>]");
    console.error("   or: ccr generate <providers.yaml> [<config.json>]");
    process.exit(1);
  }

  const resolvedYamlPath = resolve(yamlPath);
  if (!existsSync(resolvedYamlPath)) {
    console.error(`Error: YAML file not found: ${resolvedYamlPath}`);
    process.exit(1);
  }

  const yamlContent = readFileSync(resolvedYamlPath, "utf-8");
  const config = generateCcrConfig(yamlContent);

  if (!outputPath) {
    outputPath = CONFIG_FILE;
  }

  const resolvedOutputPath = resolve(outputPath);

  const existingBackup = existsSync(resolvedOutputPath)
    ? ` (backed up existing)`
    : "";

  if (existsSync(resolvedOutputPath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${resolvedOutputPath}.${timestamp}.bak`;
    const existingContent = readFileSync(resolvedOutputPath, "utf-8");
    writeFileSync(backupPath, existingContent);
  }

  writeFileSync(resolvedOutputPath, JSON.stringify(config, null, 2));

  const providerCount = config.Providers?.length || 0;
  console.log(`Generated CCR config: ${resolvedOutputPath}${existingBackup}`);
  console.log(`  Providers: ${providerCount}`);
  console.log(`  Server: ${config.HOST}:${config.PORT}`);
  console.log(`  Routing rules: ${Object.keys(config.Router || {}).length}`);
  console.log(`  Model mappings: ${Object.keys(config.ModelMapping || {}).length}`);
}
