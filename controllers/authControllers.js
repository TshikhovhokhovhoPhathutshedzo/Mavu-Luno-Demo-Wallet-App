// imports
import pool from "../auth/db.js";
import bcrypt from "bcryptjs";
import passport from "passport";
import {rateLimit} from "express-rate-limit";

export const loginPage = (req, res) => {
    res.render("login", {
        message: req.flash("error"),
        messageType: req.flash("messageType")[0] || "error"
    })
};
export const registerPage = (req, res) => res.render("signup");

// get all transactions
export const transactionPage = async (req, res) => {
    if (!req.user) {
      return res.redirect('/authorized/login');
    }
    const client = await pool.connect();
    const user_id = req.user.user_id;
  
    try {
      console.log('Transaction page requested for user:', user_id);
      
      // Get user's account first
      const accountResult = await client.query(`
        SELECT account_id, balance FROM accounts 
        WHERE user_id = $1 AND is_active = true 
        LIMIT 1
      `, [user_id]);

      if (accountResult.rows.length === 0) {
        return res.render("transactions", {
          data: [],
          balance: "0.00",
          message: "No account found. Please contact support.",
          active: "transactions"
        });
      }

      const account = accountResult.rows[0];

      // Get all transactions with proper formatting using new structure
      const result = await client.query(
        `SELECT 
           t.amount, 
           t.transaction_type, 
           TO_CHAR(t.created_at, 'YYYY-MM-DD') AS created_date,
           t.payment_method,
           t.status,
           tc.category_name,
           t.description
         FROM transactions t
         JOIN transaction_categories tc ON t.category_id = tc.category_id
         WHERE t.user_id = $1 AND t.account_id = $2
         ORDER BY t.created_at DESC`, [user_id, account.account_id]
      );
      
      console.log('Transaction query result:', result.rows.length, 'transactions found');
      console.log('Transaction data:', result.rows);

      // Get current balance from account
      const prevBalance = BigInt(account.balance);

      // Convert amounts - transaction amounts are stored in cents, convert to rands for display
      const formattedTransactions = result.rows.map(transaction => {
        const amountInCents = parseFloat(transaction.amount);
        const displayAmount = (amountInCents / 100).toFixed(2);
        return {
          ...transaction,
          amount: displayAmount
        };
      });

      // Convert balance from cents to rands for display
      const displayBalance = (Number(prevBalance) / 100).toFixed(2);

      if(result.rows.length > 0) {
        console.log('Rendering transactions with data');
        res.render("transactions",{
          data: formattedTransactions,
          balance: displayBalance,
          active: "transactions"
        })
      } else {
        console.log('Rendering transactions with no data message');
        res.render("transactions", {
          balance: displayBalance,
          message: "No transaction made yet!",
          active: "transactions"
        })
      }
    } catch(error) {
        console.error("Transaction page error:", error.message);
        res.status(500).send("Server error");
    } finally {
      client.release();
    }
  }

// limit number of log ins
export const limiter =  rateLimit ({
    windowMs: 30 * 1000,  // limit for 30 seconds
    limit: 5,
    message: 'Too many attempts, try again after 30 seconds',
    standardHeaders: 'draft-8',
    legacyHeaders: false

});
//authenticated user direction
export const handleLogin = (req, res, next) => {
    passport.authenticate("local", {
        successRedirect: "/",
        failureRedirect: "/authorized/login",
        failureFlash: true
    })(req, res, next);
};

export const handleGoogleAuth = passport.authenticate("google", {
        scope: ["profile", "email"],
    });

export const googleAuthRedirect = passport.authenticate("google", {
    successRedirect: "/",
    failureRedirect: "/authorized/login",
    failureFlash: true
  })
//user registration logic
export const registerUser = async (req, res) => {
    const client = await pool.connect();
    try {
        const saltRounds = 10;
        const { email, username, password } = req.body;
        const emailRegx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegx.test(email)) {
            return res.render("signup", { 
                message: "Provide a valid email address",
                display: "block"
            });
        }

        const userExists = await client.query(
            "SELECT * FROM luno_users WHERE email = $1",
            [email]
        );

        if (userExists.rows.length > 0) {
            return res.render("signup", { 
                message: "User already exists", 
                display: "block"
            });
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Start transaction
        await client.query("BEGIN");

        const newUser = await client.query(
            `INSERT INTO luno_users (username, email, user_password) 
             VALUES ($1, $2, $3) RETURNING user_id`,
            [username, email, hashedPassword]
        );

        const userId = newUser.rows[0].user_id;

        // Create user profile
        await client.query(
            `INSERT INTO user_profiles (user_id, preferences) 
             VALUES ($1, $2)`,
            [userId, JSON.stringify({})]
        );

        // Generate a unique account number
        let accountNumber;
        let isUnique = false;
        while (!isUnique) {
            accountNumber = `1000${userId.slice(-4)}`;
            const existingAccount = await client.query(
                "SELECT account_id FROM accounts WHERE account_number = $1",
                [accountNumber]
            );
            if (existingAccount.rows.length === 0) {
                isUnique = true;
            }
        }

        // Create account for the user
        const accountResult = await client.query(
            `INSERT INTO accounts (user_id, account_number, account_type, balance, currency, is_active) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING account_id`,
            [userId, accountNumber, 'savings', 0, 'ZAR', true]
        );

        const accountId = accountResult.rows[0].account_id;

        // Generate a random card number (16 digits)
        const cardNumber = Math.floor(1000000000000000 + Math.random() * 9000000000000000).toString();
        
        // Generate expiry date (3 years from now, but not beyond 2030)
        const expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + 3);

        // Ensure expiry date doesn't exceed 2030
        if (expiryDate.getFullYear() > 2030) {
            expiryDate.setFullYear(2030);
            expiryDate.setMonth(11); // December
            expiryDate.setDate(31); // 31st
        }

        // Ensure expiry date is at least beyond 2025
        const minExpiryDate = new Date();
        minExpiryDate.setFullYear(2026);
        minExpiryDate.setMonth(0); // January
        minExpiryDate.setDate(1); // 1st

        if (expiryDate < minExpiryDate) {
            expiryDate.setFullYear(2026);
            expiryDate.setMonth(0); // January
            expiryDate.setDate(1); // 1st
        }

        const formattedExpiryDate = expiryDate.toISOString().split('T')[0];
        
        // Generate random CVV (3 digits)
        const cvv = Math.floor(100 + Math.random() * 900).toString();

        // Create plastic card linked to the account
        await client.query(
            `INSERT INTO plastic_cards (user_id, account_id, card_number, expiry_date, cvv, card_type, is_active) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [userId, accountId, cardNumber, formattedExpiryDate, cvv, 'debit', true]
        );

        // Commit transaction
        await client.query("COMMIT");

        res.render("login", { 
            message: `Account Created Successfully! Your account number is: ${accountNumber}`,
            messageType: "success",
            display: "block"
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Registration error:", error);
        res.render("signup", { 
            message: "Server error during registration",
            display: "block" 
        });
    } finally {
        client.release();
    }
};

export const logOut = (req, res) => {
    req.logout((error) =>{
        if (error) console.log(error);
        res.redirect("login");
    });
}
