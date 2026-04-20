import { Request, Response, NextFunction } from 'express';
import * as executionService from '../services/executionService';
import { Language } from '../types';
import Execution from '../models/Execution';

export const runExecution = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { sessionId, documentVersionId, language, stdin } = req.body as {
      sessionId: string;
      documentVersionId: string;
      language: Language;
      stdin?: string;
    };

    const userId = (req as any).user._id.toString();

    const execution = await executionService.runExecution(
      sessionId,
      documentVersionId,
      language,
      req.body.codeSnapshot,
      stdin || '',
      userId
    );

    res.json({
      executionId: execution.executionId,
      state: execution.state
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const stopExecution = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { sessionId, executionId } = req.params;
    await executionService.stopExecution(sessionId, executionId);
    res.json({ message: 'Execution stopped' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const getSessionExecutions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const executions = await Execution.find({ sessionId: req.params.sessionId })
      .sort({ createdAt: -1 })
      .limit(20);
    
    res.json(executions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const getActiveExecution = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const execution = await executionService.getActiveExecution(req.params.sessionId);
    res.json(execution || null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

