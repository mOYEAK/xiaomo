import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outputDir = fileURLToPath(new URL("../dist/verify/", import.meta.url));

function patchDirectory(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const filePath = join(dir, entry.name);

    if (entry.isDirectory()) {
      patchDirectory(filePath);
      continue;
    }

    if (!entry.name.endsWith(".js")) continue;

    const source = readFileSync(filePath, "utf8");
    const patched = source.replace(
      /(from\s+["']\.{1,2}\/[^"']+)(["'])/g,
      (match, specifier, quote) =>
        extname(specifier) ? match : `${specifier}.js${quote}`,
    );

    if (patched !== source) {
      writeFileSync(filePath, patched);
    }
  }
}

patchDirectory(outputDir);
