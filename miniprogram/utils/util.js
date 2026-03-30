const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${year}/${month}/${day}`
}

// 防抖函数：延迟执行，如果在延迟期间再次触发则重新计时
const debounce = (fn, delay = 300) => {
  let timer = null
  return function(...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), delay)
  }
}

// 节流函数：固定时间内只执行一次
const throttle = (fn, delay = 300) => {
  let lastTime = 0
  return function(...args) {
    const now = Date.now()
    if (now - lastTime >= delay) {
      lastTime = now
      fn.apply(this, args)
    }
  }
}

const calculateAge = (birthDate, currentDate = new Date()) => {
  const birth = new Date(birthDate)
  const current = new Date(currentDate)
  
  let years = current.getFullYear() - birth.getFullYear()
  let months = current.getMonth() - birth.getMonth()
  let days = current.getDate() - birth.getDate()
  
  if (days < 0) {
    months--
    const lastMonth = new Date(current.getFullYear(), current.getMonth(), 0)
    days += lastMonth.getDate()
  }
  
  if (months < 0) {
    years--
    months += 12
  }
  
  return { years, months, days }
}

const calculateAgeInMonths = (birthDate, currentDate = new Date()) => {
  const { years, months, days } = calculateAge(birthDate, currentDate)
  // simple approximation: 1 month if days > 15
  let totalMonths = years * 12 + months
  if (days >= 15) {
    totalMonths += 0.5
  }
  return totalMonths
}

const formatAgeString = ({ years, months, days }) => {
  if (years === 0 && months === 0 && days === 0) return '刚出生'
  let str = ''
  if (years > 0) str += `${years}岁`
  if (months > 0) str += `${months}月`
  if (days > 0) str += `${days}天`
  return str
}

module.exports = {
  formatTime,
  calculateAge,
  calculateAgeInMonths,
  formatAgeString,
  debounce,
  throttle
}
