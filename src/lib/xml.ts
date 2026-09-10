import { XMLParser } from "fast-xml-parser";

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: false,
});

export function parseXmlRoot(
  xmlText: string,
  label = "XML",
): Record<string, unknown> {
  const parsed = xmlParser.parse(xmlText) as { xml?: Record<string, unknown> };
  const root = parsed.xml;

  if (!root || typeof root !== "object") {
    throw new Error(`Invalid ${label} payload.`);
  }

  return root;
}

export function readRequiredXmlString(
  root: Record<string, unknown>,
  key: string,
  label = "XML",
): string {
  const value = readOptionalXmlString(root, key);

  if (!value) {
    throw new Error(`Missing ${label} field: ${key}.`);
  }

  return value;
}

export function readOptionalXmlString(
  root: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = root[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  return String(value);
}
