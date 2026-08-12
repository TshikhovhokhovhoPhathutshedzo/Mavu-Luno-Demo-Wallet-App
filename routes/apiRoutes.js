import express from "express";
import { checkUsernameUnique, checkEmailUnique, checkUsernameAndEmailUnique, getNotificationSettings, updateNotificationSettings, getUserEmail } from "../controllers/homeController.js";
import { ensureAuth } from "../middlewares/ensureAuth.js";
import { sanitizeUserInput } from "../middlewares/inputValidation.js";

const apiRouter = express.Router();

// Username and email checking endpoints
apiRouter.get("/check-username", ensureAuth, sanitizeUserInput, checkUsernameUnique);
apiRouter.get("/check-email", ensureAuth, sanitizeUserInput, checkEmailUnique);
apiRouter.get("/check-availability", ensureAuth, sanitizeUserInput, checkUsernameAndEmailUnique);

// User email endpoint
apiRouter.get("/user-email", ensureAuth, sanitizeUserInput, getUserEmail);

// Notification settings endpoints
apiRouter.get("/notification-settings", ensureAuth, sanitizeUserInput, getNotificationSettings);
apiRouter.patch("/notification-settings", ensureAuth, sanitizeUserInput, updateNotificationSettings);

export default apiRouter;
