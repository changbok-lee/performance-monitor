const db = require('./src/database');

console.log('\n🔍 12/30 측정 데이터 확인\n');

db.all(
  `SELECT 
    measured_at,
    url,
    site_name,
    network,
    performance_score
   FROM measurements 
   WHERE date(measured_at) = '2025-12-30'
   AND network = 'Mobile'
   ORDER BY url
   LIMIT 10`,
  (err, rows) => {
    if (err) {
      console.error('❌ 에러:', err);
      db.close();
      return;
    }
    
    console.log(`📋 12/30 Mobile 데이터: ${rows.length}개 (샘플 10개)\n`);
    
    rows.forEach((row, i) => {
      console.log(`${i + 1}. ${row.measured_at}`);
      console.log(`   ${row.site_name || row.url}`);
      console.log(`   Score: ${row.performance_score}\n`);
    });
    
    // 전체 개수
    db.get(
      `SELECT COUNT(*) as count 
       FROM measurements 
       WHERE date(measured_at) = '2025-12-30'
       AND network = 'Mobile'`,
      (err, row) => {
        if (!err) {
          console.log(`\n📊 12/30 Mobile 전체: ${row.count}개`);
        }
        db.close();
      }
    );
  }
);