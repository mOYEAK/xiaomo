import {
  constantTimeEqual,
  createSha1Signature,
  decryptWechatMessage,
} from "../../crypto/wechatCrypto";
import {
  parseXmlRoot,
  readOptionalXmlString,
  readRequiredXmlString,
} from "../../lib/xml";

export interface OfficialAccountEnv {
  MP_APP_ID?: string;
  MP_APP_SECRET?: string;
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
  const expected = await createSha1Signature(
    token,
    timestamp,
    nonce,
    encrypted,
  );
  return constantTimeEqual(expected, msgSignature);
}

export async function decryptOfficialAccountMessage(
  encrypted: string,
  encodingAESKey: string,
  expectedAppId: string,
): Promise<string> {
  const decrypted = await decryptWechatMessage(
    encrypted,
    encodingAESKey,
    expectedAppId,
    "MP_ENCODING_AES_KEY",
    "WeChat Official Account",
  );
  return decrypted.message;
}

export function parseEncryptedXml(xmlText: string): string {
  const root = parseXmlRoot(xmlText, "WeChat Official Account XML");
  return readRequiredXmlString(root, "Encrypt", "WeChat Official Account XML");
}

export function parseOfficialAccountTextMessage(
  xmlText: string,
): OfficialAccountTextMessage {
  const root = parseXmlRoot(xmlText, "WeChat Official Account XML");

  return {
    toUserName: readRequiredXmlString(
      root,
      "ToUserName",
      "WeChat Official Account XML",
    ),
    fromUserName: readRequiredXmlString(
      root,
      "FromUserName",
      "WeChat Official Account XML",
    ),
    createTime: readOptionalXmlString(root, "CreateTime"),
    msgType: readRequiredXmlString(
      root,
      "MsgType",
      "WeChat Official Account XML",
    ),
    content: readOptionalXmlString(root, "Content") ?? "",
    msgId: readOptionalXmlString(root, "MsgId"),
  };
}

export function buildTextReplyXml(
  message: OfficialAccountTextMessage,
  content: string,
): string {
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
