const { measurePageSpeed } = require('./src/pagespeed');

// 간단한 테스트
async function test() {
  console.log('PageSpeed API 테스트 시작...');
  
  try {
    // 구글 홈페이지로 테스트
    const result = await measurePageSpeed('https://www.google.com', 'Mobile');
    
    console.log('\n=== 측정 결과 ===');
    console.log('URL:', result.url);
    console.log('Performance:', result.performance_score + '점');
    console.log('상태:', result.status);
    console.log('FCP:', result.fcp + '초');
    console.log('LCP:', result.lcp + '초');
    console.log('TBT:', result.tbt + 'ms');
    console.log('\n테스트 성공!');
    
  } catch (error) {
    console.error('\n테스트 실패:', error.message);
  }
}

test();