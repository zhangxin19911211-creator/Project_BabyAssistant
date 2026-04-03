// 云函数：反馈邮件通知（QQ 邮箱 SMTP）
//
// 请在与小程序 wx.cloud.init 相同的云环境内配置（控制台左上角环境需一致）。
// 云开发控制台 → 云函数 → sendFeedbackEmail → 版本列表 → $LATEST 右侧「配置」→ 环境变量
// （勿只改「全局/环境设置」而未绑定到本函数；改完后建议再上传一次函数或创建新版本，保证生效）
//
// 必填：
//   FEEDBACK_EMAIL_USER  发件邮箱（完整地址，在控制台填写，勿写入代码仓库）
//   FEEDBACK_EMAIL_PASS  邮箱 SMTP 授权码（在控制台填写）
// 可选：
//   FEEDBACK_EMAIL_TO    收件人；不填则发往 FEEDBACK_EMAIL_USER
//   FEEDBACK_FROM_NAME   发件显示名；默认「萌芽季小程序」
//   FEEDBACK_SMTP_HOST   默认 smtp.qq.com
//   FEEDBACK_SMTP_PORT   默认 465
//   FEEDBACK_SMTP_SECURE 默认 true；若用 587 STARTTLS 可设为 false（需自行验证）

const cloud = require('wx-server-sdk')
const nodemailer = require('nodemailer')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/** 用于确认已部署本文件逻辑；若前端仍见「反馈已收到」则说明线上非本版本 */
const CF_BUILD_TAG = 'sendFeedbackEmail-smtp-env-v2'

function escapeHtml(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 日志/返回给前端前脱敏，避免泄露邮箱或授权相关信息 */
function redactSensitiveInText(s) {
  if (s == null) return ''
  let t = String(s)
  t = t.replace(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    '[email]'
  )
  return t
}

/** 与控制台 Key 大小写不一致时仍能读取（如 feedback_email_user） */
function readEnvTrimmedInsensitive(canonicalName) {
  const want = canonicalName.toUpperCase()
  for (const k of Object.keys(process.env || {})) {
    if (k.toUpperCase() === want) {
      const v = process.env[k]
      if (v == null) return ''
      const t = String(v).trim()
      return t
    }
  }
  return ''
}

function readOptionalEnvInsensitive(canonicalName, fallback) {
  const v = readEnvTrimmedInsensitive(canonicalName)
  return v || fallback
}

function collectEnvDiagnostics() {
  const keys = Object.keys(process.env || {})
  const related = keys
    .filter((k) => {
      const u = k.toUpperCase()
      return (
        u.includes('FEEDBACK') ||
        u.includes('SMTP') ||
        (u.includes('EMAIL') && u.includes('FEEDBACK'))
      )
    })
    .sort()
  const hasUserKey = keys.some(
    (k) => k.toUpperCase() === 'FEEDBACK_EMAIL_USER'
  )
  const hasPassKey = keys.some(
    (k) => k.toUpperCase() === 'FEEDBACK_EMAIL_PASS'
  )
  return {
    buildTag: CF_BUILD_TAG,
    processEnvKeyCount: keys.length,
    tcbEnv: process.env.TCB_ENV || process.env.SCF_NAMESPACE || '',
    runEnv: process.env.TENCENTCLOUD_RUNENV || '',
    /** 仅列出变量名，不包含值，便于核对是否写错 Key */
    relatedEnvKeys: related,
    hasFeedbackUserKey: hasUserKey,
    hasFeedbackPassKey: hasPassKey,
    /** Key 存在且去掉空格后非空 */
    hasFeedbackUserValue: !!readEnvTrimmedInsensitive('FEEDBACK_EMAIL_USER'),
    hasFeedbackPassValue: !!readEnvTrimmedInsensitive('FEEDBACK_EMAIL_PASS')
  }
}

function getSmtpConfig() {
  const user = readEnvTrimmedInsensitive('FEEDBACK_EMAIL_USER')
  const pass = readEnvTrimmedInsensitive('FEEDBACK_EMAIL_PASS')
  if (!user || !pass) {
    return null
  }
  const portStr =
    readEnvTrimmedInsensitive('FEEDBACK_SMTP_PORT') || '465'
  const port = parseInt(portStr, 10) || 465
  const secureRaw = readEnvTrimmedInsensitive('FEEDBACK_SMTP_SECURE')
  const secure =
    secureRaw === '' ||
    secureRaw.toLowerCase() === 'true' ||
    secureRaw === '1'
  return {
    host:
      readEnvTrimmedInsensitive('FEEDBACK_SMTP_HOST') || 'smtp.qq.com',
    port,
    secure,
    auth: { user, pass }
  }
}

exports.main = async (event) => {
  try {
    const smtpConfig = getSmtpConfig()
    if (!smtpConfig) {
      const diag = collectEnvDiagnostics()
      console.error(
        '[sendFeedbackEmail] CONFIG_MISSING',
        JSON.stringify(diag)
      )
      return {
        success: false,
        code: 'CONFIG_MISSING',
        message: '邮件服务未配置（云函数环境变量）',
        error:
          '请在 sendFeedbackEmail 的「配置」中设置 FEEDBACK_EMAIL_USER 与 FEEDBACK_EMAIL_PASS（保存后重新上传/发布函数）',
        buildTag: CF_BUILD_TAG,
        diagnostics: diag
      }
    }

    const { data } = event

    if (!data || !String(data.content || '').trim()) {
      return { success: false, code: 'INVALID', message: '反馈内容不能为空' }
    }

    const emailUser = readEnvTrimmedInsensitive('FEEDBACK_EMAIL_USER')
    const to =
      readEnvTrimmedInsensitive('FEEDBACK_EMAIL_TO') || emailUser
    const fromName =
      readOptionalEnvInsensitive(
        'FEEDBACK_FROM_NAME',
        '萌芽季小程序'
      )

    const contentSafe = escapeHtml(data.content)
    const openidSafe = escapeHtml(data.openid || '未知')
    const idSafe = escapeHtml(data._id != null ? String(data._id) : '未知')
    let timeStr = ''
    try {
      timeStr = data.createTime
        ? new Date(data.createTime).toLocaleString('zh-CN')
        : new Date().toLocaleString('zh-CN')
    } catch (e) {
      timeStr = new Date().toLocaleString('zh-CN')
    }
    const timeSafe = escapeHtml(timeStr)

    let imagesBlock = ''
    if (Array.isArray(data.images) && data.images.length > 0) {
      const items = data.images
        .map((img) => `<li>${escapeHtml(img)}</li>`)
        .join('')
      imagesBlock = `
          <div style="margin: 20px 0;">
            <h3 style="color: #333;">附件图片 (${data.images.length}张)</h3>
            <p style="color: #999; font-size: 14px;">图片已保存到云存储，请在云开发控制台查看</p>
            <ul style="color: #666; font-size: 14px;">${items}</ul>
          </div>`
    }

    let envLabel = ''
    try {
      envLabel = String(cloud.DYNAMIC_CURRENT_ENV != null ? cloud.DYNAMIC_CURRENT_ENV : '')
    } catch (e) {
      envLabel = ''
    }

    const transporter = nodemailer.createTransport(smtpConfig)

    const mailOptions = {
      from: `"${fromName.replace(/"/g, '')}" <${emailUser}>`,
      to,
      subject: `【萌芽季】用户反馈 - ${timeStr}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #07c160; border-bottom: 2px solid #07c160; padding-bottom: 10px;">萌芽季用户反馈</h2>

          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">反馈内容</h3>
            <p style="color: #666; line-height: 1.6; white-space: pre-wrap;">${contentSafe}</p>
          </div>

          <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">用户信息</h3>
            <p style="color: #666; margin: 5px 0;"><strong>用户ID:</strong> ${openidSafe}</p>
            <p style="color: #666; margin: 5px 0;"><strong>反馈ID:</strong> ${idSafe}</p>
            <p style="color: #666; margin: 5px 0;"><strong>提交时间:</strong> ${timeSafe}</p>
          </div>
          ${imagesBlock}
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px; text-align: center;">
            <p>此邮件由萌芽季小程序自动发送</p>
            <p>云开发环境: ${escapeHtml(envLabel)}</p>
          </div>
        </div>
      `
    }

    const info = await transporter.sendMail(mailOptions)
    console.log(
      '[sendFeedbackEmail] SMTP ok',
      JSON.stringify({
        buildTag: CF_BUILD_TAG,
        messageId: info.messageId || '',
        acceptedCount: Array.isArray(info.accepted) ? info.accepted.length : 0,
        rejectedCount: Array.isArray(info.rejected) ? info.rejected.length : 0
      })
    )

    if (
      info.rejected &&
      Array.isArray(info.rejected) &&
      info.rejected.length > 0
    ) {
      return {
        success: false,
        code: 'SMTP_REJECTED',
        buildTag: CF_BUILD_TAG,
        message: 'SMTP 拒收部分收件人',
        error: redactSensitiveInText(String(info.rejected.join(',')))
      }
    }

    return {
      success: true,
      message: '邮件已发送',
      buildTag: CF_BUILD_TAG,
      messageId: info.messageId || ''
    }
  } catch (error) {
    const safeMsg = redactSensitiveInText(
      (error && error.message) || String(error)
    )
    console.error('[sendFeedbackEmail] send failed', safeMsg)
    return {
      success: false,
      code: 'SEND_FAILED',
      message: '发送邮件失败',
      error: safeMsg
    }
  }
}
