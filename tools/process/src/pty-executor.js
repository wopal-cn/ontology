/**
 * PtyExecutor - PTY 进程执行器
 * 
 * 使用 node-pty 执行交互式进程
 */

let pty = null;

try {
  pty = require('node-pty');
} catch (err) {
  console.warn('node-pty not available, PTY mode disabled');
}

class PtyExecutor {
  constructor(session) {
    this.session = session;
    this.ptyProcess = null;
    this.available = pty !== null;
  }
  
  isAvailable() {
    return this.available;
  }
  
  start() {
    if (!this.available) {
      throw new Error('node-pty is not installed. PTY mode unavailable.');
    }
    
    try {
      this.ptyProcess = pty.spawn('zsh', ['-c', this.session.command], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: this.session.cwd,
        env: { ...process.env, ...this.session.env }
      });
      
      this.ptyProcess.onData((data) => {
        this.session.appendOutput(data);
      });
      
      this.ptyProcess.onExit(({ exitCode }) => {
        this.session.markExited(exitCode);
      });
      
      return this.ptyProcess.pid;
    } catch (err) {
      this.available = false;
      throw new Error(`PTY spawn failed: ${err.message}`);
    }
  }
  
  write(data) {
    if (this.ptyProcess) {
      this.ptyProcess.write(data);
      return true;
    }
    return false;
  }
  
  resize(cols, rows) {
    if (this.ptyProcess) {
      this.ptyProcess.resize(cols, rows);
      return true;
    }
    return false;
  }
  
  kill(signal = 'SIGTERM') {
    if (this.ptyProcess) {
      try {
        this.ptyProcess.kill(signal);
        return true;
      } catch (err) {
        return false;
      }
    }
    return false;
  }
  
  getPid() {
    return this.ptyProcess ? this.ptyProcess.pid : null;
  }
}

module.exports = { PtyExecutor };
