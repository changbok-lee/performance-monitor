require('dotenv').config();
const { measurePageSpeed } = require('./src/pagespeed');

async function testMeasure() {
  console.log('\n🧪 테스트 측정 시작...\n');
  
  const url = 'https://seapuri.co.kr/';
  const network = 'Mobile';
  
  try {
    const result = await measurePageSpeed(url, network);
    
    console.log('\n📊 측정 결과:');
    console.log('  - URL:', result.url);
    console.log('  - Performance:', result.performance_score + '점');
    console.log('  - 상태:', result.status);
    console.log('\n⚠️  주요 문제점:');
    console.log('  ' + (result.issues || '없음'));
    console.log('\n💡 개선 제안:');
    console.log('  ' + (result.suggestions || '없음'));
    
  } catch (error) {
    console.error('\n❌ 측정 실패:', error.message);
  }
  
  process.exit(0);
}

testMeasure();