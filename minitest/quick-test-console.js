/**
 * 微信小程序控制台快速测试脚本
 * 使用方法：在微信开发者工具控制台中直接粘贴运行
 */

// ===== 快速测试函数 =====
async function quickTest() {
  console.clear()
  console.log('╔════════════════════════════════════════════╗')
  console.log('║   BabyAssistant 快速性能测试               ║')
  console.log('╚════════════════════════════════════════════╝\n')

  const results = []

  // 测试 1: API 响应速度
  try {
    console.log('📡 测试 1: API 响应速度...')
    const start = Date.now()
    const [families, babies] = await Promise.all([
      api.getFamilies(),
      api.getBabies()
    ])
    const duration = Date.now() - start
    
    console.log(`   ✅ 家庭数量：${families.length}`)
    console.log(`   ✅ 宝宝数量：${babies.length}`)
    console.log(`   ⏱️  总耗时：${duration}ms`)
    
    let score = 0
    if (duration < 500) score = 100
    else if (duration < 1000) score = 80
    else if (duration < 2000) score = 60
    else score = 40
    
    console.log(`   🎯 评分：${score}/100\n`)
    results.push({ name: 'API 响应', score, duration })
  } catch (error) {
    console.error('   ❌ API 测试失败:', error.message)
    results.push({ name: 'API 响应', score: 0, error: error.message })
  }

  // 测试 2: 缓存效率
  try {
    console.log('💾 测试 2: 缓存效率...')
    
    // 第一次请求（无缓存）
    const cacheStart1 = Date.now()
    await api.getFamilies()
    const cacheDuration1 = Date.now() - cacheStart1
    
    // 第二次请求（有缓存）
    const cacheStart2 = Date.now()
    await api.getFamilies()
    const cacheDuration2 = Date.now() - cacheStart2
    
    const speedup = cacheDuration1 / cacheDuration2
    console.log(`   ⏱️  首次请求：${cacheDuration1}ms`)
    console.log(`   ⏱️  缓存请求：${cacheDuration2}ms`)
    console.log(`   🚀 性能提升：${speedup.toFixed(1)}x`)
    
    let score = 0
    if (speedup > 5) score = 100
    else if (speedup > 3) score = 80
    else if (speedup > 2) score = 60
    else score = 40
    
    console.log(`   🎯 评分：${score}/100\n`)
    results.push({ name: '缓存效率', score, speedup })
  } catch (error) {
    console.error('   ❌ 缓存测试失败:', error.message)
    results.push({ name: '缓存效率', score: 0, error: error.message })
  }

  // 测试 3: 数据库查询
  try {
    console.log('⚡ 测试 3: 数据库索引查询...')
    const user = api.getCurrentUser()
    
    if (user && user.openid) {
      const queryStart = Date.now()
      const familiesResult = await wx.cloud.callFunction({
        name: 'login',
        data: { action: 'getFamilies' }
      })
      const queryDuration = Date.now() - queryStart
      
      console.log(`   ⏱️  查询耗时：${queryDuration}ms`)
      
      let score = 0
      if (queryDuration < 100) score = 100
      else if (queryDuration < 200) score = 80
      else if (queryDuration < 300) score = 60
      else score = 40
      
      console.log(`   🎯 评分：${score}/100\n`)
      results.push({ name: '数据库查询', score, duration: queryDuration })
    } else {
      console.log('   ⚠️  未登录，跳过测试')
      results.push({ name: '数据库查询', score: 0, error: '未登录' })
    }
  } catch (error) {
    console.error('   ❌ 数据库测试失败:', error.message)
    results.push({ name: '数据库查询', score: 0, error: error.message })
  }

  // 测试 4: 防抖功能
  try {
    console.log('🎯 测试 4: 防抖功能...')
    let callCount = 0
    const debounceFn = util.debounce(() => {
      callCount++
    }, 300)
    
    // 快速调用 5 次
    for (let i = 0; i < 5; i++) {
      debounceFn()
    }
    
    await new Promise(resolve => setTimeout(resolve, 500))
    
    console.log(`   📊 调用次数：${callCount}次 (期望 1 次)`)
    const score = callCount === 1 ? 100 : 50
    console.log(`   🎯 评分：${score}/100\n`)
    results.push({ name: '防抖功能', score, callCount })
  } catch (error) {
    console.error('   ❌ 防抖测试失败:', error.message)
    results.push({ name: '防抖功能', score: 0, error: error.message })
  }

  // 计算总分
  const validScores = results.filter(r => r.score > 0).map(r => r.score)
  const totalScore = validScores.length > 0 
    ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
    : 0

  // 输出总结
  console.log('╔════════════════════════════════════════════╗')
  console.log('║           测试完成报告                     ║')
  console.log('╚════════════════════════════════════════════╝\n')
  
  results.forEach(r => {
    const icon = r.score >= 80 ? '✅' : r.score >= 60 ? '⚠️ ' : '❌'
    console.log(`${icon} ${r.name}: ${r.score}/100`)
  })
  
  console.log(`\n🏆 综合评分：${totalScore}/100`)
  
  if (totalScore >= 90) {
    console.log('\n🎉 性能优秀！所有优化都已生效！')
  } else if (totalScore >= 70) {
    console.log('\n✅ 性能良好，还有优化空间')
  } else if (totalScore >= 60) {
    console.log('\n⚠️  性能一般，建议检查优化是否生效')
  } else {
    console.log('\n❌ 需要优化，请检查代码和数据库配置')
  }
  
  return { results, totalScore }
}

// ===== 单项测试 =====
async function testAPI() {
  console.log('\n📡 开始 API 测试...\n')
  const start = Date.now()
  const [families, babies] = await Promise.all([
    api.getFamilies(),
    api.getBabies()
  ])
  const duration = Date.now() - start
  console.log(`✅ 家庭：${families.length} | 宝宝：${babies.length} | 耗时：${duration}ms`)
}

async function testCache() {
  console.log('\n💾 开始缓存测试...\n')
  const t1 = Date.now()
  await api.getFamilies()
  const d1 = Date.now() - t1
  console.log(`首次：${d1}ms`)
  
  const t2 = Date.now()
  await api.getFamilies()
  const d2 = Date.now() - t2
  console.log(`缓存：${d2}ms`)
  console.log(`提升：${(d1/d2).toFixed(1)}x`)
}

async function testDebounce() {
  console.log('\n🎯 开始防抖测试...\n')
  let count = 0
  const fn = util.debounce(() => count++, 300)
  for (let i = 0; i < 10; i++) fn()
  await new Promise(r => setTimeout(r, 500))
  console.log(`执行次数：${count} (应该=1)`)
}

// ===== 使用说明 =====
console.log('\n╔════════════════════════════════════════════╗')
console.log('║   BabyAssistant 快速测试脚本已加载         ║')
console.log('╚════════════════════════════════════════════╝\n')
console.log('📖 使用方法:')
console.log('   1. 运行全部测试：quickTest()')
console.log('   2. 单项测试：testAPI() | testCache() | testDebounce()')
console.log('\n💡 提示：确保小程序已编译并登录云开发环境\n')
