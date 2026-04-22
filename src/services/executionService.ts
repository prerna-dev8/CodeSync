import { v4 as uuidv4 } from 'uuid';
import Docker from 'dockerode';
import Execution from '../models/Execution';
import Session from '../models/Session';
import { Language, ExecutionState, IExecution } from '../types';
import { executeInSandbox } from './sandboxService';
import type { SandboxResult } from '../types';

const docker = new Docker();

interface ActiveExecution {
  executionId: string;
  containerId: string;
  timeout: NodeJS.Timeout;
}

const activeExecutions = new Map<string, ActiveExecution>();

export async function runExecution(
  sessionId: string,
  documentVersionId: string,
  language: Language,
  codeSnapshot: string,
  stdin: string = '',
  userId: string
): Promise<IExecution> {
  if (activeExecutions.has(sessionId)) {
    throw new Error('Only one execution allowed per session');
  }

  const session = await Session.findById(sessionId).populate('members.userId');
  if (!session) throw new Error('Session not found');

  const member = (session.members as any[]).find((m: any) => m.userId._id.toString() === userId);
  if (!member || !['owner', 'editor'].includes(member.role)) {
    throw new Error('Owner/Editor only');
  }

  const executionId = uuidv4();
  const execution = new Execution({
    executionId,
    sessionId,
    documentVersionId,
    language,
    codeSnapshot,
    stdin,
    state: 'running' as ExecutionState
  });
  await execution.save();

  const timeoutId = setTimeout(() => stopExecution(sessionId, executionId), 10000);
  const activeExec: ActiveExecution = {
    executionId,
    containerId: '',
    timeout: timeoutId
  };
  activeExecutions.set(sessionId, activeExec);

let sandboxResult: SandboxResult | null = null;
  try {
    sandboxResult = await executeInSandbox(language, codeSnapshot, stdin);
    if (sandboxResult !== null) {
      activeExec.containerId = sandboxResult.containerId;
    }

  } catch (error: any) {
    execution.stderr = error.message;
    execution.exitCode = 1;
    execution.state = 'failed' as ExecutionState;
  } finally {
    clearTimeout(timeoutId);
    activeExecutions.delete(sessionId);
  }

  if (sandboxResult !== null) {
    execution.stdout = sandboxResult.stdout;
    execution.stderr = sandboxResult.stderr || execution.stderr || '';
    execution.exitCode = sandboxResult.exitCode;
    execution.executionTimeMs = sandboxResult.executionTimeMs;
    execution.state = sandboxResult.executionTimeMs > 9000 ? 'timeout' as ExecutionState : 'completed' as ExecutionState;
    await execution.save();
  }

  return execution;
}

export async function stopExecution(sessionId: string, executionId: string): Promise<void> {
  const activeExec = activeExecutions.get(sessionId);
  if (!activeExec) return;

  if (activeExec.containerId) {
    try {
      const container = docker.getContainer(activeExec.containerId);
      await container.kill();
    } catch (error) {
      console.warn('Container kill failed:', error);
    }
  }

  clearTimeout(activeExec.timeout);
  activeExecutions.delete(sessionId);

  await Execution.findOneAndUpdate(
    { executionId, sessionId },
    { state: 'stopped' as ExecutionState }
  );
}

export async function getActiveExecution(sessionId: string): Promise<IExecution | null> {
  return Execution.findOne({ 
    sessionId, 
    state: { $in: ['queued', 'running'] } 
  }).sort({ createdAt: -1 });
}

export async function getSessionExecutions(sessionId: string, limit = 20): Promise<IExecution[]> {
  return Execution.find({ sessionId })
    .sort({ createdAt: -1 })
    .limit(limit);
}

