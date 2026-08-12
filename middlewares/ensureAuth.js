//middleware to check if user is authenticated
export const ensureAuth = (req, res, next) => {
    // Only log in development mode to reduce noise
    if (process.env.NODE_ENV === 'development') {
        console.log("Passport Auth:", req.isAuthenticated(), "Session Auth:", req.session?.isAuthenticated, "User ID:", req.session?.user_id, "Path:", req.path, "Method:", req.method);
        console.log("Session details:", {
            sessionID: req.sessionID,
            user: req.user,
            isAuthenticated: req.isAuthenticated(),
            sessionData: req.session
        });
    }
    
    // Check Passport.js authentication first
    if (req.isAuthenticated()) {
        console.log('Passport.js authentication recognized');
        return next();
    }
    
    // Check session-based authentication
    if (req.session && req.session.isAuthenticated && req.session.user_id) {
        console.log('Session-based authentication recognized');
        return next();
    }
    
    // Check face authentication (special case for face login)
    if (req.session && req.session.faceAuthenticated && req.session.faceAuthTime) {
        // Security check: face auth must be recent (within 5 minutes)
        const faceAuthAge = Date.now() - req.session.faceAuthTime;
        const maxFaceAuthAge = 5 * 60 * 1000; // 5 minutes
        
        console.log('Face auth check:', {
            faceAuthenticated: req.session.faceAuthenticated,
            faceAuthTime: req.session.faceAuthTime,
            faceAuthAge: faceAuthAge,
            maxFaceAuthAge: maxFaceAuthAge,
            isRecent: faceAuthAge <= maxFaceAuthAge
        });
        
        if (faceAuthAge <= maxFaceAuthAge) {
            console.log('Face authentication recognized, allowing access');
            return next();
        } else {
            console.log('Face authentication expired, clearing session');
            req.session.faceAuthenticated = false;
            req.session.faceAuthTime = null;
            req.session.faceAuthMethod = null;
        }
    } else {
        console.log('No authentication found:', {
            hasSession: !!req.session,
            isAuthenticated: req.isAuthenticated(),
            sessionIsAuthenticated: req.session?.isAuthenticated,
            sessionUserId: req.session?.user_id,
            faceAuthenticated: req.session?.faceAuthenticated,
            faceAuthTime: req.session?.faceAuthTime
        });
    }

    // For API routes, return JSON error instead of redirect
    if (req.path.startsWith('/api/') || req.path.startsWith('/ai/')) {
        console.log("Returning JSON error for API route:", req.path);
        return res.status(401).json({
            success: false,
            error: "Authentication required",
            status: 401
        });
    }

    console.log("Redirecting to login for path:", req.path);
    return res.redirect("/authorized/login");
};
