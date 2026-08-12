import { AccessToken } from 'livekit-server-sdk';
import dotenv from 'dotenv';

dotenv.config();

const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_SECRET_KEY = process.env.LIVEKIT_SECRET_KEY;

// Check if LiveKit is properly configured
const isLiveKitConfigured = LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_SECRET_KEY;

export class LiveKitService {
  static generateAccessToken(userId, roomName, options = {}) {
    if (!isLiveKitConfigured) {
      throw new Error('LiveKit is not configured. Please set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_SECRET_KEY in your .env file.');
    }
    try {
      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_SECRET_KEY, {
        identity: userId,
        ttl: options.ttl || '1h',
      });

      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: options.canPublish !== false,
        canSubscribe: options.canSubscribe !== false,
        canPublishData: options.canPublishData !== false,
        canUpdateOwnMetadata: options.canUpdateOwnMetadata !== false,
      });

      return at.toJwt();
    } catch (error) {
      console.error('Error generating LiveKit access token:', error);
      throw new Error('Failed to generate access token');
    }
  }

  static generateRoomToken(roomName, participantName, options = {}) {
    if (!isLiveKitConfigured) {
      throw new Error('LiveKit is not configured. Please set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_SECRET_KEY in your .env file.');
    }
    try {
      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_SECRET_KEY, {
        identity: participantName,
        ttl: options.ttl || '1h',
      });

      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canUpdateOwnMetadata: true,
      });

      return at.toJwt();
    } catch (error) {
      console.error('Error generating LiveKit room token:', error);
      throw new Error('Failed to generate room token');
    }
  }

  static getLiveKitURL() {
    if (!isLiveKitConfigured) {
      return null;
    }
    return LIVEKIT_URL;
  }

  static validateConfig() {
    if (!isLiveKitConfigured) {
      return false;
    }
    return true;
  }
}

export default LiveKitService;
