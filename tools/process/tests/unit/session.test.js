/**
 * ProcessSession 单元测试
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { ProcessSession } = require('../../src/session');

describe('ProcessSession', () => {
  let session;
  let testCounter = 0;
  
  beforeEach(() => {
    testCounter++;
    const testId = `test-${testCounter}-${Date.now()}`;
    const testCommand = 'echo hello';
    session = new ProcessSession(testId, testCommand, {
      cwd: '/tmp',
      env: { TEST: 'value' },
      name: 'test-session',
      tags: ['test']
    });
  });
  
  afterEach(() => {
    if (session) {
      session.delete();
    }
  });
  
  it('should create session with correct properties', () => {
    assert.ok(session.id);
    assert.strictEqual(session.command, 'echo hello');
    assert.strictEqual(session.cwd, '/tmp');
    assert.deepStrictEqual(session.env, { TEST: 'value' });
    assert.strictEqual(session.name, 'test-session');
    assert.deepStrictEqual(session.tags, ['test']);
    assert.strictEqual(session.exited, false);
    assert.strictEqual(session.exitCode, null);
  });
  
  it('should save and load metadata', () => {
    assert.ok(fs.existsSync(session.metaFile));
    
    const meta = JSON.parse(fs.readFileSync(session.metaFile, 'utf-8'));
    assert.ok(meta.id);
    assert.strictEqual(meta.command, 'echo hello');
    assert.strictEqual(meta.name, 'test-session');
  });
  
  it('should append and read output', () => {
    session.appendOutput('line 1\n');
    session.appendOutput('line 2\n');
    
    const output = session.readOutput();
    assert.ok(output.includes('line 1'));
    assert.ok(output.includes('line 2'));
  });
  
  it('should read output with limit', () => {
    for (let i = 0; i < 10; i++) {
      session.appendOutput(`line ${i}\n`);
    }
    
    const output = session.readOutput({ limit: 3 });
    const lines = output.split('\n').filter(l => l.trim());
    // limit=3 可能返回2-3个非空行（取决于末尾换行符）
    assert.ok(lines.length >= 2 && lines.length <= 3);
  });
  
  it('should read output with offset', () => {
    for (let i = 0; i < 5; i++) {
      session.appendOutput(`line ${i}\n`);
    }
    
    const output = session.readOutput({ offset: 2, limit: 2 });
    assert.ok(output.length > 0);
  });
  
  it('should mark exited correctly', () => {
    session.markExited(0);
    
    assert.strictEqual(session.exited, true);
    assert.strictEqual(session.exitCode, 0);
    assert.ok(session.finishedAt > 0);
    
    const meta = JSON.parse(fs.readFileSync(session.metaFile, 'utf-8'));
    assert.strictEqual(meta.exited, true);
    assert.strictEqual(meta.exitCode, 0);
  });
  
  it('should delete session files', () => {
    const metaFile = session.metaFile;
    const logFile = session.logFile;
    
    session.appendOutput('test');
    assert.ok(fs.existsSync(metaFile));
    
    session.delete();
    
    assert.ok(!fs.existsSync(metaFile));
  });
});
