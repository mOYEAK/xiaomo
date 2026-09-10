import {
  constantTimeEqual,
  createSha1Signature,
  decryptWechatMessage,
  type DecryptedWechatMessage,
} from "../../crypto/wechatCrypto";
import {
  parseXmlRoot,
  readOptionalXmlString,
  readRequiredXmlString,
} from "../../lib/xml";

export interface DecryptOptions {
  token: string;
  encodingAESKey: string;
  corpId: string;
  msgSignature: string;
  timestamp: string;
  nonce: string;
  encrypted: string;
}

export type DecryptedMessage = DecryptedWechatMessage;

export interface WecomTextMessage {
  toUserName: string;
  fromUserName: string;
  createTime?: string;
  msgType: string;
  content: string;
  msgId?: string;
  agentId?: string;
}

export async function verifyAndDecryptMessage(
  options: DecryptOptions,
): Promise<DecryptedMessage> {
  const expectedSignature = await createSha1Signature(
    options.token,
    options.timestamp,
    options.nonce,
    options.encrypted,
  );

  if (!constantTimeEqual(expectedSignature, options.msgSignature)) {
    throw new Error("Invalid WeCom message signature.");
  }

  return decryptWechatMessage(
    options.encrypted,
    options.encodingAESKey,
    options.corpId,
    "WX_ENCODING_AES_KEY",
    "WeCom",
  );
}

export function parseEncryptedXml(xmlText: string): string {
  const root = parseXmlRoot(xmlText, "WeCom XML");
  return readRequiredXmlString(root, "Encrypt", "WeCom XML");
}

export function parseTextMessageXml(xmlText: string): WecomTextMessage {
  const root = parseXmlRoot(xmlText, "WeCom XML");

  return {
    toUserName: readRequiredXmlString(root, "ToUserName", "WeCom XML"),
    fromUserName: readRequiredXmlString(root, "FromUserName", "WeCom XML"),
    createTime: readOptionalXmlString(root, "CreateTime"),
    msgType: readRequiredXmlString(root, "MsgType", "WeCom XML"),
    content: readOptionalXmlString(root, "Content") ?? "",
    msgId: readOptionalXmlString(root, "MsgId"),
    agentId: readOptionalXmlString(root, "AgentID"),
  };
}
