/**
 * Test script for DeepFace Authentication Integration
 * This script tests the integration between LunoWallet and DeepFace API
 */

import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:5001';
const LUNO_BASE_URL = 'http://localhost:3000';

class DeepFaceIntegrationTester {
    constructor() {
        this.testResults = [];
    }

    async runTest(testName, testFunction) {
        console.log(`\n🧪 Running test: ${testName}`);
        try {
            const result = await testFunction();
            if (result.success) {
                console.log(`✅ ${testName}: PASSED`);
                this.testResults.push({ name: testName, status: 'PASSED', result });
            } else {
                console.log(`❌ ${testName}: FAILED - ${result.message}`);
                this.testResults.push({ name: testName, status: 'FAILED', result });
            }
        } catch (error) {
            console.log(`❌ ${testName}: ERROR - ${error.message}`);
            this.testResults.push({ name: testName, status: 'ERROR', error: error.message });
        }
    }

    async testDeepFaceAPIHealth() {
        const response = await fetch(`${API_BASE_URL}/face-auth/health`);
        const data = await response.json();
        return { success: response.ok && data.success, message: data.message };
    }

    async testLunoWalletHealth() {
        const response = await fetch(`${LUNO_BASE_URL}/`);
        return { success: response.ok, message: response.statusText };
    }

    async testDeepFaceAPIEndpoints() {
        const endpoints = [
            '/face-auth/health',
            '/face-auth/config'
        ];

        const results = [];
        for (const endpoint of endpoints) {
            try {
                const response = await fetch(`${API_BASE_URL}${endpoint}`);
                const data = await response.json();
                results.push({
                    endpoint,
                    success: response.ok,
                    message: data.message || response.statusText
                });
            } catch (error) {
                results.push({
                    endpoint,
                    success: false,
                    message: error.message
                });
            }
        }

        const allPassed = results.every(r => r.success);
        return {
            success: allPassed,
            message: allPassed ? 'All endpoints accessible' : 'Some endpoints failed',
            details: results
        };
    }

    async testLunoWalletDeepFaceRoutes() {
        const routes = [
            '/deepface-auth/api/health',
            '/deepface-auth/api/start',
            '/deepface-auth/api/stop'
        ];

        const results = [];
        for (const route of routes) {
            try {
                const response = await fetch(`${LUNO_BASE_URL}${route}`);
                const data = await response.json();
                results.push({
                    route,
                    success: response.ok,
                    message: data.message || response.statusText
                });
            } catch (error) {
                results.push({
                    route,
                    success: false,
                    message: error.message
                });
            }
        }

        const allPassed = results.every(r => r.success);
        return {
            success: allPassed,
            message: allPassed ? 'All routes accessible' : 'Some routes failed',
            details: results
        };
    }

    async testFaceAuthConfiguration() {
        try {
            const response = await fetch(`${API_BASE_URL}/face-auth/config`);
            const data = await response.json();
            
            if (data.success && data.config) {
                const config = data.config;
                const requiredFields = ['model_name', 'distance_metric', 'detector_backend', 'similarity_threshold'];
                const hasAllFields = requiredFields.every(field => field in config);
                
                return {
                    success: hasAllFields,
                    message: hasAllFields ? 'Configuration loaded successfully' : 'Missing configuration fields',
                    config
                };
            } else {
                return {
                    success: false,
                    message: 'Failed to load configuration'
                };
            }
        } catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }

    async runAllTests() {
        console.log('🔐 DeepFace Authentication Integration Test');
        console.log('=' * 50);

        // Test DeepFace API
        await this.runTest('DeepFace API Health Check', () => this.testDeepFaceAPIHealth());
        await this.runTest('DeepFace API Endpoints', () => this.testDeepFaceAPIEndpoints());
        await this.runTest('Face Auth Configuration', () => this.testFaceAuthConfiguration());

        // Test LunoWallet Integration
        await this.runTest('LunoWallet Health Check', () => this.testLunoWalletHealth());
        await this.runTest('LunoWallet DeepFace Routes', () => this.testLunoWalletDeepFaceRoutes());

        // Print summary
        this.printSummary();
    }

    printSummary() {
        console.log('\n📊 Test Summary');
        console.log('=' * 30);
        
        const passed = this.testResults.filter(r => r.status === 'PASSED').length;
        const failed = this.testResults.filter(r => r.status === 'FAILED').length;
        const errors = this.testResults.filter(r => r.status === 'ERROR').length;
        const total = this.testResults.length;

        console.log(`Total Tests: ${total}`);
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`⚠️  Errors: ${errors}`);

        if (failed > 0 || errors > 0) {
            console.log('\n❌ Some tests failed. Check the details above.');
            console.log('\n🔧 Troubleshooting:');
            console.log('1. Ensure DeepFace API is running: python start_deepface_api.py');
            console.log('2. Ensure LunoWallet backend is running: npm start');
            console.log('3. Check if all dependencies are installed');
            console.log('4. Verify ports 3000 and 5001 are available');
        } else {
            console.log('\n🎉 All tests passed! Integration is working correctly.');
        }
    }
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const tester = new DeepFaceIntegrationTester();
    tester.runAllTests().catch(console.error);
}

export default DeepFaceIntegrationTester;
