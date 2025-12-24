const db = require('./src/database');

console.log('데이터베이스 테스트 시작...');

setTimeout(() => {
  console.log('테스트 완료!');
  db.close();
  process.exit(0);
}, 5000);