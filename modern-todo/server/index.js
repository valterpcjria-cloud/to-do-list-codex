import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { URL } from 'node:url'

const DEFAULT_PORT = 8787
const MAX_EVENTS = 500

loadEnvFile(path.join(process.cwd(), '.env'))
loadEnvFile(path.join(process.cwd(), '.env.local'))

const PORT = Number(process.env.CRM_API_PORT || DEFAULT_PORT)
const WEBHOOK_TOKEN = String(process.env.EVOLUTION_WEBHOOK_TOKEN || '').trim()

let eventSeq = 0
const events = []

function loadEnvFile(filepath) {
  try {
    if (!fs.existsSync(filepath)) return
    const raw = fs.readFileSync(filepath, 'utf8')
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .forEach((line) => {
        const index = line.indexOf('=')
        if (index <= 0) return
        const key = line.slice(0, index).trim()
        if (!key) return
        if (process.env[key] !== undefined) return
        let value = line.slice(index + 1).trim()
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")) ||
          (value.startsWith('`') && value.endsWith('`'))
        ) {
          value = value.slice(1, -1)
        }
        process.env[key] = value
      })
  } catch {
    // ignore
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload ?? null)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-webhook-token',
  })
  res.end(body)
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return { _raw: raw }
  }
}

function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl ?? '').trim()
  if (!trimmed) return ''
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

function buildAuthHeaders(apiKey) {
  const token = String(apiKey ?? '').trim()
  if (!token) return {}
  return {
    apikey: token,
    authorization: `Bearer ${token}`,
  }
}

async function evolutionTryRequest({ baseUrl, apiKey, method, paths, body }) {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return { ok: false, status: 400, error: 'EVOLUTION_BASE_URL ausente' }

  const headers = {
    'content-type': 'application/json',
    ...buildAuthHeaders(apiKey),
  }

  let lastError = null
  for (const candidate of paths) {
    const url = `${normalized}${candidate.startsWith('/') ? candidate : `/${candidate}`}`
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })

      const text = await res.text()
      let json = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = null
      }

      if (res.ok) return { ok: true, status: res.status, path: candidate, data: json ?? text ?? null }

      const error = { ok: false, status: res.status, path: candidate, data: json ?? text ?? null }
      lastError = error
      if (res.status !== 404) return error
    } catch (err) {
      lastError = { ok: false, status: 0, path: candidate, error: String(err?.message || err) }
    }
  }

  return lastError ?? { ok: false, status: 500, error: 'Falha ao chamar Evolution API' }
}

function extractQrCode(payload) {
  if (!payload) return null
  const candidates = [
    payload?.qrcode?.base64,
    payload?.qrcode,
    payload?.qrCode,
    payload?.qr,
    payload?.base64,
    payload?.data?.qrcode,
    payload?.data?.base64,
    payload?.data?.qr,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return null
}

function looksLikeBase64Image(value) {
  if (!value) return false
  const trimmed = String(value).trim()
  if (trimmed.startsWith('data:image/')) return true
  if (trimmed.length < 128) return false
  return /^[A-Za-z0-9+/=]+$/.test(trimmed)
}

function toDataImage(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('data:image/')) return trimmed
  if (looksLikeBase64Image(trimmed)) return `data:image/png;base64,${trimmed}`
  return trimmed
}

function extractConnectionState(payload) {
  if (!payload) return null
  const candidates = [
    payload?.state,
    payload?.status,
    payload?.connectionState,
    payload?.instance?.state,
    payload?.instance?.status,
    payload?.data?.state,
    payload?.data?.status,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return null
}

function pushEvent(event) {
  const seq = (eventSeq += 1)
  const next = { seq, ...event }
  events.push(next)
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS)
  return next
}

function normalizeWhatsappSender(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const withoutJid = raw.replace(/@s\.whatsapp\.net$/i, '').replace(/@g\.us$/i, '')
  return withoutJid.replace(/\D/g, '')
}

function extractWhatsappText(message) {
  if (!message) return ''
  if (typeof message === 'string') return message
  if (typeof message?.text === 'string') return message.text
  if (typeof message?.conversation === 'string') return message.conversation
  if (typeof message?.extendedTextMessage?.text === 'string') return message.extendedTextMessage.text
  if (typeof message?.imageMessage?.caption === 'string') return message.imageMessage.caption
  if (typeof message?.videoMessage?.caption === 'string') return message.videoMessage.caption
  if (typeof message?.documentMessage?.caption === 'string') return message.documentMessage.caption
  if (typeof message?.buttonsResponseMessage?.selectedDisplayText === 'string')
    return message.buttonsResponseMessage.selectedDisplayText
  if (typeof message?.listResponseMessage?.title === 'string') return message.listResponseMessage.title
  return ''
}

function parseEvolutionWebhook(payload) {
  const data = payload?.data ?? payload?.message ?? payload
  const key = data?.key ?? payload?.key

  const fromMe = Boolean(key?.fromMe ?? data?.fromMe ?? payload?.fromMe)
  const remoteJid = key?.remoteJid ?? data?.remoteJid ?? payload?.remoteJid ?? payload?.from ?? payload?.sender
  const sender = normalizeWhatsappSender(remoteJid)

  const message = data?.message ?? payload?.message ?? payload?.data?.message ?? data
  const text = extractWhatsappText(message)

  const pushName = String(data?.pushName ?? payload?.pushName ?? payload?.senderName ?? '').trim()
  const instance = String(payload?.instance ?? payload?.instanceName ?? data?.instance ?? '').trim()

  return { fromMe, sender, text: String(text ?? '').trim(), pushName, instance }
}

function requireWebhookToken(reqUrl, req) {
  if (!WEBHOOK_TOKEN) return true
  const tokenFromQuery = String(reqUrl.searchParams.get('token') ?? '').trim()
  const tokenFromHeader = String(req.headers['x-webhook-token'] ?? '').trim()
  return tokenFromQuery === WEBHOOK_TOKEN || tokenFromHeader === WEBHOOK_TOKEN
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,x-webhook-token',
      'access-control-max-age': '86400',
    })
    res.end()
    return
  }

  if (reqUrl.pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (reqUrl.pathname === '/api/evolution/events' && req.method === 'GET') {
    const after = Number(reqUrl.searchParams.get('after') || 0)
    const pending = events.filter((event) => event.seq > after)
    sendJson(res, 200, { ok: true, events: pending, nextAfter: eventSeq })
    return
  }

  if (reqUrl.pathname === '/api/evolution/webhook' && req.method === 'POST') {
    if (!requireWebhookToken(reqUrl, req)) {
      sendJson(res, 401, { ok: false, error: 'Webhook token inv\u00e1lido' })
      return
    }

    const payload = await readJson(req)
    const parsed = parseEvolutionWebhook(payload)

    if (!parsed.text || !parsed.sender) {
      sendJson(res, 200, { ok: true, ignored: true })
      return
    }

    if (parsed.fromMe) {
      sendJson(res, 200, { ok: true, ignored: true, reason: 'fromMe' })
      return
    }

    pushEvent({
      id: crypto.randomUUID(),
      type: 'whatsapp_message',
      channel: 'whatsapp',
      instance: parsed.instance || null,
      sender: parsed.sender,
      author: parsed.pushName || null,
      text: parsed.text,
      receivedAt: Date.now(),
    })

    sendJson(res, 200, { ok: true })
    return
  }

  if (reqUrl.pathname === '/api/evolution/instance/create' && req.method === 'POST') {
    const body = await readJson(req)
    const baseUrl = body.baseUrl
    const apiKey = body.apiKey
    const instance = String(body.instance ?? '').trim()
    const instanceToken = String(body.instanceToken ?? body.apiKey ?? '').trim()

    if (!instance) {
      sendJson(res, 400, { ok: false, error: 'instance obrigat\u00f3ria' })
      return
    }

    const webhookUrl = String(body.webhookUrl ?? '').trim()
    const webhookToken = String(body.webhookToken ?? '').trim()

    const createPayload = {
      instanceName: instance,
      token: instanceToken || undefined,
      qrcode: true,
      webhook: webhookUrl
        ? {
            url: webhookUrl,
            byEvents: true,
            token: webhookToken || undefined,
          }
        : undefined,
    }

    const result = await evolutionTryRequest({
      baseUrl,
      apiKey,
      method: 'POST',
      paths: ['/instance/create', '/api/instance/create'],
      body: createPayload,
    })

    sendJson(res, result.ok ? 200 : 502, result)
    return
  }

  if (reqUrl.pathname === '/api/evolution/instance/connect' && req.method === 'POST') {
    const body = await readJson(req)
    const baseUrl = body.baseUrl
    const apiKey = body.apiKey
    const instance = String(body.instance ?? '').trim()

    if (!instance) {
      sendJson(res, 400, { ok: false, error: 'instance obrigat\u00f3ria' })
      return
    }

    const result = await evolutionTryRequest({
      baseUrl,
      apiKey,
      method: 'GET',
      paths: [`/instance/connect/${encodeURIComponent(instance)}`, `/instance/qrcode/${encodeURIComponent(instance)}`, `/api/instance/connect/${encodeURIComponent(instance)}`],
      body: undefined,
    })

    if (!result.ok) {
      sendJson(res, 502, result)
      return
    }

    const qr = extractQrCode(result.data)
    sendJson(res, 200, { ...result, qr: qr ? toDataImage(qr) : null })
    return
  }

  if (reqUrl.pathname === '/api/evolution/instance/status' && req.method === 'POST') {
    const body = await readJson(req)
    const baseUrl = body.baseUrl
    const apiKey = body.apiKey
    const instance = String(body.instance ?? '').trim()

    if (!instance) {
      sendJson(res, 400, { ok: false, error: 'instance obrigat\u00f3ria' })
      return
    }

    const result = await evolutionTryRequest({
      baseUrl,
      apiKey,
      method: 'GET',
      paths: [
        `/instance/connectionState/${encodeURIComponent(instance)}`,
        `/instance/status/${encodeURIComponent(instance)}`,
        `/api/instance/connectionState/${encodeURIComponent(instance)}`,
        `/api/instance/status/${encodeURIComponent(instance)}`,
      ],
      body: undefined,
    })

    if (!result.ok) {
      sendJson(res, 502, result)
      return
    }

    const state = extractConnectionState(result.data)
    sendJson(res, 200, { ...result, state: state ?? null })
    return
  }

  if (reqUrl.pathname === '/api/evolution/message/sendText' && req.method === 'POST') {
    const body = await readJson(req)
    const baseUrl = body.baseUrl
    const apiKey = body.apiKey
    const instance = String(body.instance ?? '').trim()
    const number = normalizeWhatsappSender(body.number)
    const text = String(body.text ?? '').trim()

    if (!instance || !number || !text) {
      sendJson(res, 400, { ok: false, error: 'instance/number/text obrigat\u00f3rios' })
      return
    }

    const payload = {
      number,
      text,
    }

    const result = await evolutionTryRequest({
      baseUrl,
      apiKey,
      method: 'POST',
      paths: [`/message/sendText/${encodeURIComponent(instance)}`, `/api/message/sendText/${encodeURIComponent(instance)}`, '/message/sendText', '/api/message/sendText'],
      body: payload,
    })

    sendJson(res, result.ok ? 200 : 502, result)
    return
  }

  sendJson(res, 404, { ok: false, error: 'Not found' })
})

server.listen(PORT, () => {
  console.log(`[crm-api] listening on http://localhost:${PORT}`)
  if (WEBHOOK_TOKEN) {
    console.log('[crm-api] EVOLUTION_WEBHOOK_TOKEN ativo (use header x-webhook-token ou query ?token=...)')
  }
})

