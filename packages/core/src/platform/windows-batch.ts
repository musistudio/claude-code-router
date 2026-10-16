export function windowsBatchSetLine(key: string, value: string, indent = ""): string {
  return `${indent}set ${key}=${windowsBatchEscapeValue(value)}`;
}

export function windowsBatchEscapeValue(value: string): string {
  return value
    .replace(/\r?\n/g, " ")
    .replace(/\^/g, "^^")
    .replace(/%/g, "%%")
    .replace(/"/g, '^"')
    .replace(/[&|<>()]/g, "^$&");
}
