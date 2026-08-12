import express from "express";
import { 
    loginPage,
    registerPage,
    registerUser,
    handleLogin,
    limiter,
    handleGoogleAuth,
    googleAuthRedirect,
    logOut,
    transactionPage
 } from "../controllers/authControllers.js";
import { ensureAuth } from "../middlewares/ensureAuth.js";
import { sanitizeUserInput, validateRegistration } from "../middlewares/inputValidation.js";

const router = express.Router();

router.get("/login", loginPage);
router.post("/login", limiter, sanitizeUserInput, handleLogin);
router.get("/signup", registerPage);
router.post("/signup", sanitizeUserInput, validateRegistration, registerUser);

router.get("/logout", logOut);
router.get("/all-transactions", ensureAuth, transactionPage);

router.get("/google", handleGoogleAuth);
router.get("/google/callback", googleAuthRedirect);

export default router;
