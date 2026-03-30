/**
 * 小程序自动化测试脚本
 * 使用方法：在微信开发者工具控制台中运行此脚本
 */

// ===== 测试配置 =====
const TEST_CONFIG = {
  timeout: 10000, // 超时时间 10 秒
  enableCache: true, // 是否启用缓存测试
  verbose: true, // 详细日志
}

// ===== 测试工具函数 =====
const TestUtil = {
  // 生成随机字符串
  randomString(length = 8) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  },

  // 格式化时间
  formatTime(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}/${month}/${day}`
  },

  // 断言函数
  assert(condition, message) {
    if (condition) {
      console.log(`✅ ${message}`)
      return true
    } else {
      console.error(`❌ ${message}`)
      return false
    }
  },

  // 性能测试
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
  },
}

// ===== 测试用例 =====
const Tests = {
  // 测试 1: API 基础功能测试
  async testAPIBasics() {
    console.group('📦 API 基础功能测试')
    const results = []

    try {
      // 测试获取家庭列表
      const familiesTest = await TestUtil.measureTime('获取家庭列表', async () => {
        const families = await api.getFamilies()
        return families
      })
      results.push(TestUtil.assert(
        Array.isArray(familiesTest.result),
        `家庭列表应该是数组，数量：${familiesTest.result.length}`
      ))

      // 测试获取宝宝列表
      const babiesTest = await TestUtil.measureTime('获取宝宝列表', async () => {
        const babies = await api.getBabies()
        return babies
      })
      results.push(TestUtil.assert(
        Array.isArray(babiesTest.result),
        `宝宝列表应该是数组，数量：${babiesTest.result.length}`
      ))

      // 测试缓存机制
      if (TEST_CONFIG.enableCache) {
        console.log('\n🔄 测试缓存机制...')
        const cacheTest1 = await TestUtil.measureTime('第一次请求（无缓存）', async () => {
          return await api.getFamilies()
        })
        
        const cacheTest2 = await TestUtil.measureTime('第二次请求（有缓存）', async () => {
          return await api.getFamilies()
        })

        const cacheSpeedup = cacheTest1.duration / cacheTest2.duration
        results.push(TestUtil.assert(
          cacheSpeedup > 2,
          `缓存应该提升性能 ${cacheSpeedup.toFixed(1)}x (期望 > 2x)`
        ))
      }

      console.groupEnd()
      return results.every(r => r)
    } catch (error) {
      console.error('API 基础功能测试失败:', error)
      console.groupEnd()
      return false
    }
  },

  // 测试 2: 宝宝管理功能测试
  async testBabyManagement() {
    console.group('\n👶 宝宝管理功能测试')
    const results = []

    try {
      // 获取当前宝宝列表
      const initialBabies = await api.getBabies()
      console.log(`初始宝宝数量：${initialBabies.length}`)

      // 测试添加宝宝（模拟数据，不实际提交）
      const testBabyData = {
        name: `测试宝宝_${TestUtil.randomString(4)}`,
        gender: Math.random() > 0.5 ? 'male' : 'female',
        birthDate: TestUtil.formatTime(new Date()),
        birthHeight: 50,
        birthWeight: 3.0,
        familyId: initialBabies.length > 0 ? initialBabies[0].familyId : undefined
      }

      console.log('\n📝 测试添加宝宝数据验证...')
      console.log('测试数据:', testBabyData)

      // 验证数据结构
      results.push(TestUtil.assert(
        testBabyData.name && testBabyData.gender && testBabyData.birthDate,
        '宝宝数据结构完整'
      ))

      // 测试计算年龄
      const ageInMonths = util.calculateAge(testBabyData.birthDate)
      results.push(TestUtil.assert(
        typeof ageInMonths === 'number',
        `年龄计算正确：${ageInMonths}个月`
      ))

      // 测试格式化年龄
      const ageStr = util.formatAgeString(ageInMonths)
      results.push(TestUtil.assert(
        typeof ageStr === 'string',
        `年龄格式化正确：${ageStr}`
      ))

      console.groupEnd()
      return results.every(r => r)
    } catch (error) {
      console.error('宝宝管理功能测试失败:', error)
      console.groupEnd()
      return false
    }
  },

  // 测试 3: 成长记录功能测试
  async testRecordManagement() {
    console.group('\n📊 成长记录功能测试')
    const results = []

    try {
      // 获取所有宝宝
      const babies = await api.getBabies()
      if (babies.length === 0) {
        console.warn('⚠️  没有宝宝数据，跳过记录测试')
        console.groupEnd()
        return true
      }

      // 测试获取最新记录
      const testBaby = babies[0]
      console.log(`\n测试宝宝：${testBaby.name}`)
      
      const latestRecordTest = await TestUtil.measureTime(
        '获取最新记录',
        async () => {
          return await api.getLatestRecord(testBaby._id)
        }
      )
      
      results.push(TestUtil.assert(
        latestRecordTest.result === null || typeof latestRecordTest.result === 'object',
        '最新记录查询成功'
      ))

      // 测试获取所有记录
      const recordsTest = await TestUtil.measureTime(
        '获取所有记录',
        async () => {
          return await api.getRecordsByBabyId(testBaby._id)
        }
      )

      results.push(TestUtil.assert(
        Array.isArray(recordsTest.result),
        `记录列表应该是数组，数量：${recordsTest.result.length}`
      ))

      // 测试记录数据统计
      const records = recordsTest.result
      if (records.length > 0) {
        const hasHeight = records.some(r => r.height)
        const hasWeight = records.some(r => r.weight)
        
        results.push(TestUtil.assert(
          hasHeight || hasWeight,
          '记录包含身高或体重数据'
        ))
      }

      console.groupEnd()
      return results.every(r => r)
    } catch (error) {
      console.error('成长记录功能测试失败:', error)
      console.groupEnd()
      return false
    }
  },

  // 测试 4: 数据库索引性能测试
  async testDatabaseIndexPerformance() {
    console.group('\n⚡ 数据库索引性能测试')
    const results = []

    try {
      // 测试 families.members.openid 索引
      const currentUser = api.getCurrentUser()
      if (currentUser && currentUser.openid) {
        const familyQueryTest = await TestUtil.measureTime(
          '查询用户家庭（使用索引）',
          async () => {
            return await db.collection('families')
              .where({ 'members.openid': currentUser.openid })
              .get()
          }
        )
        
        results.push(TestUtil.assert(
          familyQueryTest.duration < 200,
          `家庭查询应该在 200ms 内，实际：${familyQueryTest.duration}ms`
        ))
      }

      // 测试 babies.familyId 索引
      const babies = await api.getBabies()
      if (babies.length > 0 && babies[0].familyId) {
        const babyQueryTest = await TestUtil.measureTime(
          '查询家庭宝宝（使用索引）',
          async () => {
            return await db.collection('babies')
              .where({ familyId: babies[0].familyId })
              .get()
          }
        )

        results.push(TestUtil.assert(
          babyQueryTest.duration < 200,
          `宝宝查询应该在 200ms 内，实际：${babyQueryTest.duration}ms`
        ))
      }

      // 测试 records.babyId 索引
      if (babies.length > 0) {
        const recordQueryTest = await TestUtil.measureTime(
          '查询成长记录（使用索引）',
          async () => {
            return await db.collection('records')
              .where({ babyId: babies[0]._id })
              .orderBy('recordDate', 'desc')
              .limit(1)
              .get()
          }
        )

        results.push(TestUtil.assert(
          recordQueryTest.duration < 200,
          `记录查询应该在 200ms 内，实际：${recordQueryTest.duration}ms`
        ))
      }

      console.groupEnd()
      return results.every(r => r)
    } catch (error) {
      console.error('数据库索引性能测试失败:', error)
      console.groupEnd()
      return false
    }
  },

  // 测试 5: 并行请求优化测试
  async testParallelRequests() {
    console.group('\n🔄 并行请求优化测试')
    const results = []

    try {
      // 串行请求测试
      console.log('测试串行请求...')
      const serialStart = Date.now()
      await api.getBabies()
      await api.getFamilies()
      const serialDuration = Date.now() - serialStart
      console.log(`⏱️  串行请求总耗时：${serialDuration}ms`)

      // 并行请求测试
      console.log('测试并行请求...')
      const parallelStart = Date.now()
      const [babies, families] = await Promise.all([
        api.getBabies(),
        api.getFamilies()
      ])
      const parallelDuration = Date.now() - parallelStart
      console.log(`⏱️  并行请求总耗时：${parallelDuration}ms`)

      // 计算性能提升
      const speedup = serialDuration / parallelDuration
      results.push(TestUtil.assert(
        parallelDuration < serialDuration,
        `并行请求应该比串行快，提升 ${(speedup - 1) * 100}%`
      ))

      console.groupEnd()
      return results.every(r => r)
    } catch (error) {
      console.error('并行请求优化测试失败:', error)
      console.groupEnd()
      return false
    }
  },

  // 测试 6: 防抖节流功能测试
  async testDebounceThrottle() {
    console.group('\n🎯 防抖节流功能测试')
    const results = []

    try {
      // 测试防抖函数
      console.log('测试防抖函数...')
      let debounceCallCount = 0
      const debounceFn = util.debounce(() => {
        debounceCallCount++
        console.log(`防抖函数执行，调用次数：${debounceCallCount}`)
      }, 300)

      // 快速连续调用 5 次
      for (let i = 0; i < 5; i++) {
        debounceFn()
      }

      // 等待 500ms 检查执行次数
      await new Promise(resolve => setTimeout(resolve, 500))
      results.push(TestUtil.assert(
        debounceCallCount === 1,
        `防抖函数应该只执行 1 次，实际：${debounceCallCount}次`
      ))

      // 测试节流函数
      console.log('测试节流函数...')
      let throttleCallCount = 0
      const throttleFn = util.throttle(() => {
        throttleCallCount++
        console.log(`节流函数执行，调用次数：${throttleCallCount}`)
      }, 300)

      // 快速连续调用 5 次
      const throttleStart = Date.now()
      for (let i = 0; i < 5; i++) {
        throttleFn()
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      const throttleDuration = Date.now() - throttleStart

      results.push(TestUtil.assert(
        throttleCallCount >= 1 && throttleCallCount <= 3,
        `节流函数应该限制执行次数，实际：${throttleCallCount}次 (${throttleDuration}ms)`
      ))

      console.groupEnd()
      return results.every(r => r)
    } catch (error) {
      console.error('防抖节流功能测试失败:', error)
      console.groupEnd()
      return false
    }
  },

  // 测试 7: 综合性能评分
  async testOverallPerformance() {
    console.group('\n🏆 综合性能评分')
    
    const scores = {
      apiResponse: 0,
      cacheEfficiency: 0,
      queryOptimization: 0,
      overallExperience: 0
    }

    try {
      // API 响应速度评分
      const apiStart = Date.now()
      await Promise.all([api.getBabies(), api.getFamilies()])
      const apiDuration = Date.now() - apiStart
      
      if (apiDuration < 500) scores.apiResponse = 100
      else if (apiDuration < 1000) scores.apiResponse = 80
      else if (apiDuration < 2000) scores.apiResponse = 60
      else scores.apiResponse = 40

      // 缓存效率评分
      const cacheStart1 = Date.now()
      await api.getFamilies()
      const cacheDuration1 = Date.now() - cacheStart1
      
      const cacheStart2 = Date.now()
      await api.getFamilies()
      const cacheDuration2 = Date.now() - cacheStart2
      
      const cacheRatio = cacheDuration1 / cacheDuration2
      if (cacheRatio > 5) scores.cacheEfficiency = 100
      else if (cacheRatio > 3) scores.cacheEfficiency = 80
      else if (cacheRatio > 2) scores.cacheEfficiency = 60
      else scores.cacheEfficiency = 40

      // 查询优化评分
      const queryStart = Date.now()
      const user = api.getCurrentUser()
      if (user && user.openid) {
        await db.collection('families')
          .where({ 'members.openid': user.openid })
          .get()
        const queryDuration = Date.now() - queryStart
        
        if (queryDuration < 100) scores.queryOptimization = 100
        else if (queryDuration < 200) scores.queryOptimization = 80
        else if (queryDuration < 300) scores.queryOptimization = 60
        else scores.queryOptimization = 40
      } else {
        scores.queryOptimization = 0
      }

      // 计算总体评分
      scores.overallExperience = Math.round(
        (scores.apiResponse + scores.cacheEfficiency + scores.queryOptimization) / 3
      )

      // 输出评分报告
      console.log('\n===== 性能评分报告 =====')
      console.log(`📡 API 响应速度：${scores.apiResponse}/100`)
      console.log(`💾 缓存效率：${scores.cacheEfficiency}/100`)
      console.log(`⚡ 查询优化：${scores.queryOptimization}/100`)
      console.log(`\n🎯 综合评分：${scores.overallExperience}/100`)
      
      if (scores.overallExperience >= 90) {
        console.log('✅ 性能优秀！')
      } else if (scores.overallExperience >= 70) {
        console.log('✅ 性能良好')
      } else if (scores.overallExperience >= 60) {
        console.log('⚠️ 性能一般')
      } else {
        console.log('❌ 需要优化')
      }
      console.log('========================\n')

      console.groupEnd()
      return scores.overallExperience
    } catch (error) {
      console.error('综合性能评分失败:', error)
      console.groupEnd()
      return 0
    }
  },
}

// ===== 主测试函数 =====
async function runAllTests() {
  console.clear()
  console.log('╔════════════════════════════════════════════╗')
  console.log('║   微信小程序自动化测试脚本                 ║')
  console.log('║   BabyAssistant v2.0                       ║')
  console.log('╚════════════════════════════════════════════╝\n')

  const testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    details: []
  }

  // 测试列表
  const tests = [
    { name: 'API 基础功能测试', fn: Tests.testAPIBasics },
    { name: '宝宝管理功能测试', fn: Tests.testBabyManagement },
    { name: '成长记录功能测试', fn: Tests.testRecordManagement },
    { name: '数据库索引性能测试', fn: Tests.testDatabaseIndexPerformance },
    { name: '并行请求优化测试', fn: Tests.testParallelRequests },
    { name: '防抖节流功能测试', fn: Tests.testDebounceThrottle },
    { name: '综合性能评分', fn: Tests.testOverallPerformance },
  ]

  // 执行所有测试
  for (const test of tests) {
    try {
      const result = await test.fn()
      testResults.total++
      
      if (typeof result === 'boolean') {
        if (result) {
          testResults.passed++
          testResults.details.push({ name: test.name, status: '✅ 通过' })
        } else {
          testResults.failed++
          testResults.details.push({ name: test.name, status: '❌ 失败' })
        }
      } else if (typeof result === 'number') {
        // 性能评分
        testResults.passed++
        testResults.details.push({ 
          name: test.name, 
          status: `✅ 评分：${result}/100` 
        })
      }
    } catch (error) {
      testResults.total++
      testResults.failed++
      testResults.details.push({ 
        name: test.name, 
        status: `❌ 错误：${error.message}` 
      })
    }

    // 测试间隔
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // 输出测试报告
  console.log('\n╔════════════════════════════════════════════╗')
  console.log('║           测试完成报告                     ║')
  console.log('╚════════════════════════════════════════════╝')
  console.log(`\n📊 测试统计:`)
  console.log(`   总测试数：${testResults.total}`)
  console.log(`   ✅ 通过：${testResults.passed}`)
  console.log(`   ❌ 失败：${testResults.failed}`)
  console.log(`   成功率：${Math.round((testResults.passed / testResults.total) * 100)}%`)
  
  console.log(`\n📋 详细结果:`)
  testResults.details.forEach((detail, index) => {
    console.log(`   ${index + 1}. ${detail.name}: ${detail.status}`)
  })

  if (testResults.failed === 0) {
    console.log('\n🎉 所有测试通过！系统运行正常！')
  } else {
    console.log(`\n⚠️  有 ${testResults.failed} 个测试失败，请检查问题。`)
  }

  return testResults
}

// ===== 单独运行特定测试 =====
async function runSpecificTest(testName) {
  console.log(`\n🔍 运行单项测试：${testName}`)
  
  const testMap = {
    'api': Tests.testAPIBasics,
    'baby': Tests.testBabyManagement,
    'record': Tests.testRecordManagement,
    'index': Tests.testDatabaseIndexPerformance,
    'parallel': Tests.testParallelRequests,
    'debounce': Tests.testDebounceThrottle,
    'performance': Tests.testOverallPerformance,
  }

  const testFn = testMap[testName.toLowerCase()]
  if (testFn) {
    return await testFn()
  } else {
    console.error(`❌ 未找到测试：${testName}`)
    console.log('可用测试:', Object.keys(testMap).join(', '))
  }
}

// ===== 导出测试接口 =====
module.exports = {
  runAllTests,
  runSpecificTest,
  Tests,
  TestUtil,
  TEST_CONFIG
}

// ===== 自动执行（可选）=====
// 如果直接在控制台运行，自动执行所有测试
if (typeof autoRun === 'undefined' || autoRun) {
  runAllTests().catch(console.error)
}
