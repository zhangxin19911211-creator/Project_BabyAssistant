/** 生产环境脱敏日志：避免在正式版输出 openid 等标识 */

function allowVerbose() {
  try {
    const env = wx.getAccountInfoSync().miniProgram.envVersion
    return env === 'develop' || env === 'trial'
  } catch (e) {
    return false
  }
}

const VERBOSE = allowVerbose()

function maskId(v) {
  if (v == null) return v
  const s = String(v)
  if (s.length <= 8) return '***'
  return s.slice(0, 4) + '…' + s.slice(-4)
}

function isSensitiveKey(k) {
  const u = String(k).toLowerCase()
  return u === 'openid' || u === 'unionid' || u === 'session_key' || u === 'cloudid'
}

function sanitize(value, depth) {
  const d = depth == null ? 0 : depth
  if (d > 6) return '[MaxDepth]'
  if (value == null) return value
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return value
  if (value instanceof Error) {
    return { name: value.name, message: value.message }
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, d + 1))
  }
  if (t === 'object') {
    const out = {}
    Object.keys(value).forEach((k) => {
      const v = value[k]
      if (!VERBOSE && isSensitiveKey(k)) {
        out[k] = maskId(v)
      } else if (v != null && typeof v === 'object') {
        out[k] = sanitize(v, d + 1)
      } else {
        out[k] = v
      }
    })
    return out
  }
  return value
}

function mapArgs(args) {
  const list = Array.prototype.slice.call(args)
  return list.map((a) => {
    if (a != null && typeof a === 'object') {
      if (a instanceof Error) return VERBOSE ? a : a.message
      return sanitize(a)
    }
    return a
  })
}

function log() {
  console.log.apply(console, mapArgs(arguments))
}

function warn() {
  console.warn.apply(console, mapArgs(arguments))
}

function error() {
  console.error.apply(console, mapArgs(arguments))
}

module.exports = {
  log,
  warn,
  error,
  sanitize
}
