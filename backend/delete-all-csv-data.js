const db = require('./src/database');

console.log('\n🗑️  12/15~12/23 CSV 데이터 전체 삭제...\n');

db.run(
  `DELETE FROM measurements
   WHERE measured_at >= '2025-12-15' 
   AND measured_at < '2025-12-24'`,
  function(err) {
    if (err) {
      console.error('❌ 에러:', err);
    } else {
      console.log(`✅ ${this.changes}개 데이터 삭제 완료!`);
    }
    db.close();
    process.exit(0);
  }
);