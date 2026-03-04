/**
 * ProcessSession - 会话对象
 * 
 * 管理单个进程会话的状态和输出
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSION_DIR = path.join(os.tmpdir(), 'agent_sessions');
const LOG_DIR = path.join(os.tmpdir(), 'agent_logs');
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024; // 10MB

fs.mkdirSync(SESSION_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

class ProcessSession {
  constructor(id, command, options = {}) {
    this.id = id;
    this.command = command;
    this.cwd = options.cwd || process.cwd();
    this.env = options.env || {};
    this.name = options.name || null;
    this.tags = options.tags || [];
    this.startedAt = Date.now();
    this.finishedAt = null;
    this.exited = false;
    this.exitCode = null;
    this.backgrounded = true;
    this.truncated = false;
    this.pty = options.pty || false;
    
    this.logFile = path.join(LOG_DIR, `${id}.log`);
    this.metaFile = path.join(SESSION_DIR, `${id}.json`);
    
    this.saveMeta();
  }
  
  saveMeta() {
    fs.writeFileSync(this.metaFile, JSON.stringify({
      id: this.id,
      command: this.command,
      cwd: this.cwd,
      env: this.env,
      name: this.name,
      tags: this.tags,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      exited: this.exited,
      exitCode: this.exitCode,
      backgrounded: this.backgrounded,
      truncated: this.truncated,
      pty: this.pty
    }, null, 2));
  }
  
  appendOutput(chunk) {
    fs.appendFileSync(this.logFile, chunk);
    
    try {
      const stats = fs.statSync(this.logFile);
      if (stats.size > MAX_OUTPUT_SIZE) {
        this.truncated = true;
        const tail = this.readOutput({ limit: 1000 });
        fs.writeFileSync(this.logFile, '[TRUNCATED]\n' + tail);
        this.saveMeta();
      }
    } catch (err) {
      // 文件还未创建，忽略
    }
  }
  
  readOutput(options = {}) {
    const limit = options.limit || 200;
    const offset = options.offset || 0;
    
    if (!fs.existsSync(this.logFile)) return '';
    
    const content = fs.readFileSync(this.logFile, 'utf-8');
    const lines = content.split('\n');
    
    if (offset > 0) {
      return lines.slice(offset, offset + limit).join('\n');
    } else {
      return lines.slice(-limit).join('\n');
    }
  }
  
  markExited(code) {
    this.exited = true;
    this.exitCode = code;
    this.finishedAt = Date.now();
    this.saveMeta();
  }
  
  delete() {
    if (fs.existsSync(this.metaFile)) fs.unlinkSync(this.metaFile);
    if (fs.existsSync(this.logFile)) fs.unlinkSync(this.logFile);
  }
}

module.exports = {
  ProcessSession,
  SESSION_DIR,
  LOG_DIR,
  MAX_OUTPUT_SIZE
};
