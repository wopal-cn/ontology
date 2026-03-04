/**
 * Executor - 普通进程执行器
 * 
 * 使用 Node.js spawn 执行后台进程
 */

const { spawn } = require('child_process');

class Executor {
  constructor(session) {
    this.session = session;
    this.child = null;
  }
  
  start() {
    this.child = spawn('zsh', ['-c', this.session.command], {
      cwd: this.session.cwd,
      env: { ...process.env, ...this.session.env },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    this.child.stdout.on('data', (data) => {
      this.session.appendOutput(data);
    });
    
    this.child.stderr.on('data', (data) => {
      this.session.appendOutput(data);
    });
    
    this.child.on('exit', (code) => {
      this.session.markExited(code !== null ? code : -1);
    });
    
    this.child.unref();
    
    return this.child.pid;
  }
  
  kill(signal = 'SIGTERM') {
    if (this.child && this.child.pid) {
      try {
        process.kill(-this.child.pid, signal);
        return true;
      } catch (err) {
        return false;
      }
    }
    return false;
  }
  
  getPid() {
    return this.child ? this.child.pid : null;
  }
}

module.exports = { Executor };
