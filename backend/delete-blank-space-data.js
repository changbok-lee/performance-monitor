const db = require('./src/database');

console.log('\n🗑️  FCP/LCP/TBT 값이 0인 중복 데이터 삭제...\n');

// 같은 URL, 같은 시간에 2개가 있고, 하나는 FCP가 0인 경우
db.all(
  `SELECT measured_at, url, COUNT(*) as count
   FROM measurements
   WHERE measured_at LIKE '2025-12-%'
   GROUP BY measured_at, url
   HAVING COUNT(*) > 1`,
  (err, duplicates) => {
    if (err) {
      console.error('❌ 에러:', err);
      db.close();
      return;
    }
    
    console.log(`📋 중복 발견: ${duplicates.length}개 URL\n`);
    
    if (duplicates.length === 0) {
      console.log('중복 없음!');
      db.close();
      process.exit(0);
      return;
    }
    
    // 각 중복에서 FCP=0인 것만 삭제
    let deleteCount = 0;
    
    duplicates.forEach(dup => {
      db.all(
        `SELECT id, measured_at, url, fcp, lcp, tbt
         FROM measurements
         WHERE measured_at = ? AND url = ?
         ORDER BY id`,
        [dup.measured_at, dup.url],
        (err, rows) => {
          if (err) {
            console.error('❌ 에러:', err);
            return;
          }
          
          console.log(`\n📍 ${dup.measured_at} | ${dup.url.substring(0, 40)}`);
          rows.forEach(r => {
            console.log(`  ID ${r.id}: FCP=${r.fcp}, LCP=${r.lcp}, TBT=${r.tbt}`);
          });
          
          // FCP=0이고 LCP=0인 것 찾기
          const toDelete = rows.filter(r => r.fcp === 0 && r.lcp === 0 && r.tbt === 0);
          
          if (toDelete.length > 0) {
            toDelete.forEach(r => {
              db.run('DELETE FROM measurements WHERE id = ?', [r.id], (err) => {
                if (!err) {
                  deleteCount++;
                  console.log(`  ✅ ID ${r.id} 삭제`);
                }
              });
            });
          }
        }
      );
    });
    
    // 완료 대기
    setTimeout(() => {
      console.log(`\n🎉 총 ${deleteCount}개 삭제 완료!`);
      db.close();
      process.exit(0);
    }, 2000);
  }
);