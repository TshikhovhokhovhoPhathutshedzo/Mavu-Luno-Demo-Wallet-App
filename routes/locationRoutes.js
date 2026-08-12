import express from "express";
import { updateUserLocation } from "../controllers/locationController.js";
import { ensureAuth } from "../middlewares/ensureAuth.js";

const router = express.Router();

// Update user location (for GPS coordinates from frontend)
router.post("/update-location", ensureAuth, updateUserLocation);

export default router; 