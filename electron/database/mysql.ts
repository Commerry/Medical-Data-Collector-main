import mysql from "mysql2/promise";

export type MySqlPool = mysql.Pool;

export type MySqlConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export const createMySqlPool = (config: MySqlConfig) => {
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
};

export const testMySqlConnection = async (pool: MySqlPool) => {
  const connection = await pool.getConnection();
  await connection.ping();
  connection.release();
};

export const mysqlQuery = async <T>(
  pool: MySqlPool,
  sql: string,
  params: unknown[] = []
) => {
  const [rows] = await pool.query(sql, params);
  return rows as T;
};
