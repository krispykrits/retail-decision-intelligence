import { useCallback, useEffect, useRef, useState } from 'react'
import {
  pendingImportId,
  resumeImport,
  uploadCsv,
  type Dataset,
  type ImportResult,
} from '../../api/imports'
import { datasets } from './display'

export function useImportQueue(administrator: boolean, refresh: () => void) {
  const [files, setFiles] = useState<Partial<Record<Dataset, File>>>({})
  const [progress, setProgress] = useState<string | null>(() =>
    administrator && pendingImportId() ? 'Checking import status…' : null,
  )
  const activeRequest = useRef<AbortController | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [results, setResults] = useState<ImportResult[]>([])
  const queued = datasets.flatMap(([dataset, label]) => {
    const file = files[dataset]
    return file ? [{ dataset, label, file }] : []
  })
  const uploading = progress !== null

  const finishImport = useCallback(
    (controller: AbortController) => {
      if (controller.signal.aborted) return
      setProgress(null)
      refresh()
    },
    [refresh],
  )

  const continueImport = useCallback(
    async (id: string, controller: AbortController) => {
      try {
        const result = await resumeImport(id, setProgress, controller.signal)
        if (!controller.signal.aborted) setResults((current) => [...current, result])
      } catch (error) {
        if (!controller.signal.aborted) {
          setUploadError(
            error instanceof Error ? error.message : 'Import status could not be loaded.',
          )
        }
      } finally {
        finishImport(controller)
      }
    },
    [finishImport],
  )

  useEffect(() => {
    const pending = administrator && pendingImportId()
    if (pending) {
      const controller = new AbortController()
      activeRequest.current = controller
      void Promise.resolve().then(() => {
        if (!controller.signal.aborted) return continueImport(pending, controller)
      })
    }
    return () => activeRequest.current?.abort()
  }, [administrator, continueImport])

  function selectFile(dataset: Dataset, file?: File) {
    setFiles((current) => ({ ...current, [dataset]: file }))
  }

  async function importFiles() {
    if (uploading || !administrator) return
    const controller = new AbortController()
    activeRequest.current = controller
    setUploadError('')
    setResults([])
    const pending = pendingImportId()
    if (pending) {
      setProgress('Checking import status…')
      await continueImport(pending, controller)
      return
    }

    try {
      for (const [index, { dataset, label, file }] of queued.entries()) {
        setProgress(`Importing ${label} (${index + 1} of ${queued.length})…`)
        const result = await uploadCsv(dataset, file, setProgress, controller.signal)
        if (controller.signal.aborted) return
        setResults((current) => [...current, result])
        if (result.status === 'failed') break
        if (result.status === 'completed') selectFile(dataset)
      }
    } catch (error) {
      if (controller.signal.aborted) return
      setUploadError(
        error instanceof Error && error.name !== 'TypeError'
          ? error.message
          : 'The import result could not be confirmed. Refresh or retry the same file.',
      )
    } finally {
      finishImport(controller)
    }
  }

  return { files, queued, progress, uploading, uploadError, results, selectFile, importFiles }
}
