import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from "fs";

/**
 * esbuild plugin to resolve @/ path aliases
 * Converts @/ imports to relative paths based on baseUrl
 */
export const pathAliasPlugin = (options: {
  alias: Record<string, string>;
  baseUrl: string;
}): esbuild.Plugin => {
  return {
    name: "path-alias",
    setup(build) {
      const { alias, baseUrl } = options;

      // Resolve each alias pattern
      for (const [pattern, target] of Object.entries(alias)) {
        // Remove trailing /* from pattern if present
        const patternKey = pattern.replace(/\/\*$/, "");
        // Escape special regex characters in pattern
        const escapedPattern = patternKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        build.onResolve(
          { filter: new RegExp(`^${escapedPattern}/`) },
          (args) => {
            // Extract the path after @/
            const importPath = args.path.replace(new RegExp(`^${escapedPattern}/`), "");
            // Remove file extension if present in import
            const importPathWithoutExt = importPath.replace(/\.[^.]+$/, "");
            const resolvedPath = path.resolve(baseUrl, target.replace(/\*$/, ""), importPathWithoutExt);

            // Try to find the file with different extensions
            const extensions = [".ts", ".tsx", ".js", ".jsx", ".json"];
            for (const ext of extensions) {
              const fileWithExt = resolvedPath + ext;
              if (fs.existsSync(fileWithExt) && fs.statSync(fileWithExt).isFile()) {
                return { path: fileWithExt };
              }
            }

            // Check if it's a directory with index file
            if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
              for (const ext of extensions) {
                const indexPath = path.join(resolvedPath, `index${ext}`);
                if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
                  return { path: indexPath };
                }
              }
            }

            // Return resolved path even if file doesn't exist (esbuild will handle error)
            return { path: resolvedPath + ".ts" };
          }
        );
      }
    },
  };
};
