const { spawn } = require('child_process');
const path = require('path');

console.log('=== Starting Helmet Detection & E-Challan System ===');


let pythonCmd = 'python';
try {
  const { execSync } = require('child_process');
  execSync('python --version', { stdio: 'ignore' });
} catch (e) {
  try {
    const { execSync } = require('child_process');
    execSync('py --version', { stdio: 'ignore' });
    pythonCmd = 'py';
  } catch (e2) {
    console.warn('WARNING: Python was not found in PATH. Backend might fail to start.');
  }
}


const backendPath = path.join(__dirname, 'backend');
console.log(`Starting FastAPI Backend on http://localhost:8000 using ${pythonCmd}...`);
const backend = spawn(pythonCmd, ['main.py'], { cwd: backendPath, shell: true });


const frontendPath = path.join(__dirname, 'frontend');
console.log('Starting Vite Frontend on http://localhost:5173...');
const frontend = spawn('npm', ['run', 'dev'], { cwd: frontendPath, shell: true });


const logOutput = (prefix, data) => {
  const lines = data.toString().split('\n');
  lines.forEach(line => {
    if (line.trim()) {
      console.log(`[${prefix}] ${line}`);
    }
  });
};

backend.stdout.on('data', (data) => logOutput('Backend', data));
backend.stderr.on('data', (data) => logOutput('Backend-Err', data));

frontend.stdout.on('data', (data) => logOutput('Frontend', data));
frontend.stderr.on('data', (data) => logOutput('Frontend-Err', data));


const cleanup = () => {
  console.log('\nShutting down servers...');
  backend.kill();
  frontend.kill();
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

backend.on('close', (code) => {
  console.log(`Backend process exited with code ${code}`);
  cleanup();
});

frontend.on('close', (code) => {
  console.log(`Frontend process exited with code ${code}`);
  cleanup();
});
