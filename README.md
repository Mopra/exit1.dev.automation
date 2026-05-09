# exit1.dev.automation

Automation and AI agent hub for [exit1.dev](https://exit1.dev). See [purpose.md](purpose.md) for the long version.

## Webhook receiver (CLI)

A small HTTP server that receives downtime / uptime webhook deliveries from exit1.dev and pretty-prints them to the terminal. Use it locally during development or run it on the VPS as the entry point for downstream automations.

### Run

```bash
npm install
npm run webhook              # production-style: node src/webhook-receiver/server.js
npm run webhook:dev          # auto-restart on file changes (node --watch)
```

Default endpoint: `http://localhost:3000/webhook`.

### Configure

| Env var | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `WEBHOOK_PATH` | `/webhook` | Path that accepts POST deliveries |
| `WEBHOOK_SECRET` | *(none)* | If set, requests must send `x-webhook-secret: <value>` (or `?secret=<value>`). Without it, the endpoint is open. |

### Test it locally

```bash
curl -X POST http://localhost:3000/webhook \
  -H 'content-type: application/json' \
  -d '{
    "event": "website_down",
    "summary": "🚨 Toggle Endpoint is DOWN",
    "timestamp": 1778284903794,
    "website": {
      "id": "0eZBrph4wcyZNClFYfmo",
      "name": "Toggle Endpoint",
      "url": "https://example.com/api/toggle",
      "type": "website",
      "status": "offline",
      "responseTime": 0,
      "lastStatusCode": 500,
      "statusCodeInfo": "HTTP 500",
      "error": "HTTP 500: Internal Server Error",
      "targetIp": "34.117.33.233"
    },
    "previousStatus": "online",
    "userId": "user_3DSkvgK39yQbmRWDxAfycK5wzjy"
  }'
```

### Point exit1.dev at it

Once the receiver is reachable on a public URL (the VPS, or via an ngrok tunnel during development), add it as a webhook in exit1.dev under **Alerts → Webhooks → Add endpoint** with the generic preset.
