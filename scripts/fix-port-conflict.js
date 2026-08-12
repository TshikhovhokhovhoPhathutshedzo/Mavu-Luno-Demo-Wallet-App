// Script to fix port conflicts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function fixPortConflict(port = 3000) {
  console.log(`🔧 Fixing port ${port} conflict...\n`);
  
  try {
    // Find processes using the port
    console.log('1. Finding processes using port', port);
    const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
    
    if (!stdout.trim()) {
      console.log(`✅ Port ${port} is already free!`);
      return;
    }
    
    console.log('Found processes using the port:');
    console.log(stdout);
    
    // Extract PIDs
    const lines = stdout.trim().split('\n');
    const pids = new Set();
    
    lines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(pid)) {
          pids.add(pid);
        }
      }
    });
    
    if (pids.size === 0) {
      console.log('❌ No valid PIDs found');
      return;
    }
    
    console.log(`\n2. Killing processes: ${Array.from(pids).join(', ')}`);
    
    // Kill each process
    for (const pid of pids) {
      try {
        await execAsync(`taskkill /PID ${pid} /F`);
        console.log(`✅ Killed process ${pid}`);
      } catch (error) {
        console.log(`⚠️  Could not kill process ${pid}: ${error.message}`);
      }
    }
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verify port is free
    console.log('\n3. Verifying port is free...');
    const { stdout: verifyOutput } = await execAsync(`netstat -ano | findstr :${port}`);
    
    if (!verifyOutput.trim()) {
      console.log(`✅ Port ${port} is now free!`);
    } else {
      console.log(`⚠️  Port ${port} may still be in use:`);
      console.log(verifyOutput);
    }
    
  } catch (error) {
    console.error('❌ Error fixing port conflict:', error.message);
  }
}

// Get port from command line argument or use default
const port = process.argv[2] || 3000;
fixPortConflict(parseInt(port));
