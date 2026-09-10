/**
 * 微信系（公众号 / 企业微信）共用的加解密与签名原语。
 * 两者均为 AES-256-CBC + Base64 编码的 EncodingAESKey，明文结构同为
 * 16 字节随机串 + 4 字节消息长度 + 消息 + receiveId（AppId 或 CorpId）。
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface DecryptedWechatMessage {
  message: string;
  receiveId: string;
}

export async function createSha1Signature(...parts: string[]): Promise<string> {
  const raw = [...parts].sort().join("");
  const digest = await crypto.subtle.digest("SHA-1", textEncoder.encode(raw));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
}

export function decodeEncodingAESKey(
  encodingAESKey: string,
  envName: string,
): Uint8Array {
  if (encodingAESKey.length !== 43) {
    throw new Error(`${envName} must be 43 characters.`);
  }

  const key = base64ToBytes(`${encodingAESKey}=`);

  if (key.length !== 32) {
    throw new Error(`Invalid ${envName}.`);
  }

  return key;
}

export async function decryptWechatMessage(
  encrypted: string,
  encodingAESKey: string,
  expectedReceiveId: string,
  envName: string,
  label: string,
): Promise<DecryptedWechatMessage> {
  const aesKey = decodeEncodingAESKey(encodingAESKey, envName);
  const iv = aesKey.slice(0, 16);
  const encryptedBytes = base64ToBytes(encrypted);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    aesKey,
    "AES-CBC",
    false,
    ["decrypt"],
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv },
    cryptoKey,
    encryptedBytes,
  );
  const plainBytes = new Uint8Array(decrypted);

  if (plainBytes.length < 20) {
    throw new Error(`Invalid decrypted ${label} message.`);
  }

  const messageLength = new DataView(
    plainBytes.buffer,
    plainBytes.byteOffset + 16,
    4,
  ).getUint32(0, false);
  const messageStart = 20;
  const messageEnd = messageStart + messageLength;

  if (messageEnd > plainBytes.length) {
    throw new Error(`Invalid decrypted ${label} message length.`);
  }

  const message = textDecoder.decode(
    plainBytes.slice(messageStart, messageEnd),
  );
  const receiveId = textDecoder.decode(plainBytes.slice(messageEnd));

  if (expectedReceiveId && receiveId !== expectedReceiveId) {
    throw new Error(`Invalid ${label} receive id.`);
  }

  return { message, receiveId };
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
