# AIOps Incident Remediation Agent

An automated **Incident-to-Pull-Request remediation pipeline** built with **n8n, OpenAI GPT, Docker, SSH, and GitHub**.

The system detects application exceptions, analyzes the corresponding stack trace and source code, generates a structured remediation plan, applies the required code changes, and creates a GitHub Pull Request for human review.

The goal is to demonstrate how **AIOps, AI agents, GitOps, and automated software remediation** can be combined into a controlled workflow where AI assists with incident diagnosis and implementation without directly deploying changes to production.

---

## Overview

The pipeline follows an **Incident → Analysis → Change Request → Code Fix → Pull Request → Human Review** architecture.

```text
Application Exception
        │
        ▼
Server Monitoring Agent
        │
        ▼
       n8n
        │
        ▼
Exception Extraction & Deduplication
        │
        ▼
AI Incident Analyst
   OpenAI GPT
        │
        ▼
Repository Investigation
        │
        ▼
GitHub Change Request / Issue
        │
        ▼
Code Implementation Agent
   OpenAI GPT
        │
        ▼
Working Branch
        │
        ▼
Source Code Changes
        │
        ▼
Commit / Push
        │
        ▼
GitHub Pull Request
        │
        ▼
Human Review
```

The AI models are accessed remotely through the **OpenAI API**. No local LLM is required to perform incident analysis or code remediation.

---

# Architecture

## 1. Server Monitoring Agent

A lightweight agent runs on the application server and monitors container or application logs.

The agent can use tools such as:

```bash
journalctl
docker logs
docker events
```

It looks for application failures such as:

```text
Unhandled exception
Exception
UnhandledPromiseRejection
NullReferenceException
TypeError
```

When an exception is detected, the agent collects enough surrounding log lines to preserve the complete stack trace and execution context.

The collected incident information includes data such as:

```text
Container
Service
Exception
Stack Trace
Timestamp
Log Context
```

The information is then sent to the n8n remediation workflow.

---

# 2. n8n Incident Orchestrator

[n8n](https://n8n.io/) acts as the orchestration layer of the system.

It coordinates communication between:

```text
Server
OpenAI
GitHub
SSH
Application Repository
```

The workflow receives the incident information and prepares it for analysis.

One of the first steps extracts individual exceptions from the collected logs.

Repeated exceptions are grouped together so that hundreds or thousands of identical failures do not generate hundreds of AI requests.

For example:

```text
1284 identical exceptions

        ↓

1 Incident

        ↓

1 AI analysis
```

A simplified incident object may look like:

```json
{
  "type": "Exception",
  "signature": "TypeError: Cannot destructure property 'path' of 'req.body'",
  "stackTrace": "...",
  "occurrences": 1284
}
```

This keeps the pipeline efficient and prevents duplicate remediation attempts.

---

# 3. AI Incident Analyst

The first AI agent acts as an **Incident Analyst**.

It uses a remote **OpenAI GPT model** through the OpenAI API.

Its job is to understand what happened before any repository modification is allowed.

The agent receives:

```text
Exception
Stack Trace
Occurrence Count
Repository Information
Application Context
```

The agent then investigates the GitHub repository using controlled GitHub tools.

Its responsibilities include:

1. Analyze the exception signature.
2. Check whether the incident already has an open GitHub Issue.
3. Identify the source file referenced by the stack trace.
4. Inspect the actual repository structure.
5. Retrieve the relevant source code.
6. Determine the root cause.
7. Define the required remediation.
8. Define required tests.
9. Define acceptance criteria.

The repository is always treated as the **source of truth**.

The agent must never assume that a file or directory referenced by a Docker stack trace has the same path in the GitHub repository.

For example:

```text
Container path:

/usr/src/app/index.js
```

could correspond to:

```text
index.js
src/index.js
app/index.js
src/app/index.js
```

The agent must discover the real repository path before analyzing the implementation.

---

# 4. Duplicate Incident Protection

Before inspecting the source code, the Incident Analyst checks existing GitHub Issues.

If an open Issue already represents the same exception and root problem, the workflow stops.

Example:

```text
DUPLICATE_INCIDENT_HALT:
Issue #18 already tracks this problem.
```

This prevents multiple Pull Requests from being generated for the same production incident.

If no matching Issue exists, the agent continues with repository investigation.

---

# 5. GitHub Change Request

The Incident Analyst is **read-only with respect to source code**.

It cannot:

```text
Modify source files
Create branches
Create commits
Push code
Create Pull Requests
```

Its only write operation is creating a **GitHub Issue**.

That Issue becomes the formal **Change Request** for the remediation pipeline.

A Change Request contains sections such as:

```markdown
## Metadata

## Incident

### Error

### Stack Trace

## Diagnosis

### Root Cause

## Affected Files

## Proposed Change

### Objective

### Implementation Instructions

## Tests & Validation

### Required Tests

### Acceptance Criteria
```

The implementation instructions are intentionally detailed because the next AI agent must be able to execute them deterministically.

The GitHub Issue therefore becomes the contract between the **Incident Analyst** and the **Code Implementation Agent**.

---

# 6. AI Code Implementation Agent

Once the Change Request is created, a second n8n workflow starts the **Code Implementation Agent**.

This agent also uses a remote **OpenAI GPT model**.

Unlike the Incident Analyst, this agent is allowed to modify repository files through controlled GitHub operations.

Its primary responsibilities are:

```text
Read Change Request
        ↓
Inspect Repository
        ↓
Locate Target Code
        ↓
Verify Root Cause
        ↓
Determine Minimal Fix
        ↓
Modify Source Code
        ↓
Create / Update Tests
        ↓
Validate Changes
        ↓
Commit Changes
```

The GitHub Issue is considered the authoritative remediation request, but the agent still validates every important assumption against the actual repository.

It never blindly applies code snippets contained in the Issue.

---

# 7. Repository Safety Rules

The Code Implementation Agent follows a strict **minimal-change strategy**.

The preferred scope is normally:

```text
1 primary source file
0–2 directly related test files
```

The agent avoids:

```text
Unrelated refactoring
Dependency upgrades
Infrastructure changes
CI/CD changes
Docker configuration changes
Repository reorganizations
Mass formatting
Environment configuration changes
```

unless explicitly required by the Change Request.

Before modifying an existing file, the agent must first read its current contents.

It must also verify that the requested change has not already been implemented.

---

# 8. Working Branch Isolation

Every remediation runs on a dedicated Git branch.

For example:

```text
main
 │
 └── fix/incident-20260817-000001
```

All repository reads and modifications associated with the remediation target the working branch.

The base branch is never modified directly.

The workflow follows the equivalent GitOps sequence:

```bash
git checkout -b fix/incident-...
git add .
git commit -m "fix: remediate incident ..."
git push
```

Depending on the n8n workflow configuration, these operations can be performed through GitHub API operations rather than direct shell commands.

---

# 9. Repository Mismatch Protection

The Code Implementation Agent does not blindly trust the Change Request.

If the GitHub Issue says a specific file or implementation exists but repository inspection proves otherwise, the agent evaluates the mismatch.

Minor differences can be adapted automatically.

For example:

```text
Different variable name
Code moved to another function
Equivalent validation helper already exists
```

However, significant conflicts stop the remediation.

Examples include:

```text
Referenced file does not exist
Affected route cannot be found
Repository architecture is fundamentally different
Requested change would break an API contract
The required fix is already implemented
```

In those situations the agent can return:

```text
BLOCKED_REPOSITORY_MISMATCH
```

instead of making speculative changes.

---

# 10. Pull Request Generation

After the remediation has been successfully implemented, the workflow creates or prepares a GitHub Pull Request.

The Pull Request targets the repository's base branch:

```text
fix/incident-...
        │
        ▼
       main
```

The PR contains information such as:

```text
Incident ID
Original Exception
Root Cause
Implemented Fix
Affected Files
Validation Information
Associated GitHub Issue
```

This creates a complete traceability chain:

```text
Production Incident
      ↓
Exception
      ↓
AI Diagnosis
      ↓
GitHub Issue
      ↓
Code Changes
      ↓
Commit
      ↓
Pull Request
```

---

# 11. Human-in-the-Loop Review

The system intentionally stops before production deployment.

A human developer or reviewer remains responsible for reviewing and approving the Pull Request.

This preserves an important safety boundary:

```text
AI can:

Detect
Analyze
Recommend
Modify
Test
Commit
Create PR

AI cannot:

Approve its own production deployment
```

The developer can inspect:

```text
Root cause analysis
Code changes
Git diff
Tests
Pull Request
```

before merging anything into the main branch.

---

# 12. Feedback Loop

The architecture can also support a review feedback loop.

When a developer leaves a comment on the Pull Request:

```text
GitHub PR Comment
        │
        ▼
GitHub Webhook
        │
        ▼
n8n
        │
        ▼
AI Review Agent
        │
        ▼
Repository Analysis
        │
        ▼
Additional Code Changes
        │
        ▼
Commit / Push
        │
        ▼
Existing PR Updated
```

The AI can interpret reviewer feedback, inspect the current implementation, and apply additional changes to the same remediation branch.

The Pull Request therefore remains the central collaboration point between the AI remediation agents and human developers.

---

# 13. AI Agent Separation

The architecture deliberately separates diagnosis from implementation.

## Incident Analyst

Responsible for:

```text
Logs
Stack traces
Repository investigation
Root cause analysis
Change Request generation
```

It **cannot modify source code**.

---

## Code Implementation Agent

Responsible for:

```text
Reading the Change Request
Inspecting repository code
Implementing the remediation
Updating tests
Committing changes
```

It cannot independently redefine the incident unless repository evidence proves that the Change Request is incorrect.

---

## Human Reviewer

Responsible for:

```text
Reviewing the implementation
Reviewing tests
Requesting changes
Approving or rejecting the Pull Request
Merging the remediation
```

This separation reduces the risk of giving a single AI agent unrestricted control over the entire software lifecycle.

---

# 14. Technology Stack

| Component             | Technology           |
| --------------------- | -------------------- |
| Container Runtime     | Docker               |
| Host OS               | Debian Linux         |
| Monitoring Agent      | Bash                 |
| Automation Engine     | n8n                  |
| AI Provider           | OpenAI               |
| AI Models             | GPT models           |
| Repository            | GitHub               |
| Repository Automation | GitHub API           |
| Remote Execution      | SSH                  |
| Change Request        | GitHub Issues        |
| Code Review           | GitHub Pull Requests |
| Version Control       | Git                  |
| Workflow Architecture | AIOps / GitOps       |

---

# 15. Why Remote GPT Instead of a Local LLM?

The initial architecture considered running a local coding model using tools such as **Ollama**.

The final implementation uses remote OpenAI GPT models instead.

```text
Original concept:

n8n
  ↓
Local Ollama Model
  ↓
Code Fix
```

The implemented architecture is:

```text
n8n
  ↓
OpenAI API
  ↓
GPT Agent
  ↓
GitHub
```

Using remote GPT models provides several advantages for this project:

* Larger reasoning capacity.
* Better repository-level code analysis.
* Stronger tool-use capabilities.
* No GPU requirement on the AIOps server.
* No local model memory constraints.
* Faster experimentation with different models.
* Simpler n8n integration.
* The server remains focused on orchestration and observability instead of model inference.

The AI provider and model can still remain configurable so that the architecture is not permanently tied to a single model.

---

# 16. Example Remediation

Consider the following production exception:

```text
TypeError: Cannot destructure property 'path' of 'req.body'
because it is undefined
```

The stack trace points to:

```text
/usr/src/app/src/api/index.js
```

The pipeline performs the following actions:

```text
1. Monitoring agent detects the exception.

2. n8n extracts and groups identical occurrences.

3. Incident Analyst checks for an existing Issue.

4. GPT inspects the GitHub repository.

5. GPT locates the actual route implementation.

6. GPT confirms that req.body can be undefined.

7. GPT creates a GitHub Change Request.

8. Code Implementation Agent receives the Issue.

9. Agent creates a dedicated remediation branch.

10. Agent verifies the existing source code.

11. Agent implements the smallest safe validation fix.

12. Tests are created or updated.

13. Changes are committed to the remediation branch.

14. A Pull Request is created.

15. Human reviewer evaluates the change.
```

What originally required manual investigation can therefore become a mostly automated remediation workflow.

---

# 17. Design Principles

The project follows several important principles.

### Repository as Source of Truth

AI-generated assumptions must always be verified against the real repository.

### Minimal Change Scope

Incident remediation should fix the root cause without becoming an unrelated refactor.

### Human-in-the-Loop

AI can prepare a remediation, but humans retain final approval.

### Controlled Tool Access

AI agents only receive the repository operations required for their responsibility.

### Separation of Responsibilities

Diagnosis and implementation are handled by different agents.

### Idempotency

Retrying the workflow should not create duplicate fixes.

### Incident Deduplication

Repeated exceptions are grouped into a single remediation event.

### GitOps

Every remediation is represented through branches, commits, Issues, and Pull Requests.

---

# 18. Security Model

The remediation agents should never have unrestricted access to the host system.

Sensitive operations should remain prohibited.

Examples include:

```text
Reading .env files
Reading SSH private keys
Accessing credentials
Changing authentication systems
Modifying production infrastructure
Disabling security checks
Direct production deployment
```

Repository content must also be considered **untrusted input**.

Instructions embedded inside:

```text
Source code
Comments
README files
Issues
Documentation
```

must never override the system rules of the AI agents.

---

# 19. Project Goal

This project is not intended to completely replace software engineers or SRE teams.

Its purpose is to automate the repetitive parts of production incident remediation:

```text
Detect
Correlate
Investigate
Diagnose
Plan
Implement
Prepare Review
```

while keeping the final engineering decision under human control.

The result is an **AIOps Auto-Remediation Pipeline** capable of transforming a production exception into a reviewable GitHub Pull Request.

---

# Future Improvements

Possible future extensions include:

* Automatic test execution before creating the PR.
* GitHub Actions integration.
* PR review feedback agents.
* Slack or Telegram incident notifications.
* Prometheus integration.
* Grafana integration.
* Loki log ingestion.
* OpenTelemetry support.
* Kubernetes support.
* Incident severity classification.
* Automatic rollback recommendations.
* Repository-specific remediation policies.
* Model fallback strategies.
* Cost and token monitoring.
* Remediation metrics and dashboards.

A future architecture could support:

```text
Prometheus / Loki / OpenTelemetry
              │
              ▼
        Incident Engine
              │
              ▼
             n8n
              │
              ▼
      OpenAI GPT Agents
              │
              ▼
           GitHub
              │
              ▼
        CI Validation
              │
              ▼
        Human Approval
```

---

# Disclaimer

This project is an experimental AIOps automation system.

AI-generated changes should always be reviewed and validated before being merged or deployed to production.

---

## License

Add the appropriate license for your repository.

For example:

```text
MIT License
```
