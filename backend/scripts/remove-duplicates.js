const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/performance.db');

async function removeDuplicates() {
  const db = new sqlite3.Database(DB_PATH);

  console.log('🔍 중복 데이터 확인 중...\n');

  // 중복 데이터 확인
  const duplicates = await new Promise((resolve, reject) => {
    db.all(`
      SELECT
        measured_at,
        network,
        COUNT(*) as cnt,
        COUNT(DISTINCT url) as unique_urls
      FROM measurements
      WHERE measured_at LIKE '2026-01-10%'
         OR measured_at LIKE '2026-01-11%'
         OR measured_at LIKE '2026-01-12%'
      GROUP BY measured_at, network
      HAVING cnt > 65
      ORDER BY measured_at DESC
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  console.log('📊 중복 데이터 목록:');
  duplicates.forEach(dup => {
    console.log(`  - ${dup.measured_at} (${dup.network}): ${dup.cnt}개 (고유 URL: ${dup.unique_urls}개)`);
  });

  if (duplicates.length === 0) {
    console.log('\n✅ 중복 데이터가 없습니다.');
    db.close();
    return;
  }

  console.log('\n🗑️  중복 데이터 제거 중...\n');

  let totalRemoved = 0;

  for (const dup of duplicates) {
    // 각 measured_at + network 조합에서 가장 오래된 id만 남기고 삭제
    const removed = await new Promise((resolve, reject) => {
      db.run(`
        DELETE FROM measurements
        WHERE id NOT IN (
          SELECT MIN(id)
          FROM measurements
          WHERE measured_at = ? AND network = ?
          GROUP BY url
        )
        AND measured_at = ?
        AND network = ?
      `, [dup.measured_at, dup.network, dup.measured_at, dup.network], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });

    console.log(`✅ ${dup.measured_at} (${dup.network}): ${removed}개 삭제`);
    totalRemoved += removed;
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🎉 중복 제거 완료: 총 ${totalRemoved}개 레코드 삭제`);
  console.log(`${'='.repeat(80)}\n`);

  // 최종 확인
  const finalCheck = await new Promise((resolve, reject) => {
    db.all(`
      SELECT
        date(datetime(measured_at, '+9 hours')) as date,
        network,
        COUNT(*) as cnt
      FROM measurements
      WHERE measured_at >= '2026-01-09'
      GROUP BY date, network
      ORDER BY date DESC, network
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  console.log('📊 최종 데이터 현황:');
  finalCheck.forEach(row => {
    console.log(`  - ${row.date} (${row.network}): ${row.cnt}개`);
  });

  db.close((err) => {
    if (err) {
      console.error('DB 종료 중 오류:', err.message);
    } else {
      console.log('\n✅ DB 연결 종료');
    }
  });
}

removeDuplicates().catch(error => {
  console.error('❌ 오류 발생:', error);
  process.exit(1);
});
