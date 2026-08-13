# Arquitectura AIOps — Incident-to-PR Autonomous Code Agent

**Versión:** 0.1  
**Fecha:** 2026-08-12  
**Estado:** Diseño inicial

---

## 1. Objetivo

Construir un sistema de AIOps capaz de detectar errores de aplicaciones ejecutándose en Docker, analizar automáticamente sus logs y stack traces, inspeccionar el código fuente, proponer una solución mediante un modelo de razonamiento de alta calidad y delegar la implementación a un modelo local ejecutándose con Ollama.

El flujo completo será:

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

El objetivo no es permitir que un único modelo tenga control total del ciclo, sino separar **diagnóstico, implementación y revisión**.

---

# 2. Principios arquitectónicos

## 2.1 Separación de responsabilidades

Se utilizarán agentes especializados:

1. **Incident Analyst**
   - Analiza logs, excepciones y stack traces.
   - Inspecciona el repositorio.
   - Determina causa probable.
   - Genera el Change Request.
   - No modifica código.

2. **Code Agent**
   - Ejecuta el Change Request.
   - Modifica el código.
   - Ejecuta pruebas.
   - Corrige errores derivados de las pruebas.
   - Realiza commit y push.

3. **PR / Review Agent**
   - Genera título y descripción del Pull Request.
   - Analiza comentarios de reviewers.
   - Convierte feedback humano en nuevos Change Requests.

---

# 3. Arquitectura general

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
│  Parser                                                       │
│  Exception Detector                                          │
│  Stack Trace Correlator                                      │
│  Deduplication                                               │
│  Incident State                                              │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    AI DIAGNOSTIC AGENT                       │
│                                                              │
│  GPT-5.x / modelo de razonamiento                            │
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
│                    Ollama                                   │
│                 Qwen3-Coder                                  │
│                                                              │
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

---

# 4. Componentes

## 4.1 Docker Log Collector

El servidor Debian ejecutará un agente nativo mediante `systemd`.

Responsabilidades:

- consumir logs de contenedores;
- detectar eventos relevantes;
- conservar contexto antes y después del error;
- identificar stack traces;
- asociar errores con container/service;
- evitar enviar todos los logs al modelo.

Inicialmente puede utilizar:

```bash
docker logs
docker events
```

La arquitectura debe permitir posteriormente sustituir esta fuente por:

- Kubernetes;
- Loki;
- Prometheus;
- OpenTelemetry;
- Sentry;
- otros sistemas de observabilidad.

---

# 5. Incident Detection

No se debe enviar cada línea `ERROR` al modelo.

El Incident Engine debe agrupar eventos relacionados.

Ejemplo:

```text
NullPointerException
NullPointerException
NullPointerException
NullPointerException
...
```

Debe convertirse en:

```yaml
incident_id: INC-20260812203144
signature: NullPointerException:UserService.getUser
service: users-api
occurrences: 1284
first_seen: ...
last_seen: ...
```

## 5.1 Deduplicación

La firma del incidente puede considerar:

- tipo de excepción;
- mensaje normalizado;
- archivo;
- método;
- línea;
- servicio;
- stack trace.

Objetivo:

```text
1284 errores
       ↓
1 incidente
       ↓
1 análisis GPT
```

---

# 6. Incident State Machine

El incidente tendrá estados explícitos:

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

---

# 7. Diagnostic Agent

## Modelo

Inicialmente:

```yaml
provider: openai
model: gpt-5.6
```

El modelo se mantendrá configurable.

## Responsabilidades

El Diagnostic Agent recibe:

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

Debe determinar:

1. qué ocurrió;
2. cuál es la causa probable;
3. qué evidencia soporta la hipótesis;
4. qué archivos están involucrados;
5. qué cambio debe realizarse;
6. qué riesgos existen;
7. qué pruebas deben ejecutarse;
8. criterios de aceptación.

El agente **NO debe modificar el repositorio**.

---

# 8. Change Request

El Change Request es el contrato entre el Diagnostic Agent y el Code Agent.

Ubicación:

```text
.github/agent/
```

Formato:

```text
change-request-{descripcion}-{yyyymmddhhmmss}.md
```

Ejemplo:

```text
.github/agent/change-request-fix-null-user-20260812203144.md
```

## 8.1 Estructura

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

El archivo debe ser legible por humanos y suficientemente preciso para ser procesado por el Code Agent.

---

# 9. Code Agent

## Modelo local

El candidato inicial será:

```text
Ollama + Qwen3-Coder
```

La variante exacta dependerá de:

- RAM disponible;
- CPU;
- GPU;
- VRAM;
- carga actual del servidor;
- tamaño de los repositorios;
- velocidad requerida.

La elección definitiva se realizará después de medir el servidor Debian.

## Responsabilidades

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

---

# 10. Tooling del Code Agent

El modelo no debe tener acceso arbitrario al sistema.

Se expondrán herramientas controladas:

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

El acceso a:

```text
ssh
docker
sudo
rm
systemctl
network administration
```

debe estar restringido o prohibido inicialmente.

---

# 11. Workspace

Cada incidente deberá ejecutarse en un workspace aislado.

Ejemplo:

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

El workspace debe ser efímero.

Después de finalizar el incidente puede conservarse únicamente la información necesaria para auditoría.

---

# 12. Git Workflow

El Code Agent no debe modificar directamente `main` o `master`.

Debe crear una rama:

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

---

# 13. PR Agent

Después del push, el PR Agent recibe:

```text
Incident
+
Change Request
+
Git Diff
+
Test Results
```

Genera:

```text
PR title
PR description
```

La descripción debe contener:

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

---

# 14. GitHub Review Loop

Cuando un reviewer agregue un comentario:

```text
GitHub
   ↓
GitHub Action
   ↓
Comment Collector
   ↓
GPT Review Agent
```

El Review Agent recibe:

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

Su trabajo es interpretar el comentario.

Ejemplo:

```text
Reviewer:

"This doesn't handle the case where the user
was deleted between the lookup and the email operation."
```

El Review Agent debe convertirlo en:

```text
Change Request
```

No debe modificar directamente el código.

---

# 15. Review Change Request

El nuevo archivo puede ser:

```text
.github/agent/change-request-review-handle-deleted-user-20260812213004.md
```

Debe referenciar el PR original:

```yaml
type: review_change
pull_request: 123
parent_change_request: change-request-fix-null-user-20260812203144.md
```

Después:

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

---

# 16. n8n

n8n no será el núcleo del sistema.

Su función principal será integración y notificación.

Puede recibir eventos del sistema y enviar:

- Telegram;
- Slack;
- email;
- otros sistemas.

Ejemplo:

```text
AIops Agent
     │
     ├── GitHub
     ├── n8n
     │    ├── Telegram
     │    └── Slack
     └── Logs
```

La lógica crítica debe permanecer en el agente/servicio de Debian para reducir dependencias.

---

# 17. Security Model

## Principio

El modelo no debe tener acceso ilimitado al servidor.

Debe existir una frontera:

```text
AI Model
   ↓
Tool Layer
   ↓
Policy Engine
   ↓
System
```

Las operaciones peligrosas requieren política explícita.

## Reglas iniciales

- No modificar `main`.
- No ejecutar `sudo`.
- No ejecutar comandos arbitrarios como root.
- No acceder a secretos.
- No leer `.env`.
- No leer claves SSH.
- No modificar workflows de GitHub Actions automáticamente.
- No modificar infraestructura de producción.
- No ejecutar Docker con privilegios elevados.
- No desplegar automáticamente.

---

# 18. Confidence / Autonomy Policy

El Diagnostic Agent deberá producir un nivel de confianza.

Ejemplo:

```yaml
confidence: 0.94
```

Política propuesta:

```text
>= 0.90
    → Change Request automático

0.70 - 0.89
    → diagnóstico + revisión humana

< 0.70
    → reporte únicamente
```

La confianza del modelo nunca debe considerarse una garantía de corrección.

Debe combinarse con evidencia y resultados de tests.

---

# 19. Human-in-the-loop

La primera versión debe mantener aprobación humana para:

- merge;
- despliegue;
- cambios de infraestructura;
- cambios de seguridad;
- modificaciones de base de datos;
- cambios en CI/CD.

El sistema puede ser autónomo en:

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

pero no necesariamente en:

```text
Merge
Deploy Production
```

---

# 20. Observabilidad del propio sistema

El AIOps Agent también debe ser observable.

Debe registrar:

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

Esto permitirá medir:

- tiempo de diagnóstico;
- tiempo de implementación;
- tasa de éxito;
- tasa de rollback;
- cantidad de iteraciones;
- costo de modelos cloud;
- consumo de Ollama;
- falsos positivos.

---

# 21. Configuración

Los modelos deben ser configurables.

Ejemplo:

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

La configuración definitiva del modelo local se determinará después de medir el servidor.

---

# 22. Estructura propuesta del proyecto

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

Repositorio de aplicación:

```text
.github/
└── agent/
    ├── change-request-*.md
    └── ...
```

---

# 23. Systemd

El servicio principal será administrado por `systemd`.

Conceptualmente:

```text
systemd
   ↓
aiops-agent
   ↓
Incident Engine
```

El agente deberá:

- iniciar automáticamente;
- reiniciar ante fallo;
- escribir logs;
- manejar señales;
- evitar procesos duplicados;
- mantener estado de incidentes.

---

# 24. Fases de implementación

## Fase 1 — Log Detection

```text
Docker
  ↓
Log Collector
  ↓
Exception Detector
  ↓
Incident JSON
```

Sin IA todavía.

---

## Fase 2 — AI Diagnosis

```text
Incident
  ↓
GPT
  ↓
Change Request .md
```

Validar calidad de los diagnósticos.

---

## Fase 3 — Local Code Agent

```text
Change Request
  ↓
Ollama
  ↓
Code Changes
  ↓
Tests
```

Todavía sin push automático.

---

## Fase 4 — Git Integration

```text
Tests
  ↓
Commit
  ↓
Push
```

---

## Fase 5 — Pull Request

```text
Push
  ↓
GPT
  ↓
PR
```

---

## Fase 6 — Review Loop

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

---

## Fase 7 — Hardening

Agregar:

- sandbox;
- permisos;
- secrets isolation;
- rate limits;
- incident deduplication;
- audit logs;
- métricas;
- retries;
- circuit breakers;
- policy engine;
- approval gates.

---

# 25. Decisiones pendientes

Antes de implementar el Code Agent se deben determinar:

- CPU del servidor Debian;
- RAM;
- GPU;
- VRAM;
- almacenamiento;
- carga actual de Docker;
- versión de Ollama;
- tamaño de los repositorios;
- lenguajes principales;
- framework principal;
- cantidad de repositorios;
- frecuencia esperada de incidentes.

La selección definitiva del modelo local dependerá de estos datos.

---

# 26. Objetivo final

El sistema debe evolucionar hacia:

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

El resultado esperado es un sistema **event-driven, auditable, human-in-the-loop y con separación entre diagnóstico cloud y ejecución local**.

La primera implementación debe priorizar seguridad y trazabilidad sobre autonomía completa.
