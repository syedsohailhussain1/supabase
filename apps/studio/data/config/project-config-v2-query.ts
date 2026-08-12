import { queryOptions } from '@tanstack/react-query'

import { configKeys } from './keys'
import { get, handleError } from '@/data/fetchers'
import { IS_PLATFORM } from '@/lib/constants'
import type { ResponseError } from '@/types'

export type ProjectConfigV2Variables = {
  projectRef?: string
}

export async function getProjectConfigV2(
  { projectRef }: ProjectConfigV2Variables,
  signal?: AbortSignal
) {
  if (!projectRef) throw new Error('Project ref is required')

  // [Alpha] GET /v2/projects/{ref}/config — the project's effective service config
  // (database, pooler, auth, api, realtime, storage).
  const { data, error } = await get('/v2/projects/{ref}/config', {
    params: { path: { ref: projectRef } },
    signal,
  })

  if (error) handleError(error)
  if (!data) throw new Error('Failed to load project config')
  return data.data.attributes
}

export type ProjectConfigV2Data = Awaited<ReturnType<typeof getProjectConfigV2>>
export type ProjectConfigV2Error = ResponseError

export const projectConfigV2QueryOptions = (
  { projectRef }: ProjectConfigV2Variables,
  { enabled = true }: { enabled?: boolean } = { enabled: true }
) => {
  return queryOptions({
    queryKey: configKeys.projectConfigV2(projectRef),
    queryFn: ({ signal }) => getProjectConfigV2({ projectRef }, signal),
    enabled: enabled && IS_PLATFORM && typeof projectRef !== 'undefined',
  })
}
