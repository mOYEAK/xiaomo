import { XMLParser } from "fast-xml-parser";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: false,
});

export interface DecryptOptions {
  token: string;
  encodingAESKey: string;
  corpId: string;
  msgSignature: string;
  timestamp: string;
  nonce: string;
  encrypted: string;
}

export interface DecryptedMessage {
  message: string;
  receiveId: string;
}

export interface WecomTextMessage {
  toUserName: string;
  fromUserName: string;
  createTime?: string;
  msgType: string;
  content: string;
  msgId?: string;
  agentId?: string;
}

export async function verifyAndDecryptMessage(options: DecryptOptions): Promise<DecryptedMessage> {
  const expectedSignature = await createMessageSignature(
    options.token,
    options.timestamp,
    options.nonce,
    options.encrypted,
  );

  if (!constantTimeEqual(expectedSignature, options.msgSignature)) {
    throw new Error("Invalid WeCom message signature.");
  }

  return decryptWecomMessage(options.encrypted, options.encodingAESKey, options.corpId);
}

export function parseEncryptedXml(xmlText: string): string {
  const root = parseXmlRoot(xmlText);
  return readRequiredXmlString(root, "Encrypt");
}

export function parseTextMessageXml(xmlText: string): WecomTextMessage {
  const root = parseXmlRoot(xmlText);

  return {
    toUserName: readRequiredXmlString(root, "ToUserName"),
    fromUserName: readRequiredXmlString(root, "FromUserName"),
    createTime: readOptionalXmlString(root, "CreateTime"),
    msgType: readRequiredXmlString(root, "MsgType"),
    content: readOptionalXmlString(root, "Content") ?? "",
    msgId: readOptionalXmlString(root, "MsgId"),
    agentId: readOptionalXmlString(root, "AgentID"),
  };
}

export async function createMessageSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypted: string,
): Promise<string> {
  const raw = [token, timestamp, nonce, encrypted].sort().join("");
  const digest = await crypto.subtle.digest("SHA-1", textEncoder.encode(raw));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function decryptWecomMessage(
  encrypted: string,
  encodingAESKey: string,
  expectedCorpId: string,
): Promise<DecryptedMessage> {
  const aesKey = decodeEncodingAESKey(encodingAESKey);
  const iv = aesKey.slice(0, 16);
  const encryptedBytes = base64ToBytes(encrypted);
  const cryptoKey = await crypto.subtle.importKey("raw", aesKey, "AES-CBC", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, encryptedBytes);
  const plainBytes = new Uint8Array(decrypted);

  if (plainBytes.length < 20) {
    throw new Error("Invalid decrypted WeCom message.");
  }

  const messageLength = new DataView(
    plainBytes.buffer,
    plainBytes.byteOffset + 16,
    4,
  ).getUint32(0, false);
  const messageStart = 20;
  const messageEnd = messageStart + messageLength;

  if (messageEnd > plainBytes.length) {
    throw new Error("Invalid decrypted WeCom message length.");
  }

  const message = textDecoder.decode(plainBytes.slice(messageStart, messageEnd));
  const receiveId = textDecoder.decode(plainBytes.slice(messageEnd));

  if (expectedCorpId && receiveId !== expectedCorpId) {
    throw new Error("Invalid WeCom receive id.");
  }

  return { message, receiveId };
}

function decodeEncodingAESKey(encodingAESKey: string): Uint8Array {
  if (encodingAESKey.length !== 43) {
    throw new Error("WX_ENCODING_AES_KEY must be 43 characters.");
  }

  const key = base64ToBytes(`${encodingAESKey}=`);

  if (key.length !== 32) {
    throw new Error("Invalid WX_ENCODING_AES_KEY.");
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
    throw new Error("Invalid WeCom XML payload.");
  }

  return root;
}

function readRequiredXmlString(root: Record<string, unknown>, key: string): string {
  const value = readOptionalXmlString(root, key);

  if (!value) {
    throw new Error(`Missing WeCom XML field: ${key}.`);
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
