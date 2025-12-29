const db = require('./src/database');

console.log('\n🗑️  CSV import 데이터 삭제 (12/15~12/23)...\n');

// CSV로 넣은 날짜들 삭제
db.run(
  `DELETE FROM measurements 
   WHERE measured_at LIKE '2025-12-1_%' 
   AND measured_at < '2025-12-24'
   AND (fcp = 0 OR fcp IS NULL)`,
  function(err) {
    if (err) {
      console.error('❌ 삭제 실패:', err);
    } else {
      console.log(`✅ ${this.changes}개 데이터 삭제 완료!`);
    }
    db.close();
    process.exit(0);
  }
);