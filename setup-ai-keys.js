#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupAIKeys() {
  console.log('🤖 LunoWallet AI Setup');
  console.log('=====================');
  console.log('');
  console.log('This script will help you set up AI API keys for the chat assistant.');
  console.log('You can get API keys from:');
  console.log('• OpenAI: https://platform.openai.com/api-keys');
  console.log('• Google AI: https://aistudio.google.com/app/apikey');
  console.log('');

  const envPath = '.env';
  let envContent = '';

  // Check if .env file exists
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  } else {
    // Copy from env.example if it exists
    if (fs.existsSync('env.example')) {
      envContent = fs.readFileSync('env.example', 'utf8');
    }
  }

  // Get OpenAI API key
  const openaiKey = await question('Enter your OpenAI API key (or press Enter to skip): ');
  if (openaiKey.trim()) {
    if (envContent.includes('OPENAI_API_KEY=')) {
      envContent = envContent.replace(/OPENAI_API_KEY=.*/, `OPENAI_API_KEY=${openaiKey.trim()}`);
    } else {
      envContent += `\n# AI Service Configuration\nOPENAI_API_KEY=${openaiKey.trim()}\n`;
    }
  }

  // Get Google AI API key
  const googleKey = await question('Enter your Google AI API key (or press Enter to skip): ');
  if (googleKey.trim()) {
    if (envContent.includes('GOOGLE_GENERATIVE_AI_API_KEY=')) {
      envContent = envContent.replace(/GOOGLE_GENERATIVE_AI_API_KEY=.*/, `GOOGLE_GENERATIVE_AI_API_KEY=${googleKey.trim()}`);
    } else {
      if (!envContent.includes('OPENAI_API_KEY=')) {
        envContent += `\n# AI Service Configuration\n`;
      }
      envContent += `GOOGLE_GENERATIVE_AI_API_KEY=${googleKey.trim()}\n`;
    }
  }

  // Write the .env file
  fs.writeFileSync(envPath, envContent);
  
  console.log('');
  console.log('✅ Environment file updated successfully!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Restart your server');
  console.log('2. Test the chat assistant');
  console.log('');
  console.log('Note: If you didn\'t provide API keys, the chat assistant will use offline responses.');
  console.log('These are still helpful but not as intelligent as the AI-powered responses.');
  
  rl.close();
}

setupAIKeys().catch(console.error);
