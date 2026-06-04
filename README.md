# Personal Agent

Cloudflare Workers + TypeScript implementation for a WeChat Official Account callback entrypoint.

## Local Development

Install dependencies:

```powershell
npm install
```

Run type checks and local parser/signature verification:

```powershell
npm run typecheck
npm run verify:mp
```

Start the Worker locally:

```powershell
npm run dev
```

Deploy the Worker:

```powershell
npm run deploy
```

## Cloudflare Secrets

Configure real values as Cloudflare Worker secrets. Do not commit real secrets.

Required for plaintext mode:

```powershell
npx wrangler secret put MP_TOKEN
```

Required if the Official Account message mode is set to safe/encrypted mode:

```powershell
npx wrangler secret put MP_APP_ID
npx wrangler secret put MP_ENCODING_AES_KEY
```

## WeChat Official Account Server Configuration

In the Official Account backend server configuration:

- URL: the deployed Worker URL, such as `https://personal-agent.<account>.workers.dev`
- Token: the same value configured as `MP_TOKEN`
- EncodingAESKey: the same value configured as `MP_ENCODING_AES_KEY` if encrypted mode is enabled
- Message encryption mode: plaintext is simplest for the first real callback test; encrypted mode is also supported for inbound messages

For GET verification, the Worker reads `signature`, `timestamp`, `nonce`, and `echostr`, verifies the SHA-1 signature with `MP_TOKEN`, and returns `echostr`.

For POST text messages, the Worker verifies the signature, parses the XML payload, and returns a passive text XML reply immediately:

```text
收到测试消息：原文
```

Non-text messages return `success` quickly and are logged as unsupported for now.
