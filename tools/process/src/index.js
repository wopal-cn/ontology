/**
 * @wopal/process - 独立的进程管理工具
 * 
 * 提供后台进程和交互式进程的管理能力
 */

const { ProcessManager } = require('./manager');
const { ProcessSession, SESSION_DIR, LOG_DIR, MAX_OUTPUT_SIZE } = require('./session');
const { ProcessRegistry } = require('./registry');
const { Executor } = require('./executor');
const { PtyExecutor } = require('./pty-executor');

module.exports = {
  ProcessManager,
  ProcessSession,
  ProcessRegistry,
  Executor,
  PtyExecutor,
  SESSION_DIR,
  LOG_DIR,
  MAX_OUTPUT_SIZE
};
