//neccessary packages
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import pool from "./db.js";
import {Strategy as GoogleStrategy} from "passport-google-oauth2";

dotenv.config();

function initializePassport(passport) {
  passport.use("local",
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
        passReqToCallback: true 
      },
      async (req, email, password, done) => {
        let client;
        try {
          client = await pool.connect();
        } catch (dbError) {
          console.error("Database connection error in passport:", dbError.message);
          req.flash("error", "Database connection failed. Please try again later.");
          return done(null, false);
        }
        
        try {
          // Check if the input is an email or username
          const isEmail = email.includes('@');
          
          let result;
          if (isEmail) {
            // Search by email
            result = await client.query(
              "SELECT * FROM luno_users WHERE email = $1",
              [email]
            );
          } else {
            // Search by username
            result = await client.query(
              "SELECT * FROM luno_users WHERE username = $1",
              [email]
            );
          }

          if (result.rows.length === 0) {
            req.flash("error", "User does not exist. Please check your email/username.");
            return done(null, false);
          }

          const user = result.rows[0];

          const isMatch = await bcrypt.compare(password, user.user_password);
          if (!isMatch) {
            req.flash("error", "Password incorrect.");
            return done(null, false);
          }

          return done(null, user);
        } catch (error) {
          return done(error);
        } finally {
          client.release();
        }
      }
    )
  );

  // google auth logic
  passport.use("google", 
    new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/authorized/google/callback",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  }, async (accessToken, refreshToken, profile, done) => {
    const client = await pool.connect();
    try {
      console.log(profile);
      const result = await client.query(
        "SELECT * FROM luno_users WHERE email = $1",
        [profile.email]
      );
  
      let user;
      if (result.rows.length > 0) {
        user = result.rows[0];
      } else {
        // Start transaction for new user creation
        await client.query("BEGIN");
        
        const insert = await client.query(
          "INSERT INTO luno_users (username, email, user_password) VALUES ($1, $2, $3) RETURNING *",
          [profile.displayName, profile.email, profile.id]
        );
        user = insert.rows[0];

        // Generate a unique 9-digit account number for Google OAuth users
        let accountNumber;
        let isUnique = false;
        while (!isUnique) {
          accountNumber = Math.floor(100000000 + Math.random() * 900000000).toString();
          const existingAccount = await client.query(
            "SELECT user_id FROM luno_users WHERE account_number = $1",
            [accountNumber]
          );
          if (existingAccount.rows.length === 0) {
            isUnique = true;
          }
        }

        // Update user with account number
        await client.query(
          `UPDATE luno_users SET account_number = $1 WHERE user_id = $2`,
          [accountNumber, user.user_id]
        );

        // Commit transaction
        await client.query("COMMIT");
      }
  
      return done(null, user);
    } catch (err) {
      // Rollback transaction if there was an error
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        console.error("Rollback error:", rollbackErr);
      }
      return done(err, null);
    } finally {
      client.release();
    }
  }
  ));

  passport.serializeUser((user, done) => {
    done(null, user.user_id); // storing user ID in the session
  });

  passport.deserializeUser(async (id, done) => {
    const client = await pool.connect();
    try {
      const result = await client.query("SELECT * FROM luno_users WHERE user_id = $1", [id]);
      if (result.rows.length === 0) {
        return done(null, false);
      }
      done(null, result.rows[0]);
    } catch (error) {
      done(error);
    } finally {
      client.release();
    }
  });
}

export default initializePassport;
