/**
 * CLI - 命令行接口
 * 
 * 提供用户友好的命令行工具
 */

const { ProcessManager } = require('./manager');

function printUsage() {
  console.log('Usage: process-adapter <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  start <cmd> [options]    Start background process');
  console.log('  list [filter]            List sessions (all/running/finished)');
  console.log('  log <id> [options]       View session log');
  console.log('  poll <id>                Check session status');
  console.log('  write <id> <data>        Send input to PTY session');
  console.log('  kill <id>                Terminate session');
  console.log('  clear <id>               Clear finished session');
  console.log('  remove <id>              Kill or clear session');
  console.log('');
  console.log('Options for start:');
  console.log('  --cwd <dir>              Working directory');
  console.log('  --env <key=value>        Environment variable (can repeat)');
  console.log('  --name <name>            Session name');
  console.log('  --pty                    Enable PTY mode (interactive)');
  console.log('');
  console.log('Options for log:');
  console.log('  --limit <n>              Show last N lines (default: 200)');
  console.log('  --offset <n>             Start from line N');
}

function parseArgs(args) {
  const options = {};
  const positional = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      
      if (key === 'pty') {
        options.pty = true;
      } else {
        const value = args[++i];
        
        if (key === 'env') {
          if (!options.env) options.env = {};
          const [k, v] = value.split('=');
          options.env[k] = v;
        } else {
          options[key] = value;
        }
      }
    } else {
      positional.push(arg);
    }
  }
  
  return { options, positional };
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }
  
  const manager = new ProcessManager();
  const command = args[0];
  
  switch (command) {
    case 'start': {
      const { options, positional } = parseArgs(args.slice(1));
      const cmd = positional.join(' ');
      
      if (!cmd) {
        console.error('Error: command is required');
        process.exit(1);
      }
      
      const id = manager.start(cmd, {
        cwd: options.cwd,
        env: options.env,
        name: options.name,
        pty: options.pty
      });
      
      console.log('Started session:', id);
      
      // 检查实际的PTY状态（可能已降级）
      const status = manager.poll(id);
      if (status) {
        const session = manager.list().find(s => s.id === id);
        if (session && session.pty) {
          console.log('PTY mode enabled');
        } else if (options.pty) {
          console.log('Warning: PTY mode requested but fell back to normal mode');
        }
      }
      break;
    }
    
    case 'list': {
      const filter = args[1] || 'all';
      const sessions = manager.list(filter);
      
      console.log(`Sessions (${filter}):`);
      if (sessions.length === 0) {
        console.log('  (none)');
      } else {
        sessions.forEach(s => {
          const status = s.exited ? `exited(${s.exitCode})` : 'running';
          const name = s.name ? ` [${s.name}]` : '';
          console.log(`  [${s.id}]${name} ${s.command} (${status})`);
        });
      }
      break;
    }
    
    case 'log': {
      const sessionId = args[1];
      const { options } = parseArgs(args.slice(2));
      
      if (!sessionId) {
        console.error('Error: session ID is required');
        process.exit(1);
      }
      
      const output = manager.log(sessionId, {
        limit: parseInt(options.limit) || 200,
        offset: parseInt(options.offset) || 0
      });
      
      if (output === null) {
        console.error('Error: session not found');
        process.exit(1);
      }
      
      console.log(output);
      break;
    }
    
    case 'poll': {
      const sessionId = args[1];
      
      if (!sessionId) {
        console.error('Error: session ID is required');
        process.exit(1);
      }
      
      const status = manager.poll(sessionId);
      
      if (!status) {
        console.error('Error: session not found');
        process.exit(1);
      }
      
      console.log('Status:', status.running ? 'running' : 'completed');
      console.log('Exit code:', status.exitCode);
      console.log('\nRecent output:');
      console.log(status.output);
      break;
    }
    
    case 'kill': {
      const sessionId = args[1];
      
      if (!sessionId) {
        console.error('Error: session ID is required');
        process.exit(1);
      }
      
      const success = manager.kill(sessionId);
      
      if (success) {
        console.log('Session terminated:', sessionId);
      } else {
        console.error('Failed to kill session');
        process.exit(1);
      }
      break;
    }
    
    case 'write': {
      const sessionId = args[1];
      const data = args.slice(2).join(' ');
      
      if (!sessionId) {
        console.error('Error: session ID is required');
        process.exit(1);
      }
      
      if (!data) {
        console.error('Error: data is required');
        process.exit(1);
      }
      
      const success = manager.write(sessionId, data);
      
      if (success) {
        console.log('Input sent to session:', sessionId);
      } else {
        console.error('Failed to send input (session not found or not PTY mode)');
        process.exit(1);
      }
      break;
    }
    
    case 'clear': {
      const sessionId = args[1];
      
      if (!sessionId) {
        console.error('Error: session ID is required');
        process.exit(1);
      }
      
      const success = manager.clear(sessionId);
      
      if (success) {
        console.log('Session cleared:', sessionId);
      } else {
        console.error('Failed to clear session (not finished or not found)');
        process.exit(1);
      }
      break;
    }
    
    case 'remove': {
      const sessionId = args[1];
      
      if (!sessionId) {
        console.error('Error: session ID is required');
        process.exit(1);
      }
      
      const success = manager.remove(sessionId);
      
      if (success) {
        console.log('Session removed:', sessionId);
      } else {
        console.error('Failed to remove session');
        process.exit(1);
      }
      break;
    }
    
    default:
      console.error('Unknown command:', command);
      printUsage();
      process.exit(1);
  }
}

module.exports = { main };
