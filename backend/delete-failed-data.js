const db = require('./src/database');

console.log('\n🗑️  12월 29일 실패 데이터 삭제...\n');

// 먼저 확인
db.all(
  `SELECT 
    date(measured_at) as date,
    network,
    COUNT(*) as count
   FROM measurements 
   WHERE date(measured_at) = '2025-12-29'
   AND (performance_score = 0 OR error IS NOT NULL)
   GROUP BY network`,
  (err, rows) => {
    if (err) {
      console.error('❌ 에러:', err);
      db.close();
      return;
    }
    
    if (rows.length === 0) {
      console.log('12/29 실패 데이터가 없습니다.');
      db.close();
      process.exit(0);
      return;
    }
    
    console.log('📋 삭제할 데이터:\n');
    
    let total = 0;
    rows.forEach(row => {
      const icon = row.network === 'Mobile' ? '📱' : '💻';
      console.log(`2025-12-29 | ${icon} ${row.network.padEnd(7)} | ${row.count}개`);
      total += row.count;
    });
    
    console.log(`\n총 ${total}개\n`);
    console.log('⚠️  삭제하려면: node delete-1229.js confirm\n');
    
    // 삭제 실행
    if (process.argv[2] === 'confirm') {
      db.run(
        `DELETE FROM measurements 
         WHERE date(measured_at) = '2025-12-29'
         AND (performance_score = 0 OR error IS NOT NULL)`,
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
    } else {
      db.close();
      process.exit(0);
    }
  }
);