import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MicroserviceManager {
    constructor() {
        this.microserviceProcess = null;
        this.isRunning = false;
        this.port = 5001;
    }

    async startMicroservice() {
        if (this.isRunning) {
            console.log('🔄 Microservice is already running');
            return;
        }

        try {
            console.log('🚀 Starting Face Recognition Microservice...');
            
            // Path to the face microservice directory
            const microservicePath = path.join(__dirname, '..', 'face_microservice');
            
            // Determine the Python executable path (cross-platform)
            const isWindows = process.platform === 'win32';
            const pythonPath = isWindows 
                ? path.join(microservicePath, 'venv', 'Scripts', 'python.exe')
                : path.join(microservicePath, 'venv', 'bin', 'python');
            
            // Check if virtual environment exists, if not create it
            const fs = await import('fs');
            const venvPath = path.join(microservicePath, 'venv');
            
            if (!fs.existsSync(venvPath)) {
                console.log('📦 Creating virtual environment...');
                await this.createVirtualEnvironment(microservicePath);
            }

            // Start the microservice
            this.microserviceProcess = spawn(pythonPath, ['app.py'], {
                cwd: microservicePath,
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true
            });

            // Handle process events
            this.microserviceProcess.stdout.on('data', (data) => {
                console.log(`🔍 Microservice: ${data.toString().trim()}`);
            });

            this.microserviceProcess.stderr.on('data', (data) => {
                console.log(`⚠️  Microservice Error: ${data.toString().trim()}`);
            });

            this.microserviceProcess.on('close', (code) => {
                console.log(`🔴 Microservice stopped with code ${code}`);
                this.isRunning = false;
            });

            this.microserviceProcess.on('error', (error) => {
                console.error(`❌ Failed to start microservice: ${error.message}`);
                this.isRunning = false;
            });

            // Wait a bit for the service to start
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Check if the service is running by testing the health endpoint
            const isHealthy = await this.checkHealth();
            
            if (isHealthy) {
                this.isRunning = true;
                console.log('✅ Face Recognition Microservice started successfully on port 5001');
            } else {
                console.log('⚠️  Microservice may not be fully ready yet, but process started');
                this.isRunning = true;
            }

        } catch (error) {
            console.error('❌ Error starting microservice:', error.message);
            this.isRunning = false;
        }
    }

    async createVirtualEnvironment(microservicePath) {
        return new Promise((resolve, reject) => {
            const pythonProcess = spawn('python', ['-m', 'venv', 'venv'], {
                cwd: microservicePath,
                stdio: 'pipe'
            });

            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Virtual environment created successfully');
                    resolve();
                } else {
                    reject(new Error(`Failed to create virtual environment with code ${code}`));
                }
            });

            pythonProcess.on('error', (error) => {
                reject(error);
            });
        });
    }

    async checkHealth() {
        try {
            const response = await fetch(`http://localhost:${this.port}/health`);
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async stopMicroservice() {
        if (!this.isRunning || !this.microserviceProcess) {
            console.log('🔄 Microservice is not running');
            return;
        }

        try {
            console.log('🛑 Stopping Face Recognition Microservice...');
            
            // Send SIGTERM signal to gracefully stop the process
            this.microserviceProcess.kill('SIGTERM');
            
            // Wait for the process to terminate
            await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    console.log('⚠️  Force killing microservice process...');
                    this.microserviceProcess.kill('SIGKILL');
                    resolve();
                }, 5000);

                this.microserviceProcess.on('close', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });

            this.isRunning = false;
            this.microserviceProcess = null;
            console.log('✅ Face Recognition Microservice stopped successfully');
            
        } catch (error) {
            console.error('❌ Error stopping microservice:', error.message);
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            port: this.port
        };
    }
}

export default MicroserviceManager;
