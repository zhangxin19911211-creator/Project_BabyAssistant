/**
 * 首页权限调试脚本
 * 
 * 使用方法：
 * 1. 打开微信开发者工具
 * 2. 编译小程序
 * 3. 打开首页
 * 4. 在控制台中粘贴并运行此脚本
 */

const api = require('../../utils/api.js')
const safeLog = require('../../utils/safeLog.js')

async function debugPermission() {
  console.clear()
  safeLog.log('╔════════════════════════════════════════════╗')
  safeLog.log('║   权限调试工具                             ║')
  safeLog.log('╚════════════════════════════════════════════╝\n')
  
  try {
    // 获取用户信息
    const app = getApp()
    const userOpenid = app.globalData.userInfo.openid
    safeLog.log('👤 用户标识:', { openid: userOpenid }, '\n')
    
    // 获取家庭列表
    safeLog.log('📊 获取家庭列表...')
    const families = await api.getFamilies()
    safeLog.log(`✅ 共 ${families.length} 个家庭\n`)
    
    // 分析每个家庭
    safeLog.log('🏠 家庭详情:')
    families.forEach((family, index) => {
      const member = family.members.find(m => m.openid === userOpenid)
      const userRole = member ? (member.permission === 'guardian' ? '一级助教' : member.permission === 'caretaker' ? '二级助教' : '围观吃瓜') : '未加入'
      
      safeLog.log(`\n[${index + 1}] ${family.name}`)
      safeLog.log(`   您的身份：${userRole}`)
      safeLog.log(`   成员数：${family.members.length}`)
      safeLog.log(`   家庭 ID: ${family._id}`)
    })
    
    // 找出用户是一级助教的家庭
    const guardianFamilies = families.filter(f => {
      const member = f.members.find(m => m.openid === userOpenid)
      return member && member.permission === 'guardian'
    })
    
    safeLog.log('\n\n🎯 一级助教家庭:', guardianFamilies.map(f => f.name).join(', ') || '无')
    safeLog.log('   数量:', guardianFamilies.length)
    
    // 获取宝宝列表
    safeLog.log('\n\n👶 获取宝宝列表...')
    const babies = await api.getBabies()
    safeLog.log(`✅ 共 ${babies.length} 个宝宝\n`)
    
    // 分析每个宝宝的归属
    const guardianFamilyIds = guardianFamilies.map(f => f._id)
    const babiesInGuardianFamilies = babies.filter(baby => 
      guardianFamilyIds.includes(baby.familyId)
    )
    
    safeLog.log('📈 统计分析:')
    safeLog.log(`   所有宝宝总数：${babies.length}`)
    safeLog.log(`   一级助教家庭中的宝宝数：${babiesInGuardianFamilies.length}`)
    safeLog.log(`   可添加宝宝余额：${Math.max(0, 3 - babiesInGuardianFamilies.length)}`)
    
    if (babiesInGuardianFamilies.length > 0) {
      safeLog.log('\n   一级助教家庭中的宝宝:')
      babiesInGuardianFamilies.forEach((baby, index) => {
        const familyName = families.find(f => f._id === baby.familyId)?.name || '未知'
        safeLog.log(`   [${index + 1}] ${baby.name} (${familyName})`)
      })
    }
    
    // 最终判断
    safeLog.log('\n\n✅ 权限判断结果:')
    const canAddBaby = guardianFamilies.length > 0 && babiesInGuardianFamilies.length < 3
    safeLog.log(`   是否可以添加宝宝：${canAddBaby ? '✅ 是' : '❌ 否'}`)
    
    if (!canAddBaby) {
      if (guardianFamilies.length === 0) {
        safeLog.log('   ❌ 原因：您不是任何家庭的一级助教')
      } else if (babiesInGuardianFamilies.length >= 3) {
        safeLog.log('   ❌ 原因：您的一级助教家庭中已有 3 个宝宝，已达上限')
      }
    }
    
    safeLog.log('\n═══════════════════════════════════════════')
    
    return {
      userOpenid,
      families,
      babies,
      guardianFamilies,
      babiesInGuardianFamilies,
      canAddBaby
    }
    
  } catch (error) {
    safeLog.error('❌ 调试失败:', error.message)
    throw error
  }
}

// 自动执行
debugPermission()
