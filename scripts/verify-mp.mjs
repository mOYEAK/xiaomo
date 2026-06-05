import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: false,
});

const sampleText = "\u4f60\u597d";
const passiveReply = "\u6536\u5230\u6d4b\u8bd5\u6d88\u606f\uff1a\u4f60\u597d";

function main() {
  verifyUrlSignature();
  verifyTextMessageParsing();
  verifyTextReplyXml();

  console.log("WeChat Official Account local verification passed.");
}

function verifyUrlSignature() {
  const token = "mp-token";
  const timestamp = "1710000000";
  const nonce = "mp-nonce";
  const signature = createSha1Signature(token, timestamp, nonce);
  const expected = createHash("sha1").update([token, timestamp, nonce].sort().join("")).digest("hex");

  assert.equal(signature, expected);
}

function verifyTextMessageParsing() {
  const message = parseTextMessageXml(`
    <xml>
      <ToUserName><![CDATA[gh_app]]></ToUserName>
      <FromUserName><![CDATA[o_user]]></FromUserName>
      <CreateTime>1710000000</CreateTime>
      <MsgType><![CDATA[text]]></MsgType>
      <Content><![CDATA[${sampleText}]]></Content>
      <MsgId>1234567890</MsgId>
    </xml>
  `);

  assert.equal(message.toUserName, "gh_app");
  assert.equal(message.fromUserName, "o_user");
  assert.equal(message.msgType, "text");
  assert.equal(message.content, sampleText);
}

function verifyTextReplyXml() {
  const reply = buildTextReplyXml(
    {
      toUserName: "gh_app",
      fromUserName: "o_user",
      msgType: "text",
      content: sampleText,
    },
    passiveReply,
  );
  const root = parseXmlRoot(reply);

  assert.equal(String(root.ToUserName), "o_user");
  assert.equal(String(root.FromUserName), "gh_app");
  assert.equal(String(root.MsgType), "text");
  assert.equal(String(root.Content), passiveReply);
}

function createSha1Signature(...parts) {
  return createHash("sha1").update([...parts].sort().join("")).digest("hex");
}

function parseTextMessageXml(xmlText) {
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

function buildTextReplyXml(message, content) {
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

function parseXmlRoot(xmlText) {
  const parsed = xmlParser.parse(xmlText);
  const root = parsed.xml;

  if (!root || typeof root !== "object") {
    throw new Error("Invalid XML payload.");
  }

  return root;
}

function readRequiredXmlString(root, key) {
  const value = readOptionalXmlString(root, key);

  if (!value) {
    throw new Error(`Missing XML field: ${key}.`);
  }

  return value;
}

function readOptionalXmlString(root, key) {
  const value = root[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  return String(value);
}

main();
