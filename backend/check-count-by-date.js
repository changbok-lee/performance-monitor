const db = require('./src/database');

console.log('\n📊 날짜별/네트워크별 측정 데이터 개수\n');
console.log('='.repeat(80));

db.all(
  `SELECT 
    date(measured_at) as date,
    network,
    COUNT(*) as count,
    ROUND(AVG(performance_score), 1) as avg_score,
    MIN(performance_score) as min_score,
    MAX(performance_score) as max_score
   FROM measurements 
   GROUP BY date(measured_at), network
   ORDER BY date(measured_at) DESC, network`,
  (err, rows) => {
    if (err) {
      console.error('❌ 에러:', err);
      db.close();
      return;
    }
    
    if (rows.length === 0) {
      console.log('측정 데이터가 없습니다.');
      db.close();
      return;
    }
    
    console.log('');
    console.log('날짜         | 네트워크  | 개수  | 평균  | 최소 | 최대');
    console.log('-'.repeat(80));
    
    let currentDate = '';
    let dateTotal = { Mobile: 0, Desktop: 0 };
    
    rows.forEach((row, index) => {
      const icon = row.network === 'Mobile' ? '📱' : '💻';
      
      // 날짜가 바뀌면 구분선
      if (currentDate && currentDate !== row.date) {
        console.log('-'.repeat(80));
      }
      
      console.log(
        `${row.date} | ${icon} ${row.network.padEnd(7)} | ` +
        `${String(row.count).padStart(3)}개 | ` +
        `${String(row.avg_score).padStart(4)}점 | ` +
        `${String(row.min_score).padStart(3)}점 | ` +
        `${String(row.max_score).padStart(3)}점`
      );
      
      currentDate = row.date;
      dateTotal[row.network] += row.count;
    });
    
    console.log('='.repeat(80));
    console.log(`\n📱 Mobile 총계: ${dateTotal.Mobile}개`);
    console.log(`💻 Desktop 총계: ${dateTotal.Desktop}개`);
    console.log(`📊 전체 총계: ${dateTotal.Mobile + dateTotal.Desktop}개\n`);
    
    db.close();
  }
);