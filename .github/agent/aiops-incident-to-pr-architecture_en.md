# AIOps Architecture — Incident-to-PR Autonomous Code Agent

**Version:** 0.1  
**Date:** 2026-08-12  
**Status:** Initial design

---

## 1. Objective

Build an AIOps system capable of detecting application errors running in Docker, automatically analyzing their logs and stack traces, inspecting source code, proposing a fix via a high-quality reasoning model, and delegating the implementation to a local model running with Ollama.

The full flow will be:

```text
Application Error
      ↓
Log Collector
      ↓
Incident Detection / Correlation
      ↓
AI Diagnostic Agent
      ↓
Change Request (.md)
      ↓
Local Code Agent (Ollama)
      ↓
Code Changes
      ↓
Tests / Validation
      ↓
Git Commit / Push
      ↓
AI PR Agent
      ↓
GitHub Pull Request
      ↓
Human Review
      ↓
PR Comment
      ↓
AI Review Agent
      ↓
Change Request
      ↓
Ollama Code Agent
      ↓
Commit / Push
```

The goal is not to let a single model control the entire cycle, but to separate **diagnosis, implementation, and review**.

---

# 2. Architectural Principles

## 2.1 Separation of Responsibilities

Specialized agents will be used:

1. **Incident Analyst**
   - Analyzes logs, exceptions and stack traces.
   - Inspects the repository.
   - Determines probable cause.
   - Generates the Change Request.
   - Does not modify code.

2. **Code Agent**
   - Executes the Change Request.
   - Modifies the code.
   - Runs tests.
   - Fixes test-derived failures.
   - Performs commit and push.

3. **PR / Review Agent**
   - Creates PR title and description.
   - Analyzes reviewer comments.
   - Converts human feedback into new Change Requests.


# 3. Overall Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                        PRODUCTION                            │
│                                                              │
│  Docker Containers                                           │
│      │                                                       │
│      └── Application Logs                                    │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    INCIDENT ENGINE                           │
│                                                              │
│  Log Collector                                               │
│  Parser                                                      │
│  Exception Detector                                          │
│  Stack Trace Correlator                                      │
│  Deduplication                                               │
│  Incident State                                               │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    AI DIAGNOSTIC AGENT                       │
│                                                              │
│  GPT-5.x / reasoning model                                    │
│                                                              │
│  Input:                                                      │
│   - Logs                                                     │
│   - Stack trace                                              │
│   - Container metadata                                       │
│   - Source code                                              │
│   - Git history                                              │
│   - Tests                                                    │
│                                                              │
│  Output:                                                     │
│   Change Request                                             │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
                 .github/agent/
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                     CODE AGENT                               │
│                                                              │
│                    Ollama                                    │
│                 Qwen3-Coder                                   │
                                                              │
│  Read → Analyze → Edit → Test → Diff → Commit               │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                         GITHUB                               │
│                                                              │
│  Branch → Commit → Pull Request                              │
│                                                              │
│  CI Tests                                                    │
│  Human Review                                                │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           │ Review Comment
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    REVIEW AGENT                              │
│                                                              │
│  GPT-5.x                                                     │
│                                                              │
│  Comment + Diff + Repository Context                         │
│             ↓                                                │
│       Change Request                                         │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
                     Ollama Code Agent
                           │
                           ▼
                    New Commit / Push
```


# 4. Components

## 4.1 Docker Log Collector

The Debian server will run a native agent under `systemd`.

Responsibilities:

- consume container logs;
- detect relevant events;
- preserve context before and after the error;
- identify stack traces;
- associate errors with container/service;
- avoid sending all logs to the model.

Initially it can use:

```bash
docker logs
docker events
```

The architecture should allow later replacing this source with:

- Kubernetes;
- Loki;
- Prometheus;
- OpenTelemetry;
- Sentry;
- other observability systems.


# 5. Incident Detection

Not every `ERROR` line should be sent to the model.

The Incident Engine must group related events.

Example:

```text
NullPointerException
NullPointerException
NullPointerException
NullPointerException
...
```

Should become:

```yaml
incident_id: INC-20260812203144
signature: NullPointerException:UserService.getUser
service: users-api
occurrences: 1284
first_seen: ...
last_seen: ...
```

## 5.1 Deduplication

The incident signature may consider:

- exception type;
- normalized message;
- file;
- method;
- line;
- service;
- stack trace.

Goal:

```text
1284 errors
       ↓
1 incident
       ↓
1 GPT analysis
```


# 6. Incident State Machine

The incident will have explicit states:

```text
DETECTED
   ↓
CORRELATING
   ↓
ANALYZING
   │
   ├── NOT_ACTIONABLE
   │
   └── ACTIONABLE
          ↓
    CHANGE_REQUEST
          ↓
     IMPLEMENTING
          ↓
       TESTING
          │
          ├── FAILED
          │     ↓
          │  IMPLEMENTING
          │
          ↓
      COMMITTING
          ↓
      PR_CREATED
          ↓
      REVIEWING
          │
          ├── CHANGES_REQUESTED
          │        ↓
          │   REANALYZING
          │
          └── APPROVED
```


# 7. Diagnostic Agent

## Model

Initially:

```yaml
provider: openai
model: gpt-5.6
```

The model will remain configurable.

## Responsibilities

The Diagnostic Agent receives:

```text
Incident
+
Relevant Logs
+
Stack Trace
+
Container Metadata
+
Repository
+
Relevant Source Files
+
Git History
+
Tests
```

It must determine:

1. what happened;
2. what is the likely cause;
3. what evidence supports the hypothesis;
4. which files are involved;
5. what change should be made;
6. what risks exist;
7. what tests should be run;
8. acceptance criteria.

The agent **MUST NOT** modify the repository.


# 8. Change Request

The Change Request is the contract between the Diagnostic Agent and the Code Agent.

Location:

```text
.github/agent/
```

Format:

```text
change-request-{description}-{yyyymmddhhmmss}.md
```

Example:

```text
.github/agent/change-request-fix-null-user-20260812203144.md
```

## 8.1 Structure

```markdown
# Change Request

## Metadata

- ID:
- Created:
- Source:
- Repository:
- Branch:
- Incident:
- Service:
- Severity:
- Confidence:

## Incident

### Error

### Stack Trace

## Diagnosis

### Root Cause

### Evidence

## Affected Files

## Proposed Change

### Objective

### Implementation

## Constraints

## Tests

### Existing Tests

### Required Tests

## Acceptance Criteria

## Implementation Instructions

## Validation

## Rollback

## Analyst
```

The file must be human-readable and sufficiently precise for the Code Agent to process.


# 9. Code Agent

## Local model

Initial candidate:

```text
Ollama + Qwen3-Coder
```

The exact variant will depend on:

- available RAM;
- CPU;
- GPU;
- VRAM;
- current server load;
- repository sizes;
- required speed.

The final choice will be made after measuring the Debian server.

## Responsibilities

```text
Change Request
      ↓
Inspect Repository
      ↓
Locate Relevant Code
      ↓
Implement Change
      ↓
Run Tests
      ↓
Analyze Failures
      ↓
Correct Implementation
      ↓
Run Tests Again
      ↓
Git Diff
      ↓
Commit
      ↓
Push
```


# 10. Code Agent Tooling

The model must not have arbitrary system access.

Controlled tools will be exposed:

```text
read_file
search_code
list_files
git_status
git_diff
git_log
git_blame
write_file
run_tests
git_commit
git_push
```

Access to:

```text
ssh
docker
sudo
rm
systemctl
network administration
```

should be restricted or initially prohibited.


# 11. Workspace

Each incident should run in an isolated workspace.

Example:

```text
/opt/aiops/workspace/
└── INC-20260812203144/
    ├── repository/
    ├── incident.json
    ├── logs.txt
    ├── stacktrace.txt
    ├── change-request.md
    ├── execution.log
    └── test-results/
```

The workspace must be ephemeral.

After finishing the incident, only the information required for auditing may be retained.


# 12. Git Workflow

The Code Agent must not modify `main` or `master` directly.

It must create a branch:

```text
aiops/INC-20260812203144-fix-null-user
```

Workflow:

```text
main
 │
 └── aiops/INC-20260812203144-fix-null-user
              │
              ├── changes
              ├── tests
              └── commit
                       │
                       ▼
                 Pull Request
```


# 13. PR Agent

After the push, the PR Agent receives:

```text
Incident
+
Change Request
+
Git Diff
+
Test Results
```

It generates:

```text
PR title
PR description
```

The description must include:

```markdown
## Summary

## Root Cause

## Changes

## Tests

## Risk

## Rollback

## AI Analysis

## Incident Reference
```


# 14. GitHub Review Loop

When a reviewer adds a comment:

```text
GitHub
   ↓
GitHub Action
   ↓
Comment Collector
   ↓
GPT Review Agent
```

The Review Agent receives:

```text
Review Comment
+
PR Description
+
Current Diff
+
Relevant Files
+
Original Change Request
```

Its job is to interpret the comment.

Example:

```text
Reviewer:

"This doesn't handle the case where the user
was deleted between the lookup and the email operation."
```

The Review Agent must convert it into:

```text
Change Request
```

It must not modify the code directly.


# 15. Review Change Request

The new file may be:

```text
.github/agent/change-request-review-handle-deleted-user-20260812213004.md
```

It must reference the original PR:

```yaml
type: review_change
pull_request: 123
parent_change_request: change-request-fix-null-user-20260812203144.md
```

After:

```text
Review Change Request
       ↓
Ollama Code Agent
       ↓
Tests
       ↓
Commit
       ↓
Push
       ↓
Same Pull Request
```


# 16. n8n

n8n will not be the system core.

Its main role will be integration and notifications.

It can receive events from the system and send:

- Telegram;
- Slack;
- email;
- other systems.

Example:

```text
AIops Agent
     │
     ├── GitHub
     ├── n8n
     │    ├── Telegram
     │    └── Slack
     └── Logs
```

Critical logic should remain inside the Debian agent/service to reduce dependencies.


# 17. Security Model

## Principle

The model must not have unlimited access to the server.

There must be a boundary:

```text
AI Model
   ↓
Tool Layer
   ↓
Policy Engine
   ↓
System
```

Dangerous operations require explicit policy.

## Initial Rules

- Do not modify `main`.
- Do not run `sudo`.
- Do not run arbitrary commands as root.
- Do not access secrets.
- Do not read `.env`.
- Do not read SSH keys.
- Do not automatically modify GitHub Actions workflows.
- Do not modify production infrastructure.
- Do not run Docker with elevated privileges.
- Do not deploy automatically.


# 18. Confidence / Autonomy Policy

The Diagnostic Agent should produce a confidence level.

Example:

```yaml
confidence: 0.94
```

Proposed policy:

```text
>= 0.90
    → Automatic Change Request

0.70 - 0.89
    → diagnosis + human review

< 0.70
    → report only
```

Model confidence should never be considered a guarantee of correctness.
It must be combined with evidence and test results.


# 19. Human-in-the-loop

The first version must keep human approval for:

- merge;
- production deployment;
- infrastructure changes;
- security changes;
- database changes;
- CI/CD modifications.

The system may be autonomous for:

```text
Detect
Analyze
Propose
Implement
Test
Commit
Push
Create PR
```

but not for:

```text
Merge
Deploy Production
```


# 20. Observability of the system itself

The AIOps Agent must also be observable.

It should log:

```text
incident_id
model
model_version
prompt_version
start_time
end_time
tokens
files_read
files_changed
tests_executed
tests_passed
tests_failed
git_commit
pull_request
review_iterations
```

This will enable measuring:

- diagnosis time;
- implementation time;
- success rate;
- rollback rate;
- number of iterations;
- cloud model cost;
- Ollama consumption;
- false positives.


# 21. Configuration

Models must be configurable.

Example:

```yaml
models:

  diagnosis:
    provider: openai
    model: gpt-5.6

  pr:
    provider: openai
    model: gpt-5.6

  review:
    provider: openai
    model: gpt-5.6

  implementation:
    provider: ollama
    model: qwen3-coder:30b
```

Final local model configuration will be decided after measuring the server.


# 22. Suggested project structure

```text
/opt/aiops/
│
├── bin/
│   ├── aiops-agent
│   ├── log-collector
│   ├── incident-detector
│   ├── diagnostic-agent
│   ├── code-agent
│   └── pr-agent
│
├── config/
│   └── aiops.yaml
│
├── prompts/
│   ├── diagnosis.md
│   ├── implementation.md
│   ├── pr.md
│   └── review.md
│
├── incidents/
│   ├── active/
│   ├── completed/
│   └── failed/
│
├── workspace/
│
├── state/
│
└── logs/
```

Repository layout:

```text
.github/
└── agent/
    ├── change-request-*.md
    └── ...
```


# 23. Systemd

The main service will be managed by `systemd`.

Conceptually:

```text
systemd
   ↓
aiops-agent
   ↓
Incident Engine
```

The agent must:

- start automatically;
- restart on failure;
- write logs;
- handle signals;
- avoid duplicate processes;
- keep incident state.


# 24. Implementation phases

## Phase 1 — Log Detection

```text
Docker
  ↓
Log Collector
  ↓
Exception Detector
  ↓
Incident JSON
```

No AI yet.


## Phase 2 — AI Diagnosis

```text
Incident
  ↓
GPT
  ↓
Change Request .md
```

Validate diagnosis quality.


## Phase 3 — Local Code Agent

```text
Change Request
  ↓
Ollama
  ↓
Code Changes
  ↓
Tests
```

Still no automatic push.


## Phase 4 — Git Integration

```text
Tests
  ↓
Commit
  ↓
Push
```


## Phase 5 — Pull Request

```text
Push
  ↓
GPT
  ↓
PR
```


## Phase 6 — Review Loop

```text
PR Comment
  ↓
GitHub Action
  ↓
GPT
  ↓
Change Request
  ↓
Ollama
  ↓
Commit
```


## Phase 7 — Hardening

Add:

- sandbox;
- permissions;
- secrets isolation;
- rate limits;
- incident deduplication;
- audit logs;
- metrics;
- retries;
- circuit breakers;
- policy engine;
- approval gates.


# 25. Pending decisions

Before implementing the Code Agent, determine:

- Debian server CPU;
- RAM;
- GPU;
- VRAM;
- storage;
- current Docker load;
- Ollama version;
- repository sizes;
- primary languages;
- primary framework;
- number of repositories;
- expected incident frequency.

The final local model choice depends on these factors.


# 26. Final goal

The system should evolve to:

```text
┌─────────────────────────────────────────────────────┐
│                    PRODUCTION                       │
│                                                     │
│  Application → Error                                │
└───────────────────────┬─────────────────────────────┘
                        ↓
                 Incident Engine
                        ↓
                 AI Diagnosis
                        ↓
             Change Request .md
                        ↓
                Local Code Agent
                        ↓
                Tests / Validation
                        ↓
                     Git
                        ↓
                  Pull Request
                        ↓
                 Human Review
                        ↓
                Review Comment
                        ↓
                 AI Review Agent
                        ↓
             New Change Request
                        ↓
                Local Code Agent
                        ↓
                    Commit
```

The expected outcome is an **event-driven, auditable, human-in-the-loop system with separation between cloud diagnosis and local execution**.
The first implementation must prioritize security and traceability over full autonomy.
