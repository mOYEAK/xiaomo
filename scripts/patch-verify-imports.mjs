import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outputDir = fileURLToPath(new URL("../dist/verify/", import.meta.url));

for (const fileName of readdirSync(outputDir)) {
  if (!fileName.endsWith(".js")) continue;

  const filePath = join(outputDir, fileName);
  const source = readFileSync(filePath, "utf8");
  const patched = source.replace(/(from\s+["']\.\/[^"']+)(["'])/g, (match, specifier, quote) => {
    return extname(specifier) ? match : `${specifier}.js${quote}`;
  });

  if (patched !== source) {
    writeFileSync(filePath, patched);
  }
}
