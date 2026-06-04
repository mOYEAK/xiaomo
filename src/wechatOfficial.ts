import { XMLParser } from "fast-xml-parser";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: false,
});

export interface OfficialAccountEnv {
  MP_APP_ID?: string;
  MP_TOKEN: string;
  MP_ENCODING_AES_KEY?: string;
}

export interface OfficialAccountTextMessage {
  toUserName: string;
  fromUserName: string;
  createTime?: string;
  msgType: string;
  content: string;
  msgId?: string;
}

export async function verifyPlainSignature(
  token: string,
  timestamp: string,
  nonce: string,
  signature: string,
): Promise<boolean> {
  const expected = await createSha1Signature(token, timestamp, nonce);
  return constantTimeEqual(expected, signature);
}

export async function verifyMessageSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypted: string,
  msgSignature: string,
): Promise<boolean> {
  const expected = await createSha1Signature(token, timestamp, nonce, encrypted);
  return constantTimeEqual(expected, msgSignature);
}

export async function decryptOfficialAccountMessage(
  encrypted: string,
  encodingAESKey: string,
  expectedAppId: string,
): Promise<string> {
  const aesKey = decodeEncodingAESKey(encodingAESKey);
  const iv = aesKey.slice(0, 16);
  const encryptedBytes = base64ToBytes(encrypted);
  const cryptoKey = await crypto.subtle.importKey("raw", aesKey, "AES-CBC", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, encryptedBytes);
  const plainBytes = new Uint8Array(decrypted);

  if (plainBytes.length < 20) {
    throw new Error("Invalid decrypted WeChat Official Account message.");
  }

  const messageLength = new DataView(
    plainBytes.buffer,
    plainBytes.byteOffset + 16,
    4,
  ).getUint32(0, false);
  const messageStart = 20;
  const messageEnd = messageStart + messageLength;

  if (messageEnd > plainBytes.length) {
    throw new Error("Invalid decrypted WeChat Official Account message length.");
  }

  const message = textDecoder.decode(plainBytes.slice(messageStart, messageEnd));
  const appId = textDecoder.decode(plainBytes.slice(messageEnd));

  if (expectedAppId && appId !== expectedAppId) {
    throw new Error("Invalid WeChat Official Account app id.");
  }

  return message;
}

export function parseEncryptedXml(xmlText: string): string {
  const root = parseXmlRoot(xmlText);
  return readRequiredXmlString(root, "Encrypt");
}

export function parseOfficialAccountTextMessage(xmlText: string): OfficialAccountTextMessage {
  const root = parseXmlRoot(xmlText);

  return {
    toUserName: readRequiredXmlString(root, "ToUserName"),
    fromUserName: readRequiredXmlString(root, "FromUserName"),
    createTime: readOptionalXmlString(root, "CreateTime"),
    msgType: readRequiredXmlString(root, "MsgType"),
    content: readOptionalXmlString(root, "Content") ?? "",
    msgId: readOptionalXmlString(root, "MsgId"),
  };
}

export function buildTextReplyXml(message: OfficialAccountTextMessage, content: string): string {
  return [
    "<xml>",
    `<ToUserName><![CDATA[${message.fromUserName}]]></ToUserName>`,
    `<FromUserName><![CDATA[${message.toUserName}]]></FromUserName>`,
    `<CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>`,
    "<MsgType><![CDATA[text]]></MsgType>",
    `<Content><![CDATA[${content}]]></Content>`,
    "</xml>",
  ].join("");
}

export function buildEmptyReply(): Response {
  return new Response("success", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export async function createSha1Signature(...parts: string[]): Promise<string> {
  const raw = [...parts].sort().join("");
  const digest = await crypto.subtle.digest("SHA-1", textEncoder.encode(raw));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function decodeEncodingAESKey(encodingAESKey: string): Uint8Array {
  if (encodingAESKey.length !== 43) {
    throw new Error("MP_ENCODING_AES_KEY must be 43 characters.");
  }

  const key = base64ToBytes(`${encodingAESKey}=`);

  if (key.length !== 32) {
    throw new Error("Invalid MP_ENCODING_AES_KEY.");
  }

  return key;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function parseXmlRoot(xmlText: string): Record<string, unknown> {
  const parsed = xmlParser.parse(xmlText) as { xml?: Record<string, unknown> };
  const root = parsed.xml;

  if (!root || typeof root !== "object") {
    throw new Error("Invalid WeChat Official Account XML payload.");
  }

  return root;
}

function readRequiredXmlString(root: Record<string, unknown>, key: string): string {
  const value = readOptionalXmlString(root, key);

  if (!value) {
    throw new Error(`Missing WeChat Official Account XML field: ${key}.`);
  }

  return value;
}

function readOptionalXmlString(root: Record<string, unknown>, key: string): string | undefined {
  const value = root[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  return String(value);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
}
