import express from 'express';
import { ensureAuth } from '../middlewares/ensureAuth.js';
import {
    generateQRCode,
    scanQRCode,
    lookupRecipient,
    getQRStatus,
    deactivateQRCode
} from '../controllers/qrController.js';

const qrRouter = express.Router();

// QR code generation (authenticated)
qrRouter.get('/generate', ensureAuth, generateQRCode);

// QR code scanning (no auth required for scanning)
qrRouter.post('/scan', scanQRCode);

// Recipient lookup (no auth required for lookup)
qrRouter.post('/lookup', lookupRecipient);

// QR code status (authenticated)
qrRouter.get('/status', ensureAuth, getQRStatus);

// Deactivate QR code (authenticated)
qrRouter.post('/deactivate', ensureAuth, deactivateQRCode);

// QR code display page (authenticated)
qrRouter.get('/', ensureAuth, (req, res) => {
    res.render('qr-code', {
        user: req.user,
        title: 'My QR Code'
    });
});

// QR code scanner page (authenticated)
qrRouter.get('/scan', ensureAuth, (req, res) => {
    res.render('qr-scan', {
        user: req.user,
        title: 'Scan QR Code'
    });
});

export default qrRouter;
