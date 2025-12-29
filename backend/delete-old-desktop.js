const db = require('./src/database');

console.log('\n🗑️  기존 Desktop 데이터 삭제...\n');

db.run(
  `DELETE FROM measurements WHERE network = 'Desktop'`,
  function(err) {
    if (err) {
      console.error('❌ 에러:', err);
    } else {
      console.log(`✅ ${this.changes}개 Desktop 데이터 삭제 완료!`);
      console.log('\n💡 이제 Desktop 측정을 다시 시작하세요.');
    }
    db.close();
    process.exit(0);
  }
);