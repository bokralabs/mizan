---
name: linear
description: Use Symphony's linear_graphql client tool for Linear issue reads, comments, state transitions, and PR attachments during Symphony app-server sessions.
---

# Linear

Use this skill when a Symphony-run Codex session needs to read or update Linear.

## Tool

Use the `linear_graphql` client tool exposed by Symphony. It uses Symphony's configured Linear auth, so do not create shell helpers that read raw Linear tokens.

Tool input:

```json
{
  "query": "query or mutation document",
  "variables": {
    "optional": "values"
  }
}
```

Treat a top-level `errors` array as a failed GraphQL operation even if the tool call completes. Keep operations narrow and request only the fields needed for the current step.

## Common Queries

Issue by key:

```graphql
query IssueByKey($key: String!) {
  issue(id: $key) {
    id
    identifier
    title
    url
    description
    branchName
    state { id name type }
    project { id name }
    team {
      id
      key
      states { nodes { id name type } }
    }
    comments { nodes { id body resolvedAt updatedAt } }
    links { nodes { id url title } }
    attachments { nodes { id title url sourceType } }
  }
}
```

Team workflow states:

```graphql
query IssueTeamStates($id: String!) {
  issue(id: $id) {
    id
    team {
      id
      key
      states { nodes { id name type } }
    }
  }
}
```

## Common Mutations

Create a comment:

```graphql
mutation CreateComment($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) {
    success
    comment { id url }
  }
}
```

Update a comment:

```graphql
mutation UpdateComment($id: String!, $body: String!) {
  commentUpdate(id: $id, input: { body: $body }) {
    success
    comment { id body }
  }
}
```

Move an issue by exact state id:

```graphql
mutation MoveIssueToState($id: String!, $stateId: String!) {
  issueUpdate(id: $id, input: { stateId: $stateId }) {
    success
    issue { id identifier state { id name } }
  }
}
```

Attach a GitHub PR:

```graphql
mutation AttachGitHubPR($issueId: String!, $url: String!, $title: String) {
  attachmentLinkGitHubPR(
    issueId: $issueId
    url: $url
    title: $title
    linkKind: links
  ) {
    success
    attachment { id title url }
  }
}
```

## Rules

- Fetch team states before state transitions and use the exact `stateId`.
- Prefer updating the existing `## Codex Workpad` comment over creating new comments.
- Prefer `attachmentLinkGitHubPR` when linking pull requests.
- Use targeted introspection if a mutation or input shape is unclear.
