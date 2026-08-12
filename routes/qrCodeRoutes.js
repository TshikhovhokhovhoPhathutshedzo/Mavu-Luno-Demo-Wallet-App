import express from 'express';
import { ensureAuth } from '../middlewares/ensureAuth.js';
import {
    generateQRCode,
    getUserQRCode,
    regenerateQRCode,
    validateQRCode,
    getQRCodePage,
    getQRScannerPage,
    getQRCodeStats
} from '../controllers/qrCodeController.js';

const qrCodeRouter = express.Router();

// QR Code pages
qrCodeRouter.get('/', ensureAuth, getQRCodePage);
qrCodeRouter.get('/scanner', ensureAuth, getQRScannerPage);

// QR Code API endpoints
qrCodeRouter.get('/api/generate', ensureAuth, generateQRCode);
qrCodeRouter.get('/api/user-qr', ensureAuth, getUserQRCode);
qrCodeRouter.post('/api/regenerate', ensureAuth, regenerateQRCode);
qrCodeRouter.post('/api/validate', ensureAuth, validateQRCode);
qrCodeRouter.get('/api/stats', ensureAuth, getQRCodeStats);

export default qrCodeRouter;
