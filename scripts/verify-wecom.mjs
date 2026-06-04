import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: false,
});

function main() {
  verifySignatureSorting();
  verifyEncryptedXmlParsing();
  verifyTextMessageParsing();
  verifyNonTextMessageParsing();

  console.log("WeCom local verification passed.");
}

function verifySignatureSorting() {
  const token = "local-token";
  const timestamp = "1710000000";
  const nonce = "local-nonce";
  const encrypted = "encrypted-payload";
  const actual = createMessageSignature(token, timestamp, nonce, encrypted);
  const expected = createHash("sha1")
    .update([token, timestamp, nonce, encrypted].sort().join(""))
    .digest("hex");

  assert.equal(actual, expected);
}

function verifyEncryptedXmlParsing() {
  const encrypted = parseEncryptedXml(`
    <xml>
      <ToUserName><![CDATA[corp-id]]></ToUserName>
      <Encrypt><![CDATA[encrypted-payload]]></Encrypt>
      <AgentID><![CDATA[1000002]]></AgentID>
    </xml>
  `);

  assert.equal(encrypted, "encrypted-payload");
}

function verifyTextMessageParsing() {
  const message = parseTextMessageXml(`
    <xml>
      <ToUserName><![CDATA[corp-id]]></ToUserName>
      <FromUserName><![CDATA[zhangsan]]></FromUserName>
      <CreateTime>1710000000</CreateTime>
      <MsgType><![CDATA[text]]></MsgType>
      <Content><![CDATA[今天晚上提醒我交电费]]></Content>
      <MsgId>1234567890</MsgId>
      <AgentID>1000002</AgentID>
    </xml>
  `);

  assert.equal(message.fromUserName, "zhangsan");
  assert.equal(message.content, "今天晚上提醒我交电费");
  assert.equal(message.msgType, "text");
}

function verifyNonTextMessageParsing() {
  const message = parseTextMessageXml(`
    <xml>
      <ToUserName><![CDATA[corp-id]]></ToUserName>
      <FromUserName><![CDATA[zhangsan]]></FromUserName>
      <CreateTime>1710000001</CreateTime>
      <MsgType><![CDATA[image]]></MsgType>
      <PicUrl><![CDATA[https://example.com/image.png]]></PicUrl>
      <MsgId>1234567891</MsgId>
      <AgentID>1000002</AgentID>
    </xml>
  `);

  assert.equal(message.fromUserName, "zhangsan");
  assert.equal(message.content, "");
  assert.equal(message.msgType, "image");
}

function createMessageSignature(token, timestamp, nonce, encrypted) {
  return createHash("sha1")
    .update([token, timestamp, nonce, encrypted].sort().join(""))
    .digest("hex");
}

function parseEncryptedXml(xmlText) {
  const root = parseXmlRoot(xmlText);
  return readRequiredXmlString(root, "Encrypt");
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
    agentId: readOptionalXmlString(root, "AgentID"),
  };
}

function parseXmlRoot(xmlText) {
  const parsed = xmlParser.parse(xmlText);
  const root = parsed.xml;

  if (!root || typeof root !== "object") {
    throw new Error("Invalid WeCom XML payload.");
  }

  return root;
}

function readRequiredXmlString(root, key) {
  const value = readOptionalXmlString(root, key);

  if (!value) {
    throw new Error(`Missing WeCom XML field: ${key}.`);
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
