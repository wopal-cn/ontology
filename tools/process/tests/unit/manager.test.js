/**
 * ProcessManager 单元测试
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { ProcessManager } = require('../../src/manager');

describe('ProcessManager', () => {
  let manager;
  let testCounter = 0;
  
  beforeEach(() => {
    testCounter++;
    manager = new ProcessManager();
  });
  
  afterEach(async () => {
    // 清理时间延长
    await new Promise(resolve => setTimeout(resolve, 50));
    const sessions = manager.list('all');
    for (const s of sessions) {
      try {
        manager.remove(s.id);
      } catch (err) {
        // 忽略清理错误
      }
    }
  });
  
  it('should start process and return session id', () => {
    const id = manager.start('echo test');
    
    assert.ok(id);
    assert.ok(typeof id === 'string');
  });
  
  it('should poll session status', async () => {
    const id = manager.start('echo test');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const status = manager.poll(id);
    
    assert.ok(status);
    assert.strictEqual(status.running, false);
    assert.strictEqual(status.exitCode, 0);
    assert.ok(status.output.includes('test'));
  });
  
  it('should return null for non-existent session', () => {
    const status = manager.poll('non-existent');
    assert.strictEqual(status, null);
  });
  
  it('should read session log', async () => {
    const id = manager.start('echo "line 1" && echo "line 2"');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const log = manager.log(id);
    
    assert.ok(log.includes('line 1'));
    assert.ok(log.includes('line 2'));
  });
  
  it('should read log with options', async () => {
    const id = manager.start('for i in {1..5}; do echo "line $i"; done');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const log = manager.log(id, { limit: 2 });
    const lines = log.split('\n').filter(l => l);
    
    assert.strictEqual(lines.length, 2);
  });
  
  it('should kill running session', async () => {
    const id = manager.start('sleep 10');
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const killed = manager.kill(id);
    
    assert.strictEqual(killed, true);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const status = manager.poll(id);
    assert.strictEqual(status.running, false);
  });
  
  it('should clear finished session', async () => {
    const id = manager.start('exit 0');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const cleared = manager.clear(id);
    
    assert.strictEqual(cleared, true);
    assert.strictEqual(manager.poll(id), null);
  });
  
  it('should not clear running session', async () => {
    const id = manager.start('sleep 10');
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const cleared = manager.clear(id);
    
    assert.strictEqual(cleared, false);
    
    manager.kill(id);
  });
  
  it('should remove running session', async () => {
    const id = manager.start('sleep 10');
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const removed = manager.remove(id);
    
    assert.strictEqual(removed, true);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    assert.strictEqual(manager.poll(id), null);
  });
  
  it('should remove finished session', async () => {
    const id = manager.start('exit 0');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const removed = manager.remove(id);
    
    assert.strictEqual(removed, true);
    assert.strictEqual(manager.poll(id), null);
  });
  
  it('should list sessions with filter', async () => {
    const id1 = manager.start('sleep 10');
    const id2 = manager.start('exit 0');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const all = manager.list('all');
    const running = manager.list('running');
    const finished = manager.list('finished');
    
    assert.ok(all.length >= 2);
    assert.ok(running.some(s => s.id === id1));
    assert.ok(finished.some(s => s.id === id2));
    
    manager.kill(id1);
  });
  
  it('should respect start options', async () => {
    const id = manager.start('echo $PWD', {
      cwd: '/tmp',
      name: 'test-session'
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const sessions = manager.list('all');
    const session = sessions.find(s => s.id === id);
    
    assert.ok(session);
    assert.strictEqual(session.name, 'test-session');
    assert.strictEqual(session.cwd, '/tmp');
  });
  
  it('should handle PTY mode fallback gracefully', async () => {
    const id = manager.start('echo test', { pty: true });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const status = manager.poll(id);
    
    assert.ok(status);
    assert.strictEqual(status.running, false);
    assert.strictEqual(status.exitCode, 0);
  });
});
