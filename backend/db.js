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
	db.run(`ALTER TABLE stock_units ADD COLUMN material_id INTEGER`, () => {});
	db.run(`ALTER TABLE stock_units ADD COLUMN remaining_weight REAL`, (err) => {
		if (!err) {
			// First-time migration: initialize remaining_weight
			db.run(`UPDATE stock_units SET remaining_weight = weight WHERE status = 'IN_STOCK' AND remaining_weight IS NULL`);
			db.run(`UPDATE stock_units SET remaining_weight = 0 WHERE status = 'OUT_STOCK' AND remaining_weight IS NULL`);
			db.run(`UPDATE stock_units SET remaining_weight = weight WHERE status = 'PARTIAL' AND remaining_weight IS NULL`);
		}
	});
	db.run(`ALTER TABLE stock_units ADD COLUMN packaging_id INTEGER`, () => {});
	db.run(`ALTER TABLE stock_units ADD COLUMN packaging_count INTEGER`, () => {});
	db.run(`ALTER TABLE stock_units ADD COLUMN location_id INTEGER`, () => {});
	migrateStockUnitsVolumeIdToInteger();

	// ── Stock Movements Table ─────────────────────────────────────────────────

	db.run(`
		CREATE TABLE IF NOT EXISTS stock_movements (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			type        TEXT    NOT NULL,
			material_id INTEGER NOT NULL,
			quantity    REAL    NOT NULL,
			date        TEXT    NOT NULL,
			receipt_id  INTEGER,
			lot_id      INTEGER,
			location_id INTEGER,
			operator    TEXT,
			reason      TEXT,
			notes       TEXT,
			created_at  TEXT    DEFAULT (datetime('now'))
		)
	`, (err) => {
		if (err) console.error("Erro ao garantir tabela stock_movements:", err.message);
	});

	db.run(`CREATE INDEX IF NOT EXISTS idx_movements_material_type_date ON stock_movements (material_id, type, date)`, () => {});
	db.run(`CREATE INDEX IF NOT EXISTS idx_movements_lot ON stock_movements (lot_id)`, () => {});
	db.run(`ALTER TABLE stock_movements ADD COLUMN packaging_id INTEGER`, () => {});
	db.run(`ALTER TABLE stock_movements ADD COLUMN packaging_count INTEGER`, () => {});
	db.run(`ALTER TABLE stock_movements ADD COLUMN status TEXT DEFAULT 'CONFIRMED'`, () => {});

	// ── App Settings ──────────────────────────────────────────────────────────

	db.run(`CREATE TABLE IF NOT EXISTS app_settings (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	)`, (err) => {
		if (err) {
			console.error("Erro ao garantir tabela app_settings:", err.message);
			return;
		}

	});

	// ── Company Information ────────────────────────────────────────────────────

	db.run(`CREATE TABLE IF NOT EXISTS company (
		id                  INTEGER PRIMARY KEY AUTOINCREMENT,
		name                TEXT,
		cnpj                TEXT,
		ie                  TEXT,
		address             TEXT,
		neighborhood        TEXT,
		city                TEXT,
		state               TEXT,
		cep                 TEXT,
		phone               TEXT,
		email               TEXT,
		updated_at          TEXT DEFAULT (datetime('now'))
	)`, (err) => {
		if (err) {
			console.error("Erro ao garantir tabela company:", err.message);
			return;
		}
	});

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

// ── Stock Movements Migration ─────────────────────────────────────────────
// Populates stock_movements and stock_units.material_id from existing data.
// Runs once: only when stock_movements is empty and stock_units has data.

function migrateStockUnitsToMovements() {
	db.get(`SELECT COUNT(*) as cnt FROM stock_movements`, [], (err, row) => {
		if (err || (row && row.cnt > 0)) return; // already migrated or error

		db.get(`SELECT COUNT(*) as cnt FROM stock_units`, [], (err2, row2) => {
			if (err2 || !row2 || row2.cnt === 0) return; // nothing to migrate

			console.log("[migration] Migrando stock_units → stock_movements...");

			// Step 1: Populate material_id on stock_units
			db.run(`
				UPDATE stock_units SET material_id = (
					SELECT m.id FROM materials m WHERE m.name = stock_units.material
				) WHERE material_id IS NULL
			`, [], (updErr) => {
				if (updErr) {
					console.error("[migration] Erro ao popular material_id:", updErr.message);
				}

				// Step 2: Insert entry movements for ALL stock_units
				db.run(`
					INSERT INTO stock_movements (type, material_id, quantity, date, receipt_id, lot_id, location_id, operator, reason, notes)
					SELECT
						'entry',
						COALESCE(su.material_id, 0),
						su.weight,
						su.date_in,
						su.receipt_id,
						su.id,
						COALESCE(su.location_id, r.location_id),
						su.operator,
						CASE COALESCE(r.nature, '')
							WHEN 'C' THEN 'purchase'
							WHEN 'P' THEN 'production'
							WHEN 'S' THEN 'service_return'
							ELSE 'purchase'
						END,
						NULL
					FROM stock_units su
					LEFT JOIN receipts r ON r.id = su.receipt_id
					WHERE su.date_in IS NOT NULL AND su.date_in != ''
				`, [], (entryErr) => {
					if (entryErr) {
						console.error("[migration] Erro ao criar movimentações de entrada:", entryErr.message);
						return;
					}

					// Step 3: Insert exit movements for OUT_STOCK units
					db.run(`
						INSERT INTO stock_movements (type, material_id, quantity, date, receipt_id, lot_id, location_id, operator, reason, notes)
						SELECT
							'exit',
							COALESCE(su.material_id, 0),
							su.weight,
							su.date_out,
							su.receipt_id,
							su.id,
							su.location_id,
							su.operator,
							CASE COALESCE(su.deduction_type, 'uso')
								WHEN 'uso' THEN 'consumption'
								WHEN 'ajuste' THEN 'adjustment'
								ELSE 'consumption'
							END,
							su.notes
						FROM stock_units su
						WHERE su.status = 'OUT_STOCK'
						  AND su.date_out IS NOT NULL AND su.date_out != ''
					`, [], (exitErr) => {
						if (exitErr) {
							console.error("[migration] Erro ao criar movimentações de saída:", exitErr.message);
							return;
						}

						db.get(`SELECT COUNT(*) as cnt FROM stock_movements`, [], (cntErr, cntRow) => {
							const total = cntRow ? cntRow.cnt : '?';
							console.log(`[migration] Concluída: ${total} movimentações criadas.`);
						});
					});
				});
			});
		});
	});
}

// Run outside serialize to allow async completion after tables are ready
setTimeout(() => migrateStockUnitsToMovements(), 500);

module.exports = db;
