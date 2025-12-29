const { exec } = require('child_process');
const path = require('path');

function autoPull() {
  return new Promise((resolve, reject) => {
    console.log('\n🔄 GitHub에서 최신 데이터 확인 중...');
    
    const projectRoot = path.join(__dirname, '..');
    
    exec('git pull', { cwd: projectRoot }, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Git pull 실패:', error.message);
        reject(error);
        return;
      }
      
      if (stdout.includes('Already up to date')) {
        console.log('✅ 이미 최신 상태입니다.');
      } else {
        console.log('✅ 최신 데이터를 받았습니다.');
        console.log(stdout);
      }
      
      resolve();
    });
  });
}

module.exports = { autoPull };