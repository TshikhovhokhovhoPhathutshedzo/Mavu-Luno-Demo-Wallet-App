import pool from "../auth/db.js";

async function normalizeTransactionHistoryToCents() {
	const client = await pool.connect();
	try {
		console.log("🔎 Scanning for inconsistent transaction_history amounts (should be cents)...");
		// Find rows where transaction_history.amount doesn't match corresponding movement amount
		const { rows } = await client.query(`
			SELECT th.transaction_id, th.amount AS history_amount, tm.amount AS movement_amount
			FROM transactions th
			JOIN transaction_movements tm ON tm.transaction_id = th.transaction_id
			WHERE th.amount <> tm.amount
		`);

		if (rows.length === 0) {
			console.log("✅ No mismatched amounts found. Nothing to fix.");
			return;
		}

		console.log(`⚠️  Found ${rows.length} mismatched transactions. Fixing...`);
		await client.query("BEGIN");
		for (const row of rows) {
			const { transaction_id, history_amount, movement_amount } = row;
			// Two common cases:
			// 1) history in rands, movement in cents => history_amount * 100 === movement_amount
			// 2) history in cents, movement in rands (unlikely) => history_amount === movement_amount * 100
			if (BigInt(history_amount) * BigInt(100) === BigInt(movement_amount)) {
				await client.query(
					`UPDATE transactions SET amount = $1 WHERE transaction_id = $2`,
					[movement_amount, transaction_id]
				);
				console.log(`✔️  Updated transaction ${transaction_id} to cents using movement amount`);
			} else if (BigInt(history_amount) === BigInt(movement_amount) * BigInt(100)) {
				// Rare: movement in rands and history in cents; prefer cents (history), so update movement
				await client.query(
					`UPDATE transaction_movements SET amount = $1 WHERE transaction_id = $2`,
					[history_amount, transaction_id]
				);
				console.log(`✔️  Updated movement ${transaction_id} to cents using history amount`);
			} else {
				// Heuristic fallback: if history_amount < 100000 and movement_amount >= 10000, set to movement
				if (Number(history_amount) < 100000 && Number(movement_amount) >= 10000) {
					await client.query(
						`UPDATE transactions SET amount = $1 WHERE transaction_id = $2`,
						[movement_amount, transaction_id]
					);
					console.log(`✔️  Heuristic update for ${transaction_id} -> history set to movement amount`);
				} else {
					console.log(`❓ Skipped ${transaction_id} (ambiguous mismatch: history=${history_amount}, movement=${movement_amount})`);
				}
			}
		}
		await client.query("COMMIT");
		console.log("🎉 Normalization complete.");
	} catch (e) {
		await client.query("ROLLBACK");
		console.error("❌ Normalization failed:", e.message);
		process.exitCode = 1;
	} finally {
		client.release();
	}
}

normalizeTransactionHistoryToCents().then(() => process.exit());


