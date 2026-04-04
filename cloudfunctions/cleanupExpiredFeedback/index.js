// 定时清理：feedback 在邮件发送成功并记录 emailSentAt 后，满 30 天删除文档与关联云存储图片
// 依赖：sendFeedbackEmail 成功后会写入 emailSentAt
// 部署后需在开发者工具对该云函数「上传触发器」，并保证 config.json 中的定时已生效

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000
/** 单次运行最多处理条数，避免超时；未处理完的次日继续 */
const MAX_DOCS_PER_RUN = 100
const DELETE_FILE_CHUNK = 20

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}

exports.main = async (event, context) => {
  let fromTimer = false
  try {
    const wxctx = cloud.getWXContext()
    fromTimer = wxctx.SOURCE === 'wx_trigger'
  } catch (e) {
    fromTimer = false
  }

  const cutoff = new Date(Date.now() - RETENTION_MS)

  const query = await db
    .collection('feedback')
    .where({
      emailSentAt: _.lte(cutoff)
    })
    .limit(MAX_DOCS_PER_RUN)
    .get()

  const list = query.data || []
  let removedDocs = 0
  let removedFiles = 0
  const errors = []

  for (const doc of list) {
    const id = doc._id
    const images = Array.isArray(doc.images) ? doc.images : []
    const fileIds = images
      .map((x) => String(x || '').trim())
      .filter((s) => s.startsWith('cloud://'))

    for (const part of chunk(fileIds, DELETE_FILE_CHUNK)) {
      if (part.length === 0) continue
      try {
        const delRes = await cloud.deleteFile({ fileList: part })
        const fl = (delRes && delRes.fileList) || []
        removedFiles += fl.filter((f) => f.status === 0).length
      } catch (e) {
        errors.push({ id, op: 'deleteFile', msg: e.message || String(e) })
      }
    }

    try {
      await db.collection('feedback').doc(id).remove()
      removedDocs += 1
    } catch (e) {
      errors.push({ id, op: 'remove', msg: e.message || String(e) })
    }
  }

  console.log(
    JSON.stringify({
      tag: 'cleanupExpiredFeedback',
      fromTimer,
      cutoff: cutoff.toISOString(),
      scanned: list.length,
      removedDocs,
      removedFiles,
      errorCount: errors.length
    })
  )

  return {
    success: true,
    removedDocs,
    removedFiles,
    scanned: list.length,
    errors: errors.length ? errors.slice(0, 10) : undefined
  }
}
