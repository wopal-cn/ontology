/**
 * ProcessManager - 统一的进程管理 API
 * 
 * 提供简洁的接口管理后台进程
 */

const { ProcessSession } = require('./session');
const { ProcessRegistry } = require('./registry');
const { Executor } = require('./executor');
const { PtyExecutor } = require('./pty-executor');

class ProcessManager {
  constructor() {
    this.executors = new Map();
  }
  
  start(command, options = {}) {
    const id = `${process.pid}-${Date.now()}`;
    const session = new ProcessSession(id, command, options);
    
    let executor;
    if (options.pty) {
      executor = new PtyExecutor(session);
      if (!executor.isAvailable()) {
        executor = new Executor(session);
        session.pty = false;
        session.saveMeta();
      } else {
        try {
          executor.start();
        } catch (err) {
          executor = new Executor(session);
          session.pty = false;
          session.saveMeta();
          executor.start();
        }
      }
    } else {
      executor = new Executor(session);
      executor.start();
    }
    
    this.executors.set(id, { session, executor });
    
    return id;
  }
  
  poll(sessionId) {
    const session = ProcessRegistry.getSession(sessionId);
    if (!session) {
      return null;
    }
    
    return {
      running: !session.exited,
      exitCode: session.exitCode,
      output: session.readOutput({ limit: 10 })
    };
  }
  
  log(sessionId, options = {}) {
    const session = ProcessRegistry.getSession(sessionId);
    if (!session) {
      return null;
    }
    
    return session.readOutput(options);
  }
  
  write(sessionId, data) {
    const executorInfo = this.executors.get(sessionId);
    if (executorInfo && executorInfo.executor && executorInfo.executor.write) {
      return executorInfo.executor.write(data);
    }
    console.warn('write() is only supported in PTY mode');
    return false;
  }
  
  resize(sessionId, cols, rows) {
    const executorInfo = this.executors.get(sessionId);
    if (executorInfo && executorInfo.executor && executorInfo.executor.resize) {
      return executorInfo.executor.resize(cols, rows);
    }
    return false;
  }
  
  kill(sessionId, signal = 'SIGTERM') {
    const executorInfo = this.executors.get(sessionId);
    if (executorInfo && executorInfo.executor) {
      return executorInfo.executor.kill(signal);
    }
    
    const session = ProcessRegistry.getSession(sessionId);
    if (session && !session.exited) {
      try {
        const pid = parseInt(sessionId.split('-')[0]);
        process.kill(pid, signal);
        return true;
      } catch (err) {
        return false;
      }
    }
    
    return false;
  }
  
  clear(sessionId) {
    const session = ProcessRegistry.getSession(sessionId);
    if (session && session.exited) {
      return ProcessRegistry.deleteSession(sessionId);
    }
    return false;
  }
  
  remove(sessionId) {
    const session = ProcessRegistry.getSession(sessionId);
    if (!session) {
      return false;
    }
    
    if (!session.exited) {
      this.kill(sessionId);
      setTimeout(() => {
        ProcessRegistry.deleteSession(sessionId);
      }, 100);
    } else {
      ProcessRegistry.deleteSession(sessionId);
    }
    
    return true;
  }
  
  list(filter = 'all') {
    switch (filter) {
      case 'running':
        return ProcessRegistry.listRunning();
      case 'finished':
        return ProcessRegistry.listFinished();
      default:
        return ProcessRegistry.listAll();
    }
  }
}

module.exports = { ProcessManager };
