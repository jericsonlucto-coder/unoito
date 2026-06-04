import { NextRequest, NextResponse } from 'next/server'

const PUSHER_APP_ID = '2162488'
const PUSHER_KEY = '4de6e91a5e72dd9096db'
const PUSHER_SECRET = 'b9c26ec9196d0338ba7a'
const PUSHER_CLUSTER = 'ap1'

interface PusherRequest {
    channel: string;
    event: string;
    data: any;
}

async function hmacSHA256(secret: string, message: string): Promise<string> {
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const messageData = encoder.encode(message)
    const cryptoKey = await crypto.subtle.importKey(
        'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
    return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
}

async function computeMd5Fallback(message: string): Promise<string> {
    let hash = 0
    for (let i = 0; i < message.length; i++) {
        const char = message.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash
    }
    return Math.abs(hash).toString(16).padStart(8, '0')
}

async function computeMd5(message: string): Promise<string> {
    try {
        const encoder = new TextEncoder()
        const data = encoder.encode(message)
        const hashBuffer = await crypto.subtle.digest('MD5', data)
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
    } catch {
        return computeMd5Fallback(message)
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json() as PusherRequest
        const { channel, event, data } = body

        if (!channel || !event || data === undefined) {
            return NextResponse.json(
                { error: 'Missing channel, event, or data' },
                { status: 400 }
            )
        }

        const bodyString = JSON.stringify(data)
        const timestamp = Math.floor(Date.now() / 1000).toString()
        const path = `/apps/${PUSHER_APP_ID}/events`
        const bodyMd5 = await computeMd5(bodyString)

        // IMPORTANT: Only include auth params, NOT channel/name
        const paramString = [
            `auth_key=${PUSHER_KEY}`,
            `auth_timestamp=${timestamp}`,
            `auth_version=1.0`,
            `body_md5=${bodyMd5}`,
        ].sort().join('&')

        const toSign = ['POST', path, paramString].join('\n')
        const signature = await hmacSHA256(PUSHER_SECRET, toSign)

        const params = new URLSearchParams({
            auth_key: PUSHER_KEY,
            auth_timestamp: timestamp,
            auth_version: '1.0',
            body_md5: bodyMd5,
            auth_signature: signature,
        })

        // The channel and name go in the BODY, not the URL
        const pusherBody = JSON.stringify({
            channel: channel,
            name: event,
            data: data,
        })

        const url = `https://api-${PUSHER_CLUSTER}.pusher.com${path}?${params}`

        const pusherRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: pusherBody,
        })

        const resText = await pusherRes.text()

        if (!pusherRes.ok) {
            console.error('Pusher error:', pusherRes.status, resText)
            return NextResponse.json(
                { error: 'Pusher request failed', detail: resText },
                { status: pusherRes.status }
            )
        }

        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('Pusher route error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    })
}
