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

function migrateStockUnitsVolumeIdToInteger() {
	db.all(`PRAGMA table_info(stock_units)`, [], (err, columns) => {
		if (err) {
			console.error("Erro ao inspecionar schema de stock_units:", err.message);
			return;
		}

		const volumeIdColumn = columns.find((column) => column.name === "volume_id");
		if (!volumeIdColumn || String(volumeIdColumn.type || "").toUpperCase() === "INTEGER") {
			return;
		}

		const rollbackMigration = (migrationErr, message) => {
			db.run("ROLLBACK", () => {
				console.error(message, migrationErr.message);
			});
		};

		db.run("BEGIN TRANSACTION", (beginErr) => {
			if (beginErr) {
				console.error("Erro ao iniciar migração de stock_units.volume_id:", beginErr.message);
				return;
			}

			db.run(`DROP TABLE IF EXISTS stock_units__new`, (dropTempErr) => {
				if (dropTempErr) {
					rollbackMigration(dropTempErr, "Erro ao preparar migração de stock_units.volume_id:");
					return;
				}

				db.run(`
					CREATE TABLE stock_units__new (
						id INTEGER PRIMARY KEY AUTOINCREMENT,
						receipt_id INTEGER,
						volume_id INTEGER,
						material TEXT,
						supplier TEXT,
						operator TEXT,
						weight REAL,
						status TEXT,
						date_in TEXT,
						date_out TEXT,
						notes TEXT,
						old_id TEXT,
						deduction_type TEXT,
						group_id INTEGER
					)
				`, (createErr) => {
					if (createErr) {
						rollbackMigration(createErr, "Erro ao criar tabela temporária de stock_units:");
						return;
					}

					db.run(`
						INSERT INTO stock_units__new (
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
							notes,
							old_id,
							deduction_type,
							group_id
						)
						SELECT
							id,
							receipt_id,
							CASE
								WHEN volume_id IS NULL OR TRIM(CAST(volume_id AS TEXT)) = '' THEN NULL
								ELSE CAST(TRIM(CAST(volume_id AS TEXT)) AS INTEGER)
							END,
							material,
							supplier,
							operator,
							weight,
							status,
							date_in,
							date_out,
							notes,
							old_id,
							deduction_type,
							group_id
						FROM stock_units
					`, (copyErr) => {
						if (copyErr) {
							rollbackMigration(copyErr, "Erro ao copiar dados de stock_units para migração:");
							return;
						}

						db.run(`DROP TABLE stock_units`, (dropOldErr) => {
							if (dropOldErr) {
								rollbackMigration(dropOldErr, "Erro ao substituir tabela stock_units:");
								return;
							}

							db.run(`ALTER TABLE stock_units__new RENAME TO stock_units`, (renameErr) => {
								if (renameErr) {
									rollbackMigration(renameErr, "Erro ao renomear tabela migrada stock_units:");
									return;
								}

								db.run("COMMIT", (commitErr) => {
									if (commitErr) {
										rollbackMigration(commitErr, "Erro ao concluir migração de stock_units.volume_id:");
										return;
									}

									console.log("Migração concluída: stock_units.volume_id ajustado para INTEGER.");
								});
							});
						});
					});
				});
			});
		});
	});
}

db.serialize(() => {

	// ── Table Creation ────────────────────────────────────────────────────────

	db.run(`
		CREATE TABLE IF NOT EXISTS stock_units (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			receipt_id INTEGER,
			volume_id INTEGER,
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
	migrateStockUnitsVolumeIdToInteger();

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
