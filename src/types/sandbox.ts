export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  containerId: string;
}

