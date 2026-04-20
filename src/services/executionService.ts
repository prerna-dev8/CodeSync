import { v4 as uuidv4 } from 'uuid';
import Execution from '../models/Execution';
import Session from '../models/Session';
import { Language, ExecutionState, IExecution, ISession } from '../types';
import { executeInSandbox } from './sandboxService';
import User from '../models/User';

interface ActiveExecution {
  executionId: string;
  containerId: string;
  timeout: NodeJS.Timeout;
}

const activeExecutions = new Map<string, ActiveExecution>(); // sessionId → execution

export async function runExecution(
  sessionId: string,
  documentVersionId: string,
  language: Language,
  codeSnapshot: string,
  stdin: string = '',
  userId: string
): Promise<IExecution> {
  // 1. Check single execution rule
  if (activeExecutions.has(sessionId)) {
    throw new Error('Only one execution allowed per session');
  }

  // 2. Validate auth/role
  const session = await Session.findById(sessionId).populate('members.userId', 'role');
  if (!session) throw new Error('Session not found');
  
  const member = session.members.find(m => m.userId._id.toString() === userId);
  if (!member || !['owner', 'editor'].includes(member.role)) {
    throw new Error('Owner/Editor only');
  }

  // 3. Create execution record
  const executionId = uuidv4();
  const execution = new Execution({
    executionId,
    sessionId,
    documentVersionId,
    language,
    codeSnapshot,
    stdin,
    state: 'running'
  });
  await execution.save();

  // 4. Snapshot captured - immutable execution starts
  const activeExec = activeExecutions.get(sessionId)!;
  activeExecutions.set(sessionId, {
    executionId,
    containerId: 'temp', // Set after sandbox
    timeout: setTimeout(() => stopExecution(sessionId, executionId), 11000)
  });

  // 5. Execute in sandbox
  try {
    const result = await executeInSandbox(language, codeSnapshot, stdin);
    
    execution.stdout = result.stdout;
    execution.stderr = result.stderr;
    execution.exitCode = result.exitCode;
    execution.executionTimeMs = result.executionTimeMs;
    execution.state = result.executionTimeMs > 10000 ? 'timeout' : 'completed';
  } catch (error: any) {
    execution.stderr = error.message;
    execution.exitCode = 1;
    execution.state = 'failed';
  } finally {
    // Cleanup
    clearTimeout(activeExec.timeout);
    activeExecutions.delete(sessionId);
    await execution.save();
  }

  return execution;
}

export async function stopExecution(sessionId: string, executionId: string): Promise<void> {
  const activeExec = activeExecutions.get(sessionId);
  if (!activeExec) return;

  // Kill container (sandboxService handles)
  // For now, simulate
  clearTimeout(activeExec.timeout);
  activeExecutions.delete(sessionId);

  const execution = await Execution.findOneAndUpdate(
    { executionId, sessionId },
    { state: 'stopped' },
    { new: true }
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

