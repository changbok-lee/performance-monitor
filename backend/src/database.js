const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database/performance.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('데이터베이스 연결 실패:', err.message);
  } else {
    console.log('데이터베이스 연결 성공!');
  }
});

function initDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS url_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      site_name TEXT,
      page_detail TEXT,
      network TEXT CHECK(network IN ('Mobile', 'Desktop')),
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(url, network)
    )
  `, (err) => {
    if (err) {
      console.error('url_master 테이블 생성 실패:', err.message);
    } else {
      console.log('url_master 테이블 준비 완료');
    }
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_master_id INTEGER,
      measured_at DATETIME NOT NULL,
      url TEXT NOT NULL,
      site_name TEXT,
      page_detail TEXT,
      network TEXT,
      performance_score INTEGER,
      status TEXT,
      fcp REAL,
      lcp REAL,
      tbt INTEGER,
      speed_index REAL,
      cls REAL,
      tti REAL,
      measurement_time TEXT,
      issues TEXT,
      suggestions TEXT,
      error TEXT, 
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (url_master_id) REFERENCES url_master(id)
    )
  `, (err) => {
    if (err) {
      console.error('measurements 테이블 생성 실패:', err.message);
    } else {
      console.log('measurements 테이블 준비 완료');
    }
  });
}

initDatabase();

module.exports = db;