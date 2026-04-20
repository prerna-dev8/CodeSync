# Secure Code Execution System Implementation Plan

## Information Gathered
- No existing execution/sandbox (0 matches)
- Auth/sessions/Yjs ready for integration
- Yjs deps present (y-mongodb-provider for doc snapshots)
- Docker deps missing (dockerode needed)
- Coverage: auth 92%, sessions/Yjs partial

## Plan (File Level)
**1. Models & Types**
- `src/models/Execution.ts` (executionId, sessionId, versionId, code/language/stdin/output/state)
- `src/types/index.ts` (+ IExecution, ExecutionState enum)

**2. Sandbox Engine**
- `src/services/sandboxService.ts` (dockerode containers, lang images: gcc/python/node)
- `src/docker/Dockerfile.sandbox` (multi-lang base, timeouts)

**3. Execution Service**
- `src/services/executionService.ts` (queue/validate/run/stop, snapshot capture)

**4. Controllers & Routes**
- `src/controllers/executionController.ts` (run/stop)
- `src/routes/execution.ts` (protect + role check)

**5. Socket Integration**
- `src/sockets/executionEvents.ts` (broadcast started/completed/failed/stopped)

**6. Server Integration**
- `src/server.ts` (+ execution routes, socket namespace)

**7. Tests (100% coverage)**
- `src/__tests__/executionService.test.ts` (unit)
- `src/__tests__/sandbox.test.ts` (docker mock)
- `src/__tests__/execution.integration.test.ts` (Supertest + docker)

## Dependent Files
- Update `src/server.ts`, `src/types/index.ts`, `package.json` (+dockerode @types/dockerode)
- `src/services/sessionService.ts` (+ getSnapshot)

## Follow-up Steps
1. Install deps (`dockerode`)
2. Build/test sandbox
3. `npm test` (full coverage)
4. Docker compose for prod

**Confirm plan before implementation?**
