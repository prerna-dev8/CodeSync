import Docker from 'dockerode';
import { Language } from '../types';
export type { SandboxResult } from '../types/sandbox';


const docker = new Docker();

const langImages: Record<Language, string> = {
  cpp: 'gcc:13',
  c: 'gcc:13',
  python: 'python:3.11-slim',
  javascript: 'node:20-slim'
};

// SandboxResult interface moved to types/sandbox.ts

import type { SandboxResult } from '../types/sandbox';

export async function executeInSandbox(language: Language, code: string, stdin: string = ''): Promise<SandboxResult> {

  const startTime = Date.now();
  const safeCode = Buffer.from(code).toString('base64');
  const fileExt = language === 'javascript' ? 'js' : language;
  const fileName = `/tmp/code.${fileExt}`;

  const cmd: string[] = ['sh', '-c', `echo ${safeCode} | base64 -d > ${fileName} && timeout 8s ${language === 'javascript' ? 'node' : language} ${fileName} && rm -f ${fileName}`];

  const container = await docker.createContainer({
    Image: langImages[language],
    Tty: false,
    OpenStdin: true,
    HostConfig: {
      NetworkMode: 'none',
      Memory: 128 * 1024 * 1024,
      NanoCpus: 500000000,
      PidsLimit: 128,
      AutoRemove: true,
      Tmpfs: { '/tmp': 'rw,noexec,nosuid,size=32m' },
      ReadonlyRootfs: true,
      SecurityOpt: ['no-new-privileges:true']
    },
    StopTimeout: 5
  });

  let stdout = '';
  let stderr = '';

  try {
    await container.start();

    const exec = await container.exec({
      Cmd: cmd,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true
    });

    const execStream = await exec.start({ Detach: false });
    if (stdin) {
      (execStream as any).write(stdin);
      (execStream as any).end();
    }

    const chunks: Buffer[] = [];
    execStream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    await new Promise<void>((resolve, reject) => {
      execStream.on('end', resolve);
      setTimeout(() => reject(new Error('Exec timeout')), 10000);
    });

    const inspect = await exec.inspect();
    stdout = Buffer.concat(chunks).toString('utf8');
    const exitCode = inspect.ExitCode || 0;

    return {
      stdout,
      stderr,
      exitCode,
      executionTimeMs: Date.now() - startTime,
      containerId: container.id!
    };
  } catch (error: any) {
    stderr = error.message;
    return {
      stdout,
      stderr,
      exitCode: 1,
      executionTimeMs: Date.now() - startTime,
      containerId: container.id!
    };
  } finally {
    try {
      await container.kill();
    } catch (e) {}
  }
}

