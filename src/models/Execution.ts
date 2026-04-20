import mongoose, { Schema, model, Document } from 'mongoose';
import { IExecution, Language, ExecutionState } from '../types';

const executionSchema = new Schema<IExecution>({
  executionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  documentVersionId: {
    type: String,
    required: true
  },
  language: {
    type: String,
    enum: ['cpp', 'c', 'python', 'javascript'] as const,
    required: true
  },
  codeSnapshot: {
    type: String,
    required: true
  },
  stdin: {
    type: String,
    default: ''
  },
  stdout: {
    type: String,
    default: ''
  },
  stderr: {
    type: String,
    default: ''
  },
  exitCode: {
    type: Number,
    default: 0
  },
  executionTimeMs: {
    type: Number,
    default: 0
  },
  state: {
    type: String,
    enum: ['queued', 'running', 'completed', 'failed', 'timeout', 'stopped'],
    default: 'queued'
  }
}, {
  timestamps: true
});

export default model<IExecution & Document>('Execution', executionSchema);

