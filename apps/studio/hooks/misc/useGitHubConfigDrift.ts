import { useQuery } from '@tanstack/react-query'
import { useParams } from 'common'
import { useCallback, useMemo } from 'react'

import { useBranchesQuery } from '@/data/branches/branches-query'
import type { Branch } from '@/data/branches/branches-query'
import { useGitHubConfigQuery } from '@/data/config/github-config-query'
import { projectConfigV2QueryOptions } from '@/data/config/project-config-v2-query'
import { useProjectGitHubConnectionQuery } from '@/data/integrations/github-connections-query'
import { useSelectedProjectQuery } from '@/hooks/misc/useSelectedProject'
import { IS_PLATFORM } from '@/lib/constants'
import { getAuthConfigDriftSummary } from '@/lib/github-config-drift'
import {
  resolveEffectiveGitHubConfigWithLayers,
  resolveGitHubConfigResponse,
  type GitHubConfigResolvedLayer,
  type GitHubConfigTarget,
} from '@/lib/github-config-effective'
import type { GitHubConfigResponse } from '@/lib/github-config.types'

type SelectedGitHubConfigTarget = Exclude<GitHubConfigTarget, 'development'>
const EMPTY_RESOLVED_LAYERS: GitHubConfigResolvedLayer[] = []

export function getGitBranchName(branch?: Branch): string | undefined {
  return branch?.git_branch?.trim() || (branch?.is_default ? undefined : branch?.name?.trim())
}

export function getGitHubConfigTarget(branch?: Branch): SelectedGitHubConfigTarget {
  return branch && !branch.is_default ? 'preview' : 'production'
}

export function useSelectedGitHubConfig() {
  const { ref: projectRef } = useParams()
  const { data: project } = useSelectedProjectQuery()
  const parentProjectRef = project?.parentRef ?? projectRef
  const shouldLoadBranches = IS_PLATFORM && Boolean(parentProjectRef)
  const { data: branches = [], isPending: branchesPending } = useBranchesQuery(
    { projectRef: parentProjectRef },
    { enabled: shouldLoadBranches }
  )
  const { data: connection, isPending: connectionPending } = useProjectGitHubConnectionQuery({
    ref: parentProjectRef,
  })
  const selectedBranch = branches.find((branch) => branch.project_ref === projectRef)
  const gitBranch = getGitBranchName(selectedBranch)
  const target = getGitHubConfigTarget(selectedBranch)
  const selectEffectiveConfig = useCallback(
    (response: GitHubConfigResponse) =>
      resolveGitHubConfigResponse(response, { target, gitBranch }),
    [gitBranch, target]
  )

  return useGitHubConfigQuery(
    { connectionId: connection?.id, repository: connection?.repository.name, branch: gitBranch },
    {
      enabled: (!shouldLoadBranches || !branchesPending) && !connectionPending,
      select: selectEffectiveConfig,
    }
  )
}

export function useSelectedGitHubConfigDrift() {
  const { ref: projectRef } = useParams()
  const projectQuery = useSelectedProjectQuery()
  const project = projectQuery.data
  const parentProjectRef = project?.parentRef ?? projectRef
  const shouldLoad = IS_PLATFORM && Boolean(projectRef) && Boolean(project)

  const branchesQuery = useBranchesQuery({ projectRef: parentProjectRef }, { enabled: shouldLoad })
  const connectionQuery = useProjectGitHubConnectionQuery({ ref: parentProjectRef })
  const connection = connectionQuery.data
  const hasConnection = connection !== undefined
  const branches = branchesQuery.data ?? []
  const selectedBranch = branches.find((branch) => branch.project_ref === projectRef)
  const gitBranch = getGitBranchName(selectedBranch)
  const target = getGitHubConfigTarget(selectedBranch)
  const queriesEnabled =
    shouldLoad && branchesQuery.isSuccess && connectionQuery.isSuccess && hasConnection

  const projectConfigQuery = useQuery({
    ...projectConfigV2QueryOptions({ projectRef }),
    enabled: queriesEnabled,
    staleTime: 30_000,
  })
  const dashboardAuthConfig = useMemo(
    () => toDashboardAuthConfig(projectConfigQuery.data?.auth),
    [projectConfigQuery.data?.auth]
  )
  const githubConfigQuery = useGitHubConfigQuery(
    { connectionId: connection?.id, repository: connection?.repository.name, branch: gitBranch },
    { enabled: queriesEnabled }
  )
  const effectiveConfigResult = useMemo(
    () =>
      githubConfigQuery.data
        ? resolveEffectiveGitHubConfigWithLayers(githubConfigQuery.data.config, {
            target,
            gitBranch,
          })
        : undefined,
    [gitBranch, githubConfigQuery.data, target]
  )

  const summary = useMemo(
    () =>
      getAuthConfigDriftSummary({
        dashboardConfig: dashboardAuthConfig,
        githubConfig: effectiveConfigResult?.config,
      }),
    [dashboardAuthConfig, effectiveConfigResult?.config]
  )
  const isReady =
    shouldLoad && hasConnection && projectConfigQuery.isSuccess && githubConfigQuery.isSuccess
  const source = githubConfigQuery.data?.source
  const hasSourceBranchFallback =
    gitBranch !== undefined && source !== undefined && source.branch !== gitBranch
  const issueCount = summary.driftedFields.length

  const refetch = () =>
    Promise.all([
      projectQuery.refetch(),
      branchesQuery.refetch(),
      connectionQuery.refetch(),
      projectConfigQuery.refetch(),
      githubConfigQuery.refetch(),
    ])

  return {
    gitBranch,
    requestedGitBranch: gitBranch,
    target,
    source,
    configContent: githubConfigQuery.data?.originalContent,
    resolvedLayers: effectiveConfigResult?.layers ?? EMPTY_RESOLVED_LAYERS,
    hasSourceBranchFallback,
    isReady,
    isPending:
      projectQuery.isPending ||
      (shouldLoad &&
        (branchesQuery.isPending ||
          connectionQuery.isPending ||
          (hasConnection && (projectConfigQuery.isPending || githubConfigQuery.isPending)))),
    isFetching:
      projectQuery.isFetching ||
      (shouldLoad &&
        (branchesQuery.isFetching ||
          connectionQuery.isFetching ||
          (hasConnection && (projectConfigQuery.isFetching || githubConfigQuery.isFetching)))),
    isError:
      projectQuery.isError ||
      (shouldLoad &&
        (branchesQuery.isError ||
          connectionQuery.isError ||
          projectConfigQuery.isError ||
          githubConfigQuery.isError)),
    error:
      projectQuery.error ??
      branchesQuery.error ??
      connectionQuery.error ??
      projectConfigQuery.error ??
      githubConfigQuery.error,
    hasDrift: isReady && summary.driftedFields.length > 0,
    hasConfigurationIssues: isReady && issueCount > 0,
    issueCount,
    summary,
    refetch,
  }
}

// The v2 project config's `auth` map is keyed by lowercased GoTrue setting name
// (e.g. `site_url`); the drift comparator and its field maps use the classic
// upper-cased GoTrueConfigResponse field names (e.g. `SITE_URL`).
function toDashboardAuthConfig(
  auth: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!auth) return undefined
  return Object.fromEntries(Object.entries(auth).map(([key, value]) => [key.toUpperCase(), value]))
}
