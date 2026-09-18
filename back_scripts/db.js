import sqlite3 from "sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * SQLite 数据库管理模块
 */
class TransferDatabase {
  constructor() {
    this.db = null;
  }

  /**
   * 初始化数据库连接并建表
   * @param {string} dbPath 数据库文件路径 (如 ./data/indexer.db 或 :memory:)
   */
  async init(dbPath) {
    if (this.db) return this;

    if (dbPath !== ":memory:") {
      const dir = path.dirname(path.resolve(dbPath));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) return reject(err);

        // 启用 WAL 模式提高并发性能
        if (dbPath !== ":memory:") {
          this.db.run("PRAGMA journal_mode = WAL;");
        }

        this._createTables()
          .then(() => resolve(this))
          .catch(reject);
      });
    });
  }

  /**
   * 创建数据表及索引
   */
  async _createTables() {
    const createTransfersTable = `
      CREATE TABLE IF NOT EXISTS transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_address TEXT NOT NULL,
        block_number INTEGER NOT NULL,
        block_hash TEXT,
        transaction_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        amount TEXT NOT NULL,
        amount_formatted TEXT,
        timestamp INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(transaction_hash, log_index)
      );
    `;

    const createIndexes = [
      "CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_address);",
      "CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_address);",
      "CREATE INDEX IF NOT EXISTS idx_transfers_block ON transfers(block_number);",
      "CREATE INDEX IF NOT EXISTS idx_transfers_token ON transfers(token_address);",
    ];

    const createSyncStateTable = `
      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await this.run(createTransfersTable);
    for (const sql of createIndexes) {
      await this.run(sql);
    }
    await this.run(createSyncStateTable);
  }

  /**
   * 执行 SQL 语句
   */
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  /**
   * 查询单行
   */
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * 查询多行
   */
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * 插入单笔转账记录（自动去重）
   * @param {Object} transfer
   */
  async insertTransfer(transfer) {
    const {
      tokenAddress,
      blockNumber,
      blockHash = "",
      transactionHash,
      logIndex,
      from,
      to,
      amount,
      amountFormatted = "",
      timestamp = 0,
    } = transfer;

    const sql = `
      INSERT OR IGNORE INTO transfers (
        token_address,
        block_number,
        block_hash,
        transaction_hash,
        log_index,
        from_address,
        to_address,
        amount,
        amount_formatted,
        timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;

    const params = [
      (tokenAddress || "").toLowerCase(),
      Number(blockNumber),
      blockHash || "",
      transactionHash,
      Number(logIndex),
      (from || "").toLowerCase(),
      (to || "").toLowerCase(),
      amount?.toString() || "0",
      amountFormatted?.toString() || "",
      Number(timestamp || 0),
    ];

    const result = await this.run(sql, params);
    return {
      inserted: result.changes > 0,
      id: result.lastID,
    };
  }

  /**
   * 批量插入转账记录（带事务，自动去重）
   * @param {Array<Object>} transfers
   * @returns {Promise<number>} 实际新插入的数量
   */
  async insertTransfers(transfers) {
    if (!transfers || transfers.length === 0) return 0;

    await this.run("BEGIN TRANSACTION;");
    let insertedCount = 0;

    try {
      for (const item of transfers) {
        const res = await this.insertTransfer(item);
        if (res.inserted) insertedCount++;
      }
      await this.run("COMMIT;");
      return insertedCount;
    } catch (err) {
      await this.run("ROLLBACK;");
      throw err;
    }
  }

  /**
   * 按目标地址查询转账记录
   * @param {string} address 以太坊地址
   * @param {Object} options
   * @param {'all'|'in'|'out'} [options.direction='all'] 出入账方向
   * @param {number} [options.page=1]
   * @param {number} [options.limit=20]
   */
  async getTransfersByAddress(address, { direction = "all", page = 1, limit = 20 } = {}) {
    const normalizedAddr = (address || "").toLowerCase();
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = "";
    let params = [];

    if (direction === "in" || direction === "to") {
      whereClause = "WHERE to_address = ?";
      params = [normalizedAddr];
    } else if (direction === "out" || direction === "from") {
      whereClause = "WHERE from_address = ?";
      params = [normalizedAddr];
    } else {
      whereClause = "WHERE from_address = ? OR to_address = ?";
      params = [normalizedAddr, normalizedAddr];
    }

    const countSql = `SELECT COUNT(*) as total FROM transfers ${whereClause};`;
    const countRow = await this.get(countSql, params);
    const total = countRow?.total || 0;

    const dataSql = `
      SELECT
        id,
        token_address as tokenAddress,
        block_number as blockNumber,
        block_hash as blockHash,
        transaction_hash as transactionHash,
        log_index as logIndex,
        from_address as "from",
        to_address as "to",
        amount,
        amount_formatted as amountFormatted,
        timestamp,
        created_at as createdAt
      FROM transfers
      ${whereClause}
      ORDER BY block_number DESC, log_index DESC
      LIMIT ? OFFSET ?;
    `;

    const rows = await this.all(dataSql, [...params, limitNum, offset]);
    const totalPages = Math.ceil(total / limitNum) || (total > 0 ? 1 : 0);

    return {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      list: rows,
    };
  }

  /**
   * 分页获取全局转账记录
   * @param {Object} options
   * @param {string} [options.tokenAddress]
   * @param {number} [options.page=1]
   * @param {number} [options.limit=20]
   */
  async getAllTransfers({ tokenAddress, page = 1, limit = 20 } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = "";
    let params = [];

    if (tokenAddress) {
      whereClause = "WHERE token_address = ?";
      params = [tokenAddress.toLowerCase()];
    }

    const countSql = `SELECT COUNT(*) as total FROM transfers ${whereClause};`;
    const countRow = await this.get(countSql, params);
    const total = countRow?.total || 0;

    const dataSql = `
      SELECT
        id,
        token_address as tokenAddress,
        block_number as blockNumber,
        block_hash as blockHash,
        transaction_hash as transactionHash,
        log_index as logIndex,
        from_address as "from",
        to_address as "to",
        amount,
        amount_formatted as amountFormatted,
        timestamp,
        created_at as createdAt
      FROM transfers
      ${whereClause}
      ORDER BY block_number DESC, log_index DESC
      LIMIT ? OFFSET ?;
    `;

    const rows = await this.all(dataSql, [...params, limitNum, offset]);
    const totalPages = Math.ceil(total / limitNum) || (total > 0 ? 1 : 0);

    return {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      list: rows,
    };
  }

  /**
   * 获取同步状态
   * @param {string} key
   */
  async getSyncState(key) {
    const row = await this.get("SELECT value FROM sync_state WHERE key = ?;", [key]);
    return row ? row.value : null;
  }

  /**
   * 设置同步状态
   * @param {string} key
   * @param {string|number} value
   */
  async setSyncState(key, value) {
    const sql = `
      INSERT INTO sync_state (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;
    `;
    await this.run(sql, [key, value?.toString()]);
  }

  /**
   * 获取数据库统计状态
   */
  async getStats() {
    const countRow = await this.get("SELECT COUNT(*) as total FROM transfers;");
    const blockRow = await this.get("SELECT MIN(block_number) as minBlock, MAX(block_number) as maxBlock FROM transfers;");

    return {
      totalTransfers: countRow?.total || 0,
      minBlock: blockRow?.minBlock || null,
      maxBlock: blockRow?.maxBlock || null,
    };
  }

  /**
   * 关闭数据库连接
   */
  close() {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      this.db.close((err) => {
        if (err) reject(err);
        else {
          this.db = null;
          resolve();
        }
      });
    });
  }
}

export const dbInstance = new TransferDatabase();
export default TransferDatabase;
