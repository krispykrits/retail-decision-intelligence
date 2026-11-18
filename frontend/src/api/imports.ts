import { csrfHeaders } from './accounts'
import { client } from './client'
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

export async function uploadCsv(dataset: Dataset, file: File): Promise<ImportResult> {
  const headers = await csrfHeaders()
  const { data, error } = await client.POST('/api/v1/imports', {
    body: { dataset, file: file.name },
    params: { header: { 'X-CSRF-Token': headers['X-CSRF-Token'] } },
    bodySerializer: (body) => {
      const form = new FormData()
      form.set('dataset', body.dataset)
      form.set('file', file, body.file)
      return form
    },
  })
  if (!data) {
    throw new Error(
      error && typeof error.detail === 'string'
        ? error.detail
        : 'The import result could not be confirmed. Refresh or retry the same file.',
    )
  }
  return data
}
