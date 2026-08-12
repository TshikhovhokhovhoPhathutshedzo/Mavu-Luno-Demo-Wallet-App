import express from 'express';
import { ensureAuth } from '../middlewares/ensureAuth.js';
import LiveKitService from '../services/livekitService.js';

const livekitRouter = express.Router();

// Generate access token for LiveKit room
livekitRouter.post('/token', ensureAuth, async (req, res) => {
  try {
    const { roomName, participantName } = req.body;
    const userId = req.user.user_id;
    
    if (!roomName) {
      return res.status(400).json({
        success: false,
        error: 'Room name is required'
      });
    }

    // Validate LiveKit configuration
    LiveKitService.validateConfig();

    // Generate access token
    const token = LiveKitService.generateAccessToken(
      userId,
      roomName,
      {
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canUpdateOwnMetadata: true,
        ttl: '1h'
      }
    );

    res.json({
      success: true,
      token,
      url: LiveKitService.getLiveKitURL(),
      roomName,
      participantName: participantName || req.user.username || 'User'
    });

  } catch (error) {
    console.error('LiveKit token generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate access token'
    });
  }
});

// Generate room token for specific room
livekitRouter.post('/room-token', ensureAuth, async (req, res) => {
  try {
    const { roomName, participantName } = req.body;
    const userId = req.user.user_id;
    
    if (!roomName) {
      return res.status(400).json({
        success: false,
        error: 'Room name is required'
      });
    }

    // Validate LiveKit configuration
    LiveKitService.validateConfig();

    // Generate room token
    const token = LiveKitService.generateRoomToken(
      roomName,
      participantName || req.user.username || 'User',
      {
        ttl: '1h'
      }
    );

    res.json({
      success: true,
      token,
      url: LiveKitService.getLiveKitURL(),
      roomName,
      participantName: participantName || req.user.username || 'User'
    });

  } catch (error) {
    console.error('LiveKit room token generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate room token'
    });
  }
});

// LiveKit test page
livekitRouter.get('/test', (req, res) => {
  res.render('livekit-test', {
    title: 'LiveKit Test - LunoWallet'
  });
});

// Get LiveKit configuration (public endpoint)
livekitRouter.get('/config', (req, res) => {
  try {
    LiveKitService.validateConfig();
    
    res.json({
      success: true,
      url: LiveKitService.getLiveKitURL(),
      apiKey: process.env.LIVEKIT_API_KEY
    });
  } catch (error) {
    console.error('LiveKit config error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'LiveKit configuration error'
    });
  }
});

// Create a new room (for customer support, video calls, etc.)
livekitRouter.post('/create-room', ensureAuth, async (req, res) => {
  try {
    const { roomName, roomType = 'support' } = req.body;
    const userId = req.user.user_id;
    
    if (!roomName) {
      return res.status(400).json({
        success: false,
        error: 'Room name is required'
      });
    }

    // Validate LiveKit configuration
    LiveKitService.validateConfig();

    // Generate access token for the room creator
    const token = LiveKitService.generateAccessToken(
      userId,
      roomName,
      {
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canUpdateOwnMetadata: true,
        ttl: '2h'
      }
    );

    res.json({
      success: true,
      token,
      url: LiveKitService.getLiveKitURL(),
      roomName,
      roomType,
      createdBy: userId,
      participantName: req.user.username || 'User'
    });

  } catch (error) {
    console.error('LiveKit room creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create room'
    });
  }
});

// Join an existing room
livekitRouter.post('/join-room', ensureAuth, async (req, res) => {
  try {
    const { roomName, participantName } = req.body;
    const userId = req.user.user_id;
    
    if (!roomName) {
      return res.status(400).json({
        success: false,
        error: 'Room name is required'
      });
    }

    // Validate LiveKit configuration
    LiveKitService.validateConfig();

    // Generate access token for joining the room
    const token = LiveKitService.generateAccessToken(
      userId,
      roomName,
      {
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canUpdateOwnMetadata: true,
        ttl: '1h'
      }
    );

    res.json({
      success: true,
      token,
      url: LiveKitService.getLiveKitURL(),
      roomName,
      participantName: participantName || req.user.username || 'User'
    });

  } catch (error) {
    console.error('LiveKit join room error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to join room'
    });
  }
});

export default livekitRouter;
