import { client } from './client'
import { errorDetail } from './errorDetail'
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
  throw new AccountError(
    errorDetail(body, 'The request could not be completed. Check your entries.'),
    response.status,
  )
}

type CsrfHeaders = { 'X-CSRF-Token': string }

export async function csrfHeaders(signal?: AbortSignal): Promise<CsrfHeaders> {
  const { data, response } = await client.GET('/api/v1/auth/csrf', { cache: 'no-store', signal })
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

async function postAccount(
  send: (headers: CsrfHeaders) => Promise<{ response: Response }>,
): Promise<void> {
  const { response } = await send(await csrfHeaders())
  await checkResponse(response)
}

export function signIn(email: string, password: string): Promise<void> {
  return postAccount((headers) =>
    client.POST('/api/v1/auth/login', { body: { email, password }, headers }),
  )
}

export async function signOut(): Promise<void> {
  const { response } = await client.POST('/api/v1/auth/logout', { headers: await csrfHeaders() })
  // An expired session is already signed out.
  if (response.status !== 401) await checkResponse(response)
}

export function registerAccount(body: Registration): Promise<void> {
  return postAccount((headers) => client.POST('/api/v1/auth/register', { body, headers }))
}

export function requestRecovery(email: string): Promise<void> {
  return postAccount((headers) =>
    client.POST('/api/v1/auth/forgot-password', { body: { email }, headers }),
  )
}

export function requestVerification(email: string): Promise<void> {
  return postAccount((headers) =>
    client.POST('/api/v1/auth/request-verify', { body: { email }, headers }),
  )
}

export function verifyEmail(token: string): Promise<void> {
  return postAccount((headers) => client.POST('/api/v1/auth/verify', { body: { token }, headers }))
}

export function resetPassword(token: string, password: string): Promise<void> {
  return postAccount((headers) =>
    client.POST('/api/v1/auth/reset-password', { body: { token, password }, headers }),
  )
}
