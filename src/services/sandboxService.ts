import Docker from 'dockerode';
import { Language, ExecutionState } from '../types';
import stream from 'stream/promises';
import { promisify } from 'util';

const docker = new Docker();

const langImages: Record<Language, string> = {
  cpp: 'gcc:13',
  c: 'gcc:13',
  python: 'python:3.11-slim',
  javascript: 'node:20-slim'
};

export async function executeInSandbox(language: Language, code: string, stdin: string = ''): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
}> {
  const startTime = Date.now();
  
  const container = await docker.createContainer({
    Image: langImages[language],
    Cmd: getCmd(language, code),
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    HostConfig: {
      NetworkMode: 'none',
      Memory: 256 * 1024 * 1024, // 256MB
      NanoCpus: 1000000000, // 1 CPU
      PidsLimit: 256,
      AutoRemove: true
    },
    StopTimeout: 10
  });

  try {
    await container.start();
    
    // Stream stdin
    const stdinStream = await container.attach({ stream: true, stdin: true, stdout: false, stderr: false });
    stdinStream.write(stdin);
    stdinStream.end();

    // Get logs with timeout
    const exec = await container.exec({
      Cmd: ['sh', '-c', 'timeout 10s ' + getCmd(language, code).join(' ')],
      AttachStdout: true,
      AttachStderr: true
    });
    
    const result = await exec.start({ Detach: false });
    
    const chunks: Buffer[] = [];
    result.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Execution timeout')), 11000)
    );
    
    const execResult = await Promise.race([
      new Promise((resolve) => {
        result.on('end', () => resolve(chunks));
      }),
      timeoutPromise
    ]);
    
    const output = Buffer.concat(chunks).toString();
    const { stdout, stderr } = parseOutput(output);
    
    const inspect = await container.inspect();
    const exitCode = inspect.State.ExitCode || 0;
    
    return {
      stdout,
      stderr,
      exitCode,
      executionTimeMs: Date.now() - startTime
    };
  } finally {
    try {
      await container.kill();
      await container.remove({ force: true });
    } catch {}
  }
}

function getCmd(language: Language, code: string): string[] {
  const fileName = `/tmp/code.${language === 'javascript' ? 'js' : language}`;
  return ['sh', '-c', `
echo "${escapeCode(code)}" > ${fileName} &&
timeout 10s ${language === 'javascript' ? 'node' : language} ${fileName} &&
rm ${fileName}
  `];
}

function escapeCode(code: string): string {
  return code.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function parseOutput(output: string): { stdout: string; stderr: string } {
  // Simple parse - improve based on lang output format
  const lines = output.split('\n');
  return { stdout: lines.slice(0, -1).join('\n'), stderr: '' };
}

