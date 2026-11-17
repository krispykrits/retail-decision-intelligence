import { client } from './client'
import type { components } from './schema'

export type Account = components['schemas']['AccountRead']
export type Registration = components['schemas']['RegisterAccount']

export class AccountError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function checkResponse(response: Response): Promise<void> {
  if (response.ok) return
  const body: unknown = await response.json().catch(() => null)
  const detail = body && typeof body === 'object' && 'detail' in body ? body.detail : null
  throw new AccountError(
    typeof detail === 'string' ? detail : 'The request could not be completed. Check your entries.',
    response.status,
  )
}

async function csrfHeaders(): Promise<Record<string, string>> {
  const { data, response } = await client.GET('/api/v1/auth/csrf', { cache: 'no-store' })
  await checkResponse(response)
  if (!data) throw new Error('Account access is unavailable')
  return { 'X-CSRF-Token': data.token }
}

export async function getCurrentAccount(signal?: AbortSignal): Promise<Account | null> {
  const { data, response } = await client.GET('/api/v1/me', { signal, cache: 'no-store' })
  if (response.status === 401) return null
  await checkResponse(response)
  return data ?? null
}

export async function signIn(email: string, password: string): Promise<void> {
  const { response } = await client.POST('/api/v1/auth/login', {
    body: { email, password },
    headers: await csrfHeaders(),
  })
  await checkResponse(response)
}

export async function signOut(): Promise<void> {
  const { response } = await client.POST('/api/v1/auth/logout', { headers: await csrfHeaders() })
  // An expired session is already signed out.
  if (response.status !== 401) await checkResponse(response)
}

export async function registerAccount(body: Registration): Promise<void> {
  const { response } = await client.POST('/api/v1/auth/register', {
    body,
    headers: await csrfHeaders(),
  })
  await checkResponse(response)
}

export async function requestRecovery(email: string): Promise<void> {
  const { response } = await client.POST('/api/v1/auth/forgot-password', {
    body: { email },
    headers: await csrfHeaders(),
  })
  await checkResponse(response)
}

export async function requestVerification(email: string): Promise<void> {
  const { response } = await client.POST('/api/v1/auth/request-verify', {
    body: { email },
    headers: await csrfHeaders(),
  })
  await checkResponse(response)
}

export async function verifyEmail(token: string): Promise<void> {
  const { response } = await client.POST('/api/v1/auth/verify', {
    body: { token },
    headers: await csrfHeaders(),
  })
  await checkResponse(response)
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const { response } = await client.POST('/api/v1/auth/reset-password', {
    body: { token, password },
    headers: await csrfHeaders(),
  })
  await checkResponse(response)
}
