/**
 * @module db
 * @description SQLite database connection and schema initialization.
 * Creates tables, runs column migrations, and migrates legacy data on startup.
 */

const path = require("path");
const sqlite3 = require("sqlite3");

// ── Connection Setup ─────────────────────────────────────────────────────────

const dbPath = path.resolve(__dirname, "..", "database.db");
const db = new sqlite3.Database(dbPath);

db.configure("busyTimeout", 5000);

db.serialize(() => {

	// ── Table Creation ────────────────────────────────────────────────────────

	db.run(`
		CREATE TABLE IF NOT EXISTS stock_units (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			receipt_id INTEGER,
			volume_id TEXT,
			material TEXT,
			supplier TEXT,
			operator TEXT,
			weight REAL,
			status TEXT,
			date_in TEXT,
			date_out TEXT,
			notes TEXT
		)
	`, (err) => {
		if (err) {
			console.error("Erro ao garantir tabela stock_units:", err.message);
		}
	});

	// ── Migrations ───────────────────────────────────────────────────────────

	db.run(`ALTER TABLE stock_units ADD COLUMN operator TEXT`, () => {});
	db.run(`ALTER TABLE stock_units ADD COLUMN old_id TEXT`, () => {});
	db.run(`ALTER TABLE stock_units ADD COLUMN deduction_type TEXT`, () => {});
	db.run(`ALTER TABLE stock_units ADD COLUMN group_id INTEGER`, () => {});

	// ── Legacy Data Migration ─────────────────────────────────────────────────
	// Migrates rows from the deprecated "bags" table into "stock_units".

	db.get(
		`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bags'`,
		[],
		(err, row) => {
			if (err || !row) {
				return;
			}

			db.run(`
				INSERT OR IGNORE INTO stock_units (
					id,
					receipt_id,
					volume_id,
					material,
					supplier,
					operator,
					weight,
					status,
					date_in,
					date_out,
					notes
				)
				SELECT
					id,
					receipt_id,
					volume_id,
					material,
					supplier,
					NULL,
					weight,
					status,
					date_in,
					date_out,
					notes
				FROM bags
				`, (insertErr) => {
					if (insertErr) {
						console.error("Erro ao migrar bags para stock_units:", insertErr.message);
					}
				});
		}
	);
});

module.exports = db;
