// 수동으로 측정 실행하는 스크립트
const scheduler = require('./src/scheduler');

console.log('='.repeat(50));
console.log('📊 성능 측정 수동 실행');
console.log('='.repeat(50));

scheduler.runScheduledMeasurement().then(() => {
  console.log('\n✅ 측정 완료!');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ 측정 실패:', error);
  process.exit(1);
});