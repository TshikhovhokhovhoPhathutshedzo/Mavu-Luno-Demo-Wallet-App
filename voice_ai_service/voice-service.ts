/**
 * Enhanced Voice AI Service with Gemini Live API Integration (TypeScript)
 * Provides real-time voice conversation capabilities with financial data access
 */

import {
  GoogleGenAI,
  LiveServerMessage,
  MediaResolution,
  Modality,
  Session,
} from '@google/genai';
import mime from 'mime';
import { writeFile } from 'fs';
import { promisify } from 'util';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const writeFileAsync = promisify(writeFile);

interface WavConversionOptions {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
}

interface VoiceSession {
  id: string;
  userId: string;
  context: any;
  createdAt: string;
  status: 'active' | 'inactive';
}

class GeminiVoiceService {
  private responseQueue: LiveServerMessage[] = [];
  private session: Session | undefined = undefined;
  private audioParts: string[] = [];
  private activeSessions: Map<string, VoiceSession> = new Map();
  private sessionCounter = 0;
  private app: express.Application;
  private server: any;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'Gemini Voice AI Service (TypeScript)',
        timestamp: new Date().toISOString(),
        active_sessions: this.activeSessions.size
      });
    });

    // Start voice session
    this.app.post('/start_session', async (req, res) => {
      try {
        const { user_id, context } = req.body;
        const sessionId = await this.startVoiceSession(user_id, context);
        res.json({
          success: true,
          session_id: sessionId,
          message: 'Voice session started successfully'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Stop voice session
    this.app.post('/stop_session', async (req, res) => {
      try {
        const { session_id } = req.body;
        await this.stopVoiceSession(session_id);
        res.json({
          success: true,
          message: 'Voice session stopped successfully'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Process voice command
    this.app.post('/process_command', async (req, res) => {
      try {
        const { command, user_id } = req.body;
        const result = await this.processVoiceCommand(command, user_id);
        res.json(result);
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Send financial data
    this.app.post('/send_financial_data', async (req, res) => {
      try {
        const { type, data, user_id } = req.body;
        await this.handleFinancialUpdate(type, data, user_id);
        res.json({
          success: true,
          message: `Financial data processed: ${type}`
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  async startVoiceSession(userId: string, context: any): Promise<string> {
    const sessionId = `voice_session_${this.sessionCounter++}_${Date.now()}`;
    
    const voiceSession: VoiceSession = {
      id: sessionId,
      userId,
      context,
      createdAt: new Date().toISOString(),
      status: 'active'
    };

    this.activeSessions.set(sessionId, voiceSession);

    // Initialize Gemini session if not already active
    if (!this.session) {
      await this.initializeGeminiSession();
    }

    console.log(`🎤 Voice session started: ${sessionId} for user: ${userId}`);
    return sessionId;
  }

  async stopVoiceSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.status = 'inactive';
      this.activeSessions.delete(sessionId);
      console.log(`🛑 Voice session stopped: ${sessionId}`);
    }

    // Close Gemini session if no active sessions
    if (this.activeSessions.size === 0 && this.session) {
      this.session.close();
      this.session = undefined;
    }
  }

  async processVoiceCommand(command: string, userId: string): Promise<any> {
    console.log(`🎤 Processing voice command: "${command}" for user: ${userId}`);

    if (!this.session) {
      await this.initializeGeminiSession();
    }

    // Send command to Gemini
    this.session!.sendClientContent({
      turns: [command]
    });

    // Wait for response
    const response = await this.handleTurn();
    
    return {
      success: true,
      command,
      response: this.extractTextFromResponse(response),
      audioFile: this.audioParts.length > 0 ? 'audio.wav' : null,
      timestamp: new Date().toISOString()
    };
  }

  private async initializeGeminiSession(): Promise<void> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }

    const ai = new GoogleGenAI({
      apiKey,
    });

    const model = 'models/gemini-2.5-flash-preview-native-audio-dialog';

    const config = {
      responseModalities: [Modality.AUDIO],
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Zephyr',
          }
        }
      },
      contextWindowCompression: {
        triggerTokens: '25600',
        slidingWindow: { targetTokens: '12800' },
      },
    };

    this.session = await ai.live.connect({
      model,
      callbacks: {
        onopen: () => {
          console.log('🔗 Gemini Live API connected');
        },
        onmessage: (message: LiveServerMessage) => {
          this.responseQueue.push(message);
        },
        onerror: (e: any) => {
          console.error('❌ Gemini Live API error:', e.message);
        },
        onclose: (e: any) => {
          console.log('🔌 Gemini Live API disconnected:', e.reason);
        },
      },
      config
    });
  }

  private async handleTurn(): Promise<LiveServerMessage[]> {
    const turn: LiveServerMessage[] = [];
    let done = false;
    
    while (!done) {
      const message = await this.waitMessage();
      turn.push(message);
      this.handleModelTurn(message);
      
      if (message.serverContent && message.serverContent.turnComplete) {
        done = true;
      }
    }
    
    return turn;
  }

  private async waitMessage(): Promise<LiveServerMessage> {
    let done = false;
    let message: LiveServerMessage | undefined = undefined;
    
    while (!done) {
      message = this.responseQueue.shift();
      if (message) {
        done = true;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    
    return message!;
  }

  private handleModelTurn(message: LiveServerMessage): void {
    if (message.serverContent?.modelTurn?.parts) {
      const part = message.serverContent?.modelTurn?.parts?.[0];

      if (part?.fileData) {
        console.log(`📁 File: ${part?.fileData.fileUri}`);
      }

      if (part?.inlineData) {
        const fileName = 'audio.wav';
        const inlineData = part?.inlineData;

        this.audioParts.push(inlineData?.data ?? '');

        const buffer = this.convertToWav(this.audioParts, inlineData.mimeType ?? '');
        this.saveBinaryFile(fileName, buffer);
      }

      if (part?.text) {
        console.log(`💬 Response: ${part?.text}`);
      }
    }
  }

  private extractTextFromResponse(response: LiveServerMessage[]): string {
    let text = '';
    for (const message of response) {
      if (message.serverContent?.modelTurn?.parts) {
        for (const part of message.serverContent.modelTurn.parts) {
          if (part?.text) {
            text += part.text + ' ';
          }
        }
      }
    }
    return text.trim();
  }

  private async saveBinaryFile(fileName: string, content: Buffer): Promise<void> {
    try {
      await writeFileAsync(fileName, content);
      console.log(`💾 Audio saved to file: ${fileName}`);
    } catch (err) {
      console.error(`❌ Error writing file ${fileName}:`, err);
    }
  }

  private convertToWav(rawData: string[], mimeType: string): Buffer {
    const options = this.parseMimeType(mimeType);
    const dataLength = rawData.reduce((a, b) => a + b.length, 0);
    const wavHeader = this.createWavHeader(dataLength, options);
    const buffer = Buffer.concat(rawData.map(data => Buffer.from(data, 'base64')));

    return Buffer.concat([wavHeader, buffer]);
  }

  private parseMimeType(mimeType: string): WavConversionOptions {
    const [fileType, ...params] = mimeType.split(';').map(s => s.trim());
    const [_, format] = fileType.split('/');

    const options: Partial<WavConversionOptions> = {
      numChannels: 1,
      bitsPerSample: 16,
    };

    if (format && format.startsWith('L')) {
      const bits = parseInt(format.slice(1), 10);
      if (!isNaN(bits)) {
        options.bitsPerSample = bits;
      }
    }

    for (const param of params) {
      const [key, value] = param.split('=').map(s => s.trim());
      if (key === 'rate') {
        options.sampleRate = parseInt(value, 10);
      }
    }

    return options as WavConversionOptions;
  }

  private createWavHeader(dataLength: number, options: WavConversionOptions): Buffer {
    const {
      numChannels,
      sampleRate,
      bitsPerSample,
    } = options;

    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const buffer = Buffer.alloc(44);

    buffer.write('RIFF', 0);                      // ChunkID
    buffer.writeUInt32LE(36 + dataLength, 4);     // ChunkSize
    buffer.write('WAVE', 8);                      // Format
    buffer.write('fmt ', 12);                     // Subchunk1ID
    buffer.writeUInt32LE(16, 16);                 // Subchunk1Size (PCM)
    buffer.writeUInt16LE(1, 20);                  // AudioFormat (1 = PCM)
    buffer.writeUInt16LE(numChannels, 22);        // NumChannels
    buffer.writeUInt32LE(sampleRate, 24);         // SampleRate
    buffer.writeUInt32LE(byteRate, 28);           // ByteRate
    buffer.writeUInt16LE(blockAlign, 32);         // BlockAlign
    buffer.writeUInt16LE(bitsPerSample, 34);      // BitsPerSample
    buffer.write('data', 36);                     // Subchunk2ID
    buffer.writeUInt32LE(dataLength, 40);         // Subchunk2Size

    return buffer;
  }

  private async handleFinancialUpdate(updateType: string, data: any, userId: string): Promise<void> {
    console.log(`📊 Handling financial update: ${updateType} for user: ${userId}`);
    // Implementation for handling financial updates
  }

  async start(port: number = 5002): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        console.log(`🚀 Gemini Voice AI Service (TypeScript) running on port ${port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
    }
    if (this.session) {
      this.session.close();
    }
  }
}

// Start the service if this file is run directly
if (require.main === module) {
  const voiceService = new GeminiVoiceService();
  voiceService.start().catch(console.error);
}

export default GeminiVoiceService;
