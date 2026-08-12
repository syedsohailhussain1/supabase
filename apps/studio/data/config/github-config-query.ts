import { useQuery } from '@tanstack/react-query'
import { stringify as stringifyToml } from 'smol-toml'
import { z } from 'zod'

import { get, handleError } from '@/data/fetchers'
import type { GitHubConfigFormat, GitHubConfigResponse } from '@/lib/github-config.types'
import type { UseCustomQueryOptions } from '@/types'

export type GitHubConfigVariables = {
  connectionId?: number
  repository?: string
  branch?: string
}

export const githubConfigKeys = {
  all: ['github-config'] as const,
  connection: (connectionId?: number, branch?: string) =>
    [...githubConfigKeys.all, connectionId, branch ?? 'default-branch'] as const,
}

const GitHubConnectionConfigResponseSchema = z.object({
  path: z.string(),
  ref: z.string().nullable(),
  sha: z.string(),
  config: z.record(z.string(), z.unknown()),
})

export async function getGitHubConfig(
  { connectionId, repository, branch }: GitHubConfigVariables,
  signal?: AbortSignal
): Promise<GitHubConfigResponse> {
  if (!connectionId) throw new Error('connectionId is required')

  // [Alpha] Not yet in the generated api-types; drop the cast once `pnpm api:codegen` picks up
  // GET /platform/integrations/github/connections/{connection_id}/config.
  const { data, error } = await get(
    '/platform/integrations/github/connections/{connection_id}/config' as any,
    {
      params: {
        path: { connection_id: connectionId },
        query: { ref: branch },
      },
      signal,
    }
  )
  if (error) handleError(error)

  const parsed = GitHubConnectionConfigResponseSchema.safeParse(data)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw new Error(
      `Invalid GitHub connection config response: ${first?.message ?? 'Invalid shape'}`
    )
  }

  const { path, ref, sha, config } = parsed.data
  const format = getConfigFormat(path)
  const resolvedBranch = ref ?? branch ?? ''

  return {
    source: {
      repository: repository ?? '',
      branch: resolvedBranch,
      path,
      format,
      sha,
      htmlUrl: repository
        ? `https://github.com/${repository}/blob/${encodeURIComponent(resolvedBranch)}/${path}`
        : null,
    },
    config,
    managedPaths: listManagedConfigPaths(config),
    originalContent: serializeConfigForDisplay(config, format),
  }
}

export const useGitHubConfigQuery = <TData = GitHubConfigResponse>(
  variables: GitHubConfigVariables,
  { enabled = true, ...options }: UseCustomQueryOptions<GitHubConfigResponse, Error, TData> = {}
) =>
  useQuery<GitHubConfigResponse, Error, TData>({
    queryKey: githubConfigKeys.connection(variables.connectionId, variables.branch),
    queryFn: ({ signal }) => getGitHubConfig(variables, signal),
    enabled: enabled && typeof variables.connectionId !== 'undefined',
    staleTime: 30_000,
    ...options,
  })

export function isGitHubManagedPath(
  managedPaths: readonly string[] | undefined,
  configPath: string
): boolean {
  return (
    managedPaths?.some(
      (managedPath) => managedPath === configPath || managedPath.startsWith(`${configPath}.`)
    ) === true
  )
}

function getConfigFormat(path: string): GitHubConfigFormat {
  return path.toLowerCase().endsWith('.json') ? 'json' : 'toml'
}

function serializeConfigForDisplay(
  config: Record<string, unknown>,
  format: GitHubConfigFormat
): string {
  if (format === 'json') return JSON.stringify(config, null, 2)
  try {
    return stringifyToml(config)
  } catch {
    return JSON.stringify(config, null, 2)
  }
}

function listManagedConfigPaths(config: Record<string, unknown>): string[] {
  return listLeafPaths(config).sort((left, right) => left.localeCompare(right))
}

function listLeafPaths(value: unknown, prefix = ''): string[] {
  if (!isRecord(value) || value instanceof Date) return prefix ? [prefix] : []

  const entries = Object.entries(value)
  if (entries.length === 0) return prefix ? [prefix] : []

  return entries.flatMap(([key, child]) => listLeafPaths(child, prefix ? `${prefix}.${key}` : key))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
