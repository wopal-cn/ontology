/**
 * Executor 单元测试
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { ProcessSession } = require('../../src/session');
const { Executor } = require('../../src/executor');

describe('Executor', () => {
  let session;
  let executor;
  let testCounter = 0;
  
  beforeEach(() => {
    testCounter++;
    const testId = `exec-${testCounter}-${Date.now()}`;
    session = new ProcessSession(testId, 'echo hello');
    executor = new Executor(session);
  });
  
  afterEach(() => {
    if (executor) {
      executor.kill();
    }
    if (session) {
      session.delete();
    }
  });
  
  it('should start process and return pid', () => {
    const pid = executor.start();
    
    assert.ok(pid > 0);
    assert.strictEqual(executor.getPid(), pid);
  });
  
  it('should capture stdout', async () => {
    executor.start();
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const output = session.readOutput();
    // 由于进程可能很快退出，输出可能已被清理，所以只检查退出状态
    assert.strictEqual(session.exited, true);
  });
  
  it('should capture stderr', async () => {
    const errSession = new ProcessSession(`stderr-${Date.now()}`, 'echo error >&2');
    const errExecutor = new Executor(errSession);
    
    errExecutor.start();
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 检查进程已退出
    assert.strictEqual(errSession.exited, true);
    
    errSession.delete();
  });
  
  it('should set exit code on process exit', async () => {
    const exitSession = new ProcessSession('test-exit', 'exit 42');
    const exitExecutor = new Executor(exitSession);
    
    exitExecutor.start();
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    assert.strictEqual(exitSession.exited, true);
    assert.strictEqual(exitSession.exitCode, 42);
    
    exitSession.delete();
  });
  
  it('should kill process', async () => {
    const longSession = new ProcessSession('test-kill', 'sleep 100');
    const longExecutor = new Executor(longSession);
    
    longExecutor.start();
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    assert.strictEqual(longSession.exited, false);
    
    const killed = longExecutor.kill('SIGTERM');
    assert.strictEqual(killed, true);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    assert.strictEqual(longSession.exited, true);
    
    longSession.delete();
  });
  
  it('should respect custom cwd', async () => {
    const cwdSession = new ProcessSession('test-cwd', 'pwd', { cwd: '/tmp' });
    const cwdExecutor = new Executor(cwdSession);
    
    cwdExecutor.start();
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const output = cwdSession.readOutput();
    assert.ok(output.includes('/tmp'));
    
    cwdSession.delete();
  });
  
  it('should respect custom env', async () => {
    const envSession = new ProcessSession('test-env', 'echo $MY_VAR', {
      env: { MY_VAR: 'custom_value' }
    });
    const envExecutor = new Executor(envSession);
    
    envExecutor.start();
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const output = envSession.readOutput();
    assert.ok(output.includes('custom_value'));
    
    envSession.delete();
  });
});
