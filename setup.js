const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== Starting Setup for Helmet Detection & E-Challan System ===\n');

// 1. Install Frontend Dependencies
console.log('Step 1: Installing Frontend dependencies...');
try {
  execSync('npm install', { cwd: path.join(__dirname, 'frontend'), stdio: 'inherit' });
  console.log('Frontend setup completed successfully!\n');
} catch (error) {
  console.error('Error installing frontend dependencies:', error.message);
  process.exit(1);
}

// 2. Install Backend Python Dependencies
console.log('Step 2: Installing Backend Python dependencies...');
try {
  // Check if python is available
  let pythonCmd = 'python';
  try {
    execSync('python --version', { stdio: 'ignore' });
  } catch (e) {
    try {
      execSync('py --version', { stdio: 'ignore' });
      pythonCmd = 'py';
    } catch (e2) {
      console.log('WARNING: Python command not found in your PATH. Please install Python 3.8+ and add it to your environment variables.');
      console.log('You can still run the frontend, but the backend will require Python.');
      process.exit(0);
    }
  }

  console.log(`Using python command: "${pythonCmd}"`);
  console.log('Installing dependencies from backend/requirements.txt (this may take a minute as OpenCV/EasyOCR are downloaded)...');
  
  execSync(`${pythonCmd} -m pip install -r requirements.txt`, { 
    cwd: path.join(__dirname, 'backend'), 
    stdio: 'inherit' 
  });
  console.log('\nBackend python setup completed successfully!\n');
} catch (error) {
  console.log('\n--------------------------------------------------');
  console.log('WARNING: Could not automatically install Python dependencies.');
  console.log('This is common if pip is outdated or virtual environments are needed.');
  console.log('To run the backend, you can manually run:');
  console.log('  cd backend');
  console.log('  pip install -r requirements.txt');
  console.log('--------------------------------------------------\n');
}

console.log('=== Setup Complete! ===');
console.log('To start both frontend and backend concurrently, run:');
console.log('  npm run dev\n');
