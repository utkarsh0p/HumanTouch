import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { getConnectedAccountCredentials } from "../../../services/integrations.js";
import type { WorkflowState } from "../../state.js";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_REPO_SCOPE = "repo";

type GitHubToolContext = Pick<WorkflowState, "user">;

type GitHubApiError = {
  message?: string;
  documentation_url?: string;
};

type GitHubRepositoryResponse = {
  id?: number;
  name?: string;
  full_name?: string;
  private?: boolean;
  html_url?: string;
  description?: string | null;
  default_branch?: string;
  language?: string | null;
  open_issues_count?: number;
  stargazers_count?: number;
  forks_count?: number;
  updated_at?: string;
  owner?: {
    login?: string;
  };
};

type GitHubIssueResponse = {
  id?: number;
  number?: number;
  title?: string;
  state?: string;
  html_url?: string;
  body?: string | null;
  created_at?: string;
  updated_at?: string;
  user?: {
    login?: string;
  };
  labels?: Array<{
    name?: string;
  }>;
};

type GitHubIssueSearchResponse = {
  total_count?: number;
  items?: GitHubIssueResponse[];
};

async function getCredentials(context: GitHubToolContext, requiredScopes: string[] = []) {
  return await getConnectedAccountCredentials({
    provider: "github",
    userId: context.user.id,
    companyId: context.user.companyId,
    requiredScopes,
  });
}

async function githubRequest<T>(input: {
  accessToken: string;
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
}): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE_URL}${input.path}`, {
    method: input.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${input.accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(input.body ? { "Content-Type": "application/json" } : {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  const payload = (await response.json().catch(() => ({}))) as T & GitHubApiError;
  if (!response.ok) {
    throw new Error(payload.message ?? `GitHub API failed with HTTP ${response.status}.`);
  }

  return payload;
}

function summarizeRepository(repository: GitHubRepositoryResponse) {
  return {
    id: repository.id ?? null,
    owner: repository.owner?.login ?? repository.full_name?.split("/")[0] ?? "",
    name: repository.name ?? "",
    fullName: repository.full_name ?? "",
    private: Boolean(repository.private),
    url: repository.html_url ?? "",
    description: repository.description ?? "",
    defaultBranch: repository.default_branch ?? "",
    language: repository.language ?? "",
    openIssuesCount: repository.open_issues_count ?? 0,
    stars: repository.stargazers_count ?? 0,
    forks: repository.forks_count ?? 0,
    updatedAt: repository.updated_at ?? "",
  };
}

function summarizeIssue(issue: GitHubIssueResponse) {
  return {
    id: issue.id ?? null,
    number: issue.number ?? null,
    title: issue.title ?? "",
    state: issue.state ?? "",
    url: issue.html_url ?? "",
    author: issue.user?.login ?? "",
    labels: (issue.labels ?? []).map((label) => label.name).filter(Boolean),
    createdAt: issue.created_at ?? "",
    updatedAt: issue.updated_at ?? "",
    body: issue.body ?? "",
  };
}

export function createGitHubListReposTool(context: GitHubToolContext) {
  return tool(
    async ({ maxResults }) => {
      try {
        const credentials = await getCredentials(context);
        const searchParams = new URLSearchParams({
          visibility: "all",
          affiliation: "owner,collaborator,organization_member",
          sort: "updated",
          per_page: String(maxResults),
        });
        const repositories = await githubRequest<GitHubRepositoryResponse[]>({
          accessToken: credentials.accessToken,
          path: `/user/repos?${searchParams.toString()}`,
        });

        return JSON.stringify({
          repositories: repositories.slice(0, maxResults).map(summarizeRepository),
        });
      } catch (error) {
        return error instanceof Error ? error.message : "Failed to list GitHub repositories.";
      }
    },
    {
      name: "github_list_repos",
      description:
        "List repositories visible to the current user's connected GitHub account, sorted by recent updates.",
      schema: z.object({
        maxResults: z.number().int().min(1).max(20).default(10).describe("Maximum repositories to return."),
      }),
    },
  );
}

export function createGitHubGetRepoTool(context: GitHubToolContext) {
  return tool(
    async ({ owner, repo }) => {
      try {
        const credentials = await getCredentials(context);
        const repository = await githubRequest<GitHubRepositoryResponse>({
          accessToken: credentials.accessToken,
          path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        });

        return JSON.stringify(summarizeRepository(repository));
      } catch (error) {
        return error instanceof Error ? error.message : "Failed to load GitHub repository.";
      }
    },
    {
      name: "github_get_repo",
      description:
        "Get metadata for one GitHub repository visible to the current user's connected GitHub account.",
      schema: z.object({
        owner: z.string().min(1).describe("Repository owner or organization login."),
        repo: z.string().min(1).describe("Repository name."),
      }),
    },
  );
}

export function createGitHubSearchIssuesTool(context: GitHubToolContext) {
  return tool(
    async ({ owner, repo, query, maxResults }) => {
      try {
        const credentials = await getCredentials(context);
        const searchQuery = `repo:${owner}/${repo} is:issue ${query}`.trim();
        const searchParams = new URLSearchParams({
          q: searchQuery,
          sort: "updated",
          order: "desc",
          per_page: String(maxResults),
        });
        const results = await githubRequest<GitHubIssueSearchResponse>({
          accessToken: credentials.accessToken,
          path: `/search/issues?${searchParams.toString()}`,
        });

        return JSON.stringify({
          query: searchQuery,
          totalCount: results.total_count ?? 0,
          issues: (results.items ?? []).slice(0, maxResults).map(summarizeIssue),
        });
      } catch (error) {
        return error instanceof Error ? error.message : "Failed to search GitHub issues.";
      }
    },
    {
      name: "github_search_issues",
      description:
        "Search issues in one GitHub repository. Use this to inspect existing issues before creating a new one.",
      schema: z.object({
        owner: z.string().min(1).describe("Repository owner or organization login."),
        repo: z.string().min(1).describe("Repository name."),
        query: z.string().min(1).describe("GitHub issue search terms."),
        maxResults: z.number().int().min(1).max(20).default(10).describe("Maximum issues to return."),
      }),
    },
  );
}

export function createGitHubCreateIssueTool(context: GitHubToolContext) {
  return tool(
    async ({ owner, repo, title, body, labels }) => {
      try {
        const credentials = await getCredentials(context, [GITHUB_REPO_SCOPE]);
        const issue = await githubRequest<GitHubIssueResponse>({
          accessToken: credentials.accessToken,
          path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
          method: "POST",
          body: {
            title,
            body,
            labels,
          },
        });

        return JSON.stringify({
          status: "issue_created",
          issue: summarizeIssue(issue),
        });
      } catch (error) {
        return error instanceof Error ? error.message : "Failed to create GitHub issue.";
      }
    },
    {
      name: "github_create_issue",
      description:
        "Create an issue in a GitHub repository visible to the current user's connected account. Use only when the user explicitly asks to create or open an issue.",
      schema: z.object({
        owner: z.string().min(1).describe("Repository owner or organization login."),
        repo: z.string().min(1).describe("Repository name."),
        title: z.string().min(1).describe("Issue title."),
        body: z.string().optional().describe("Issue body in Markdown."),
        labels: z.array(z.string().min(1)).optional().describe("Optional labels to apply."),
      }),
    },
  );
}
