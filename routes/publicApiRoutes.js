import express from "express";
import { authFace } from "../controllers/homeController.js";
// import { verifyFaceLogin } from "../controllers/enhancedFaceAuthController.js"; // Removed - file deleted

const publicApiRouter = express.Router();

// Public API routes that don't require authentication
// Redirect old face auth to enhanced system
// Removed old face auth redirect - system deleted
// publicApiRouter.post("/face/auth", async (req, res) => {
//     // Redirect to enhanced face verification system
//     req.url = '/api/face/login/verify';
//     req.originalUrl = '/api/face/login/verify';
//     return verifyFaceLogin(req, res);
// });

export default publicApiRouter;
