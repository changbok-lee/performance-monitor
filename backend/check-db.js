const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'performance.db');
const db = new sqlite3.Database(dbPath);

console.log('\n=== 데이터베이스 확인 ===\n');

// 전체 데이터 개수
db.get('SELECT COUNT(*) as total FROM measurements', (err, row) => {
  if (err) {
    console.error('에러:', err);
    return;
  }
  console.log(`📊 전체 측정 데이터: ${row.total}개`);
});

// 12/28 데이터 확인
db.get(`SELECT COUNT(*) as count FROM measurements WHERE measured_at LIKE '2025-12-28%'`, (err, row) => {
  if (err) {
    console.error('에러:', err);
    return;
  }
  console.log(`📅 12/28 데이터: ${row.count}개`);
});

// 12/27 데이터 확인
db.get(`SELECT COUNT(*) as count FROM measurements WHERE measured_at LIKE '2025-12-27%'`, (err, row) => {
  if (err) {
    console.error('에러:', err);
    return;
  }
  console.log(`📅 12/27 데이터: ${row.count}개`);
});

// 최근 5개 데이터
db.all('SELECT measured_at, url, network, performance_score FROM measurements ORDER BY measured_at DESC LIMIT 5', (err, rows) => {
  if (err) {
    console.error('에러:', err);
    db.close();
    return;
  }

  console.log('\n📋 최근 5개 측정:\n');
  rows.forEach((row, index) => {
    console.log(`${index + 1}. ${row.measured_at} | ${row.network} | ${row.performance_score}점`);
    console.log(`   ${row.url}`);
  });

  console.log('\n');
  db.close();
});