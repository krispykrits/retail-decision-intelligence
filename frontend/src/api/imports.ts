import { csrfHeaders } from './accounts'
import { client } from './client'
import { errorDetail } from './errorDetail'
import type { components } from './schema'

export type Dataset = components['schemas']['Dataset']
export type DatasetSummary = components['schemas']['DatasetSummary']
export type ImportResult = components['schemas']['ImportResult']

export async function getDatasets(signal?: AbortSignal): Promise<DatasetSummary[]> {
  const { data } = await client.GET('/api/v1/datasets', { signal, cache: 'no-store' })
  if (!data) throw new Error('Stored datasets could not be loaded.')
  return data
}

export async function getImportHistory(signal?: AbortSignal): Promise<ImportResult[]> {
  const { data } = await client.GET('/api/v1/imports', { signal, cache: 'no-store' })
  if (!data) throw new Error('Import history could not be loaded.')
  return data
}

async function uploadLocally(
  dataset: Dataset,
  file: File,
  signal?: AbortSignal,
): Promise<ImportResult> {
  const headers = await csrfHeaders(signal)
  const { data, error } = await client.POST('/api/v1/imports', {
    body: { dataset, file: file.name },
    params: { header: headers },
    signal,
    bodySerializer: (body) => {
      const form = new FormData()
      form.set('dataset', body.dataset)
      form.set('file', file, body.file)
      return form
    },
  })
  if (!data) {
    throw new Error(
      errorDetail(
        error,
        'The import result could not be confirmed. Refresh or retry the same file.',
      ),
    )
  }
  return data
}

const pendingImportKey = 'rdi-pending-import'
type Progress = (message: string) => void

export function pendingImportId() {
  return sessionStorage.getItem(pendingImportKey)
}

export async function resumeImport(
  id: string,
  progress?: Progress,
  signal?: AbortSignal,
): Promise<ImportResult> {
  const params = { path: { import_id: id } }
  let failures = 0

  for (;;) {
    signal?.throwIfAborted()
    const status = await client
      .GET('/api/v1/import-jobs/{import_id}', { params, signal, cache: 'no-store' })
      .catch((error: unknown) => {
        signal?.throwIfAborted()
        if (!(error instanceof TypeError)) throw error
        return undefined
      })
    if (!status || status.response.status >= 500) {
      if (++failures >= 5) throw new Error('Import status is unavailable. Resume to check again.')
    } else {
      const job = status.data
      if (!job) {
        if (status.response.status === 404) sessionStorage.removeItem(pendingImportKey)
        throw new Error(errorDetail(status.error, 'Import status could not be loaded.'))
      }
      if (job.result) {
        if (pendingImportId() === id) sessionStorage.removeItem(pendingImportKey)
        return job.result
      }
      failures = 0
      if (job.status === 'awaiting_upload') {
        const submission = await client.POST('/api/v1/import-jobs/{import_id}/submit', {
          params,
          headers: await csrfHeaders(signal),
          signal,
        })
        if (!submission.data) {
          throw new Error(
            errorDetail(submission.error, 'The upload is saved. Resume to submit it.'),
          )
        }
      }
      progress?.(
        job.status === 'processing' ? `Processing ${job.filename}…` : `${job.filename} is queued…`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 4000))
  }
}

export async function uploadCsv(
  dataset: Dataset,
  file: File,
  progress?: Progress,
  signal?: AbortSignal,
): Promise<ImportResult> {
  const { data: capabilities } = await client.GET('/api/v1/import-capabilities', {
    signal,
    cache: 'no-store',
  })
  if (!capabilities) throw new Error('Import settings could not be loaded.')
  if (file.size > capabilities.max_bytes) {
    throw new Error('The CSV is larger than the configured upload limit.')
  }
  if (!capabilities.direct_upload) return uploadLocally(dataset, file, signal)

  const { data: ticket, error } = await client.POST('/api/v1/import-jobs', {
    headers: await csrfHeaders(signal),
    body: { dataset, filename: file.name, size_bytes: file.size },
    signal,
  })
  if (!ticket) {
    throw new Error(errorDetail(error, 'The upload could not be started.'))
  }

  progress?.(`Uploading ${file.name}…`)
  const transfer = await fetch(ticket.upload_url, {
    method: 'PUT',
    body: file,
    headers: {
      'x-ms-blob-type': 'BlockBlob',
      'x-ms-version': '2021-12-02',
      'If-None-Match': '*',
    },
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal,
  })
  if (!transfer.ok) throw new Error('The CSV could not be uploaded. Try again.')
  sessionStorage.setItem(pendingImportKey, ticket.import_id)
  progress?.(`Submitting ${file.name}…`)
  return resumeImport(ticket.import_id, progress, signal)
}
