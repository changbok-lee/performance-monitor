const db = require('./src/database');

console.log('\n🔍 최근 측정 데이터 확인...\n');

db.all(
  `SELECT 
    date(measured_at) as date,
    network,
    COUNT(*) as count,
    AVG(performance_score) as avg_score
   FROM measurements 
   GROUP BY date(measured_at), network
   ORDER BY date(measured_at) DESC
   LIMIT 10`,
  (err, rows) => {
    if (err) {
      console.error('❌ 에러:', err);
      db.close();
      return;
    }
    
    console.log('📋 날짜별 측정 데이터:\n');
    
    rows.forEach(row => {
      const icon = row.network === 'Mobile' ? '📱' : '💻';
      console.log(`${row.date} | ${icon} ${row.network.padEnd(7)} | ${row.count}개 | 평균 ${Math.round(row.avg_score)}점`);
    });
    
    console.log('\n');
    db.close();
  }
);