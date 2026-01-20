const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/performance.db');
const db = new sqlite3.Database(DB_PATH);

console.log('🗑️  1월 3/4/5일 불완전한 복구 데이터 삭제 중...\n');

db.run(
  `DELETE FROM measurements WHERE date(measured_at) IN ('2026-01-03', '2026-01-04', '2026-01-05')`,
  function(err) {
    if (err) {
      console.error('❌ 삭제 실패:', err.message);
      db.close();
      process.exit(1);
    }

    console.log(`✅ ${this.changes}개 레코드 삭제 완료`);

    db.get('SELECT COUNT(*) as count FROM measurements', (err2, row) => {
      if (err2) {
        console.error('카운트 실패:', err2.message);
      } else {
        console.log(`📊 남은 측정 데이터: ${row.count}개\n`);
      }

      db.close(() => {
        console.log('✅ 완료');
      });
    });
  }
);
