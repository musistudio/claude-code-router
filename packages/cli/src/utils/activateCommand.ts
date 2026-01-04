import { createEnvVariables } from "./createEnvVariables";

/**
 * Execute the env command
 */
export const activateCommand = async () => {
  const envVars = await createEnvVariables();

  // Output in shell-friendly format for eval
  for (const [key, value] of Object.entries(envVars)) {
    if (value === "") {
      console.log(`export ${key}=""`);
    } else if (value === undefined) {
      console.log(`unset ${key}`);
    } else {
      console.log(`export ${key}="${value}"`);
    }
  }
}
