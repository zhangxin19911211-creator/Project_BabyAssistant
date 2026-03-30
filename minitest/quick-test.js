/**
 * 微信小程序性能快速测试脚本
 * 适用于微信开发者工具 v1.6.4+
 * 
 * 使用方法：
 * 1. 编译运行小程序
 * 2. 点击"调试器" → "Console"
 * 3. 复制下方代码粘贴到控制台回车执行
 */

// ===== 测试配置 =====
const TEST_CONFIG = {
  timeout: 10000,
  enableCache: true,
  verbose: true
}

// ===== 测试工具 =====
const TestUtil = {
  randomString(length = 8) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  },

  formatTime(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}/${month}/${day}`
  },

  assert(condition, message) {
    if (condition) {
      console.log(`✅ ${message}`)
      return true
    } else {
      console.error(`❌ ${message}`)
      return false
    }
  },

  async measureTime(name, fn) {
    const start = Date.now()
    try {
      const result = await fn()
      const duration = Date.now() - start
      console.log(`⏱️  ${name}: ${duration}ms`)
      return { result, duration }
    } catch (error) {
      const duration = Date.now() - start
      console.error(`⏱️  ${name}: ${duration}ms (失败)`)
      throw error
    }
  }
}

// ===== 核心测试函数 =====
async function runPerformanceTest() {
  console.clear()
  console.log('╔════════════════════════════════════════════╗')
  console.log('║   BabyAssistant 性能测试                   ║')
  console.log('║   v2.0 - 微信开发者工具 v1.6.4             ║')
  console.log('╚════════════════════════════════════════════╝\n')

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    scores: {}
  }

  try {
    // 测试 1: API 响应速度
    console.log('📦 测试 1: API 响应速度')
    const apiStart = Date.now()
    const [babies, families] = await Promise.all([
      wx.cloud.callFunction({ name: 'login', data: { action: 'getBabies' } }),
      wx.cloud.callFunction({ name: 'login', data: { action: 'getFamilies' } })
    ])
    const apiDuration = Date.now() - apiStart
    
    results.scores.apiResponse = apiDuration < 500 ? 100 : apiDuration < 1000 ? 80 : 60
    console.log(`   宝宝数量：${babies.result.babies.length}`)
    console.log(`   家庭数量：${families.result.families.length}`)
    console.log(`   总耗时：${apiDuration}ms`)
    console.log(`   评分：${results.scores.apiResponse}/100\n`)

    // 测试 2: 缓存效率
    if (TEST_CONFIG.enableCache) {
      console.log('💾 测试 2: 缓存效率')
      const cacheStart1 = Date.now()
      await wx.cloud.callFunction({ name: 'login', data: { action: 'getFamilies' } })
      const cacheDuration1 = Date.now() - cacheStart1
      
      const cacheStart2 = Date.now()
      await wx.cloud.callFunction({ name: 'login', data: { action: 'getFamilies' } })
      const cacheDuration2 = Date.now() - cacheStart2
      
      const cacheRatio = cacheDuration1 / cacheDuration2
      results.scores.cacheEfficiency = cacheRatio > 5 ? 100 : cacheRatio > 3 ? 80 : 60
      console.log(`   第一次：${cacheDuration1}ms`)
      console.log(`   第二次：${cacheDuration2}ms`)
      console.log(`   提升：${cacheRatio.toFixed(1)}x`)
      console.log(`   评分：${results.scores.cacheEfficiency}/100\n`)
    }

    // 测试 3: 数据库索引查询
    console.log('⚡ 测试 3: 数据库索引性能')
    const db = wx.cloud.database()
    const user = wx.cloud.CloudContext ? wx.cloud.CloudContext.userId : null
    
    if (user) {
      const queryStart = Date.now()
      const queryResult = await db.collection('families')
        .where({ 'members.openid': user })
        .get()
      const queryDuration = Date.now() - queryStart
      
      results.scores.queryOptimization = queryDuration < 100 ? 100 : queryDuration < 200 ? 80 : 60
      console.log(`   查询用户家庭：${queryDuration}ms`)
      console.log(`   结果数量：${queryResult.data.length}`)
      console.log(`   评分：${results.scores.queryOptimization}/100\n`)
    } else {
      console.log('   ⚠️  无法获取用户信息，跳过索引测试')
      results.scores.queryOptimization = 0
    }

    // 计算综合评分
    const scoreValues = Object.values(results.scores)
    const overallScore = Math.round(
      scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length
    )
    results.overallScore = overallScore

    // 输出最终报告
    console.log('╔════════════════════════════════════════════╗')
    console.log('║           性能评分报告                     ║')
    console.log('╚════════════════════════════════════════════╝\n')
    
    console.log(`📡 API 响应速度：${results.scores.apiResponse}/100`)
    console.log(`💾 缓存效率：${results.scores.cacheEfficiency || 'N/A'}/100`)
    console.log(`⚡ 查询优化：${results.scores.queryOptimization}/100`)
    console.log(`\n🎯 综合评分：${overallScore}/100`)
    
    if (overallScore >= 90) {
      console.log('\n✅ 性能优秀！继续保持！')
    } else if (overallScore >= 70) {
      console.log('\n✅ 性能良好，还有优化空间')
    } else if (overallScore >= 60) {
      console.log('\n⚠️ 性能一般，建议优化')
    } else {
      console.log('\n❌ 需要立即优化')
    }
    
    console.log('\n═══════════════════════════════════════════\n')

    results.passed = results.total
    return results

  } catch (error) {
    console.error('\n❌ 测试执行失败:', error)
    results.failed++
    return results
  }
}

// ===== 并行请求对比测试 =====
async function testParallelVsSerial() {
  console.log('\n🔄 并行 vs 串行请求对比测试\n')
  
  // 串行测试
  console.log('测试串行请求...')
  const serialStart = Date.now()
  await wx.cloud.callFunction({ name: 'login', data: { action: 'getBabies' } })
  await wx.cloud.callFunction({ name: 'login', data: { action: 'getFamilies' } })
  const serialDuration = Date.now() - serialStart
  console.log(`⏱️  串行总耗时：${serialDuration}ms`)
  
  // 并行测试
  console.log('测试并行请求...')
  const parallelStart = Date.now()
  await Promise.all([
    wx.cloud.callFunction({ name: 'login', data: { action: 'getBabies' } }),
    wx.cloud.callFunction({ name: 'login', data: { action: 'getFamilies' } })
  ])
  const parallelDuration = Date.now() - parallelStart
  console.log(`⏱️  并行总耗时：${parallelDuration}ms`)
  
  // 计算提升
  const speedup = ((serialDuration - parallelDuration) / serialDuration * 100).toFixed(1)
  console.log(`\n📊 性能提升：${speedup}%`)
  console.log(parallelDuration < serialDuration ? '✅ 并行优化有效！' : '⚠️  并行效果不明显')
}

// ===== 防抖测试 =====
function testDebounce() {
  console.log('\n🎯 防抖函数测试\n')
  
  let callCount = 0
  const util = require('../../utils/util.js')
  const debounceFn = util.debounce(() => {
    callCount++
    console.log(`防抖函数执行，调用次数：${callCount}`)
  }, 300)
  
  console.log('快速连续调用 5 次...')
  for (let i = 0; i < 5; i++) {
    debounceFn()
  }
  
  setTimeout(() => {
    console.log(`\n等待 500ms 后，实际执行次数：${callCount}`)
    console.log(callCount === 1 ? '✅ 防抖正常！' : `⚠️  执行了${callCount}次，可能有问题`)
  }, 500)
}

// ===== 主函数 - 一键运行所有测试 =====
async function runAllTests() {
  await runPerformanceTest()
  await testParallelVsSerial()
  testDebounce()
}

// ===== 自动提示 =====
console.log('\n✅ 测试脚本已加载完成！\n')
console.log('📋 可用命令:')
console.log('   1. runAllTests()              - 运行所有测试')
console.log('   2. runPerformanceTest()       - 性能评分测试')
console.log('   3. testParallelVsSerial()     - 并行/串行对比')
console.log('   4. testDebounce()             - 防抖测试')
console.log('\n💡 建议先运行：runPerformanceTest()\n')
