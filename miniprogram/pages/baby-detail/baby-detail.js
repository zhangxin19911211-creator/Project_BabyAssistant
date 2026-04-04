// pages/baby-detail/baby-detail.js
const api = require('../../utils/api.js')
const util = require('../../utils/util.js')
const safeLog = require('../../utils/safeLog.js')
import * as echarts from '../../components/ec-canvas/echarts'

/**
 * WS/T 423—2022 附录表 A.1～A.4 共用年龄刻度（月龄），共 44 行，与 PDF 一致；末行「6岁9月」= 81 月。
 * 仅使用表中 P3、P50、P97 列，不做月龄内插或外推。
 */
const WS423_STANDARD_MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81]
const WS423_BOY_WEIGHT_P3 = [2.8, 3.7, 4.7, 5.5, 6.1, 6.6, 6.9, 7.2, 7.5, 7.7, 7.9, 8.1, 8.3, 8.4, 8.6, 8.8, 9, 9.1, 9.3, 9.5, 9.7, 9.8, 10, 10.2, 10.4, 10.8, 11.2, 11.6, 12, 12.4, 12.8, 13.2, 13.6, 14, 14.5, 14.9, 15.3, 15.8, 16.2, 16.6, 17.1, 17.5, 17.8, 18.2]
const WS423_BOY_WEIGHT_P50 = [3.5, 4.6, 5.8, 6.8, 7.5, 8, 8.4, 8.8, 9.1, 9.4, 9.6, 9.8, 10.1, 10.3, 10.5, 10.7, 10.9, 11.1, 11.3, 11.5, 11.7, 11.9, 12.2, 12.4, 12.6, 13.1, 13.7, 14.2, 14.6, 15.2, 15.7, 16.2, 16.7, 17.3, 17.9, 18.4, 19.1, 19.7, 20.3, 21, 21.6, 22.2, 22.8, 23.4]
const WS423_BOY_WEIGHT_P97 = [4.2, 5.6, 7.1, 8.3, 9.2, 9.8, 10.3, 10.8, 11.1, 11.5, 11.8, 12, 12.3, 12.5, 12.8, 13, 13.3, 13.5, 13.8, 14, 14.3, 14.6, 14.8, 15.1, 15.4, 16.1, 16.7, 17.4, 18, 18.7, 19.4, 20.1, 20.8, 21.6, 22.4, 23.3, 24.2, 25.1, 26, 27, 27.9, 28.9, 29.8, 30.6]
const WS423_GIRL_WEIGHT_P3 = [2.7, 3.5, 4.4, 5.1, 5.6, 6, 6.4, 6.7, 6.9, 7.2, 7.4, 7.6, 7.7, 7.9, 8.1, 8.3, 8.4, 8.6, 8.8, 9, 9.1, 9.3, 9.5, 9.7, 9.8, 10.3, 10.7, 11.1, 11.5, 12, 12.4, 12.8, 13.1, 13.5, 13.9, 14.3, 14.7, 15.1, 15.5, 15.9, 16.3, 16.7, 17, 17.4]
const WS423_GIRL_WEIGHT_P50 = [3.3, 4.3, 5.4, 6.2, 6.9, 7.4, 7.8, 8.1, 8.4, 8.7, 9, 9.2, 9.4, 9.6, 9.8, 10, 10.3, 10.5, 10.7, 10.9, 11.1, 11.3, 11.5, 11.7, 11.9, 12.5, 13, 13.6, 14.1, 14.7, 15.2, 15.7, 16.2, 16.7, 17.2, 17.8, 18.4, 19, 19.6, 20.2, 20.7, 21.3, 21.8, 22.4]
const WS423_GIRL_WEIGHT_P97 = [4.1, 5.3, 6.6, 7.6, 8.4, 9.1, 9.6, 10, 10.4, 10.8, 11.1, 11.4, 11.6, 11.9, 12.2, 12.4, 12.7, 12.9, 13.2, 13.5, 13.8, 14, 14.3, 14.6, 14.8, 15.5, 16.2, 16.9, 17.7, 18.4, 19.1, 19.8, 20.5, 21.1, 21.9, 22.6, 23.4, 24.3, 25.1, 26, 26.8, 27.6, 28.5, 29.3]
const WS423_BOY_HEIGHT_P3 = [47.6, 51.3, 54.9, 58, 60.5, 62.5, 64.2, 65.7, 67.1, 68.3, 69.5, 70.7, 71.7, 72.8, 73.8, 74.8, 75.8, 76.8, 77.7, 78.6, 79.6, 80.5, 81.4, 82.2, 82.4, 84.8, 87, 89, 90.9, 92.7, 94.4, 96, 97.6, 99.2, 100.8, 102.4, 104.1, 105.7, 107.2, 108.8, 110.3, 111.7, 113.1, 114.5]
const WS423_BOY_HEIGHT_P50 = [51.2, 55.1, 59, 62.2, 64.8, 66.9, 68.7, 70.3, 71.7, 73.1, 74.3, 75.5, 76.7, 77.8, 78.9, 80, 81, 82.1, 83.1, 84.1, 85.1, 86.1, 87, 88, 88.2, 90.8, 93.2, 95.4, 97.5, 99.5, 101.3, 103.1, 104.9, 106.6, 108.4, 110.2, 112, 113.7, 115.5, 117.1, 118.8, 120.4, 122, 123.5]
const WS423_BOY_HEIGHT_P97 = [54.8, 59, 63, 66.4, 69.1, 71.3, 73.2, 74.9, 76.4, 77.8, 79.1, 80.4, 81.6, 82.8, 84, 85.1, 86.3, 87.4, 88.5, 89.6, 90.6, 91.7, 92.7, 93.7, 94, 96.8, 99.4, 101.8, 104.1, 106.2, 108.3, 110.2, 112.2, 114.1, 116, 117.9, 119.9, 121.8, 123.7, 125.5, 127.3, 129.1, 130.8, 132.5]
const WS423_GIRL_HEIGHT_P3 = [46.8, 50.4, 53.8, 56.7, 59.1, 61, 62.7, 64.2, 65.6, 66.8, 68.1, 69.2, 70.4, 71.4, 72.5, 73.5, 74.6, 75.5, 76.5, 77.5, 78.4, 79.3, 80.2, 81.1, 81.2, 83.6, 85.7, 87.7, 89.7, 91.5, 93.2, 94.9, 96.5, 98.1, 99.7, 101.3, 103, 104.6, 106.1, 107.6, 109, 110.4, 111.8, 113.2]
const WS423_GIRL_HEIGHT_P50 = [50.3, 54.1, 57.7, 60.8, 63.3, 65.3, 67.1, 68.7, 70.1, 71.5, 72.8, 74, 75.2, 76.4, 77.5, 78.6, 79.7, 80.8, 81.9, 82.9, 83.9, 84.9, 85.8, 86.8, 87, 89.5, 91.9, 94.1, 96.2, 98.2, 100.1, 101.9, 103.7, 105.4, 107.2, 109, 110.8, 112.6, 114.3, 115.9, 117.5, 119.1, 120.6, 122.1]
const WS423_GIRL_HEIGHT_P97 = [53.8, 57.8, 61.6, 64.8, 67.4, 69.6, 71.5, 73.1, 74.7, 76.1, 77.5, 78.8, 80.1, 81.4, 82.6, 83.8, 84.9, 86.1, 87.2, 88.3, 89.4, 90.4, 91.5, 92.5, 92.8, 95.5, 98.1, 100.5, 102.7, 104.9, 106.9, 108.9, 110.9, 112.8, 114.7, 116.7, 118.6, 120.6, 122.4, 124.2, 126, 127.7, 129.4, 131]

/** standard: { months, p3, p50, p97 } 与 WS423_STANDARD_MONTHS 等长 */
function getStandardP97Max(standard) {
  let max = 0
  for (let i = 0; i < standard.p97.length; i++) {
    if (standard.p97[i] > max) {
      max = standard.p97[i]
    }
  }
  return Math.ceil(max)
}

/** 7 岁以下：月龄 0～83（未满 84 月） */
const GROWTH_CHART_X_MAX_MONTH = 83

function getChartOptions(
  title,
  xAxisData,
  standard,
  actualData,
  yAxisName,
  yAxisInterval,
  yAxisMaxCap
) {
  const months = standard.months
  const stdSeriesDataP3 = months.map(function (mo, i) {
    return [mo, standard.p3[i]]
  })
  const stdSeriesDataP50 = months.map(function (mo, i) {
    return [mo, standard.p50[i]]
  })
  const stdSeriesDataP97 = months.map(function (mo, i) {
    return [mo, standard.p97[i]]
  })

  const actSeriesData = actualData.map((y, i) => [Math.round(xAxisData[i]), y])

  return {
    tooltip: {
      trigger: 'axis',
      confine: true,
      // 小程序 Canvas 上 ECharts 默认 tooltip 阴影易渲染成「一团乌黑」，关闭阴影与重阴影描边
      backgroundColor: '#ffffff',
      borderColor: '#e0e0e0',
      borderWidth: 1,
      borderRadius: 6,
      shadowBlur: 0,
      shadowColor: 'rgba(0,0,0,0)',
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      padding: [10, 12],
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: function (params) {
        let result = Math.round(params[0].axisValue) + ' 个月\n'
        params.forEach((item) => {
          const y = item.data[1]
          const yShow =
            typeof y === 'number' ? (Math.round(y * 10) / 10).toFixed(1) : y
          result += item.marker + item.seriesName + ': ' + yShow + '\n'
        })
        return result
      }
    },
    axisPointer: {
      type: 'line',
      lineStyle: {
        color: 'rgba(127, 209, 185, 0.85)',
        width: 1
      }
    },
    legend: {
      data: ['标准曲线(P3)', '标准曲线(P50)', '标准曲线(P97)', '宝宝数据'],
      bottom: 30,
      left: 'center'
    },
    grid: {
      left: '3%',
      right: '15%',
      bottom: '18%',
      top: '10%',
      containLabel: true
    },
    // 仅内置缩放：minSpan 提高最小可视比例，降低捏合过敏感；由 ec-canvas 的 processGesture 转发手势
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'none',
        minSpan: 38,
        maxSpan: 100,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false
      },
      {
        type: 'inside',
        yAxisIndex: 0,
        filterMode: 'none',
        minSpan: 38,
        maxSpan: 100,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false
      }
    ],
    xAxis: {
      type: 'value',
      name: '月龄',
      min: function (value) {
        const v = Math.floor(value.min)
        return Math.max(0, v)
      },
      max: function (value) {
        const v = Math.ceil(value.max)
        return Math.min(GROWTH_CHART_X_MAX_MONTH, v)
      },
      axisLabel: {
        formatter: function (value) {
          return String(Math.round(value))
        },
        interval: function(index, value) {
          // 根据数据范围自动调整间隔
          const axis = this.axis;
          const dataMin = axis.dataMin;
          const dataMax = axis.dataMax;
          const range = dataMax - dataMin;
          
          if (range <= 10) {
            return index % 1 === 0; // 间隔为1
          } else if (range <= 30) {
            return index % 2 === 0; // 间隔为2
          } else if (range <= 60) {
            return index % 5 === 0; // 间隔为5
          } else {
            return index % 10 === 0; // 间隔为10
          }
        }
      },
      splitLine: {
        show: true,
        lineStyle: { type: 'dashed', color: '#eee' },
        interval: function(index, value) {
          // 分割线也按照相同规则调整
          const axis = this.axis;
          const dataMin = axis.dataMin;
          const dataMax = axis.dataMax;
          const range = dataMax - dataMin;
          
          if (range <= 10) {
            return true; // 显示所有分割线
          } else if (range <= 30) {
            return Math.round(value) % 2 === 0;
          } else if (range <= 60) {
            return Math.round(value) % 5 === 0;
          } else {
            return Math.round(value) % 10 === 0;
          }
        }
      }
    },
    yAxis: {
      type: 'value',
      name: yAxisName,
      interval: yAxisInterval,
      minInterval: yAxisInterval,
      min: function (value) {
        let lo = Math.floor(value.min / yAxisInterval) * yAxisInterval
        if (lo < 0) {
          lo = 0
        }
        return lo
      },
      max: function (value) {
        let hi = Math.ceil(value.max / yAxisInterval) * yAxisInterval
        if (hi > yAxisMaxCap) {
          hi = yAxisMaxCap
        }
        return hi
      },
      axisLabel: {
        formatter: function (val) {
          return String(Math.round(Number(val)))
        }
      },
      splitLine: { show: true, lineStyle: { type: 'dashed', color: '#eee' } }
    },
    series: [
      {
        name: '标准曲线(P3)',
        type: 'line',
        smooth: false,
        itemStyle: { color: 'rgba(135, 206, 235, 0.6)' },
        lineStyle: { width: 1.5, type: 'dashed' },
        data: stdSeriesDataP3
      },
      {
        name: '标准曲线(P50)',
        type: 'line',
        smooth: false,
        itemStyle: { color: '#87CEEB' },
        lineStyle: { width: 2 },
        data: stdSeriesDataP50
      },
      {
        name: '标准曲线(P97)',
        type: 'line',
        smooth: false,
        itemStyle: { color: 'rgba(135, 206, 235, 0.6)' },
        lineStyle: { width: 1.5, type: 'dashed' },
        data: stdSeriesDataP97
      },
      {
        name: '宝宝数据',
        type: 'line',
        smooth: true,
        itemStyle: { color: '#81C784' },
        lineStyle: { width: 2 },
        data: actSeriesData,
        symbol: 'circle',
        symbolSize: 8
      }
    ]
  };
}

Page({
  data: {
    babyId: '',
    baby: null,
    records: [],
    currentTab: 'records',
    ecHeight: {
      lazyLoad: true
    },
    ecWeight: {
      lazyLoad: true
    },
    cachedStandardData: {},
    showEditNameModal: false,
    editBabyName: ''
  },

  onLoad(options) {
    if (options.id) {
      this.setData({
        babyId: options.id
      })
    }
  },

  onShow() {
    if (this.data.babyId) {
      this.loadData()
    }
  },

  onReady() {
    // If starting on a chart tab, initialize it with debounce to prevent lag
    if (this.data.currentTab === 'height') {
      setTimeout(() => this.initHeightChart(), 100)
    } else if (this.data.currentTab === 'weight') {
      setTimeout(() => this.initWeightChart(), 100)
    }
  },

  onHide() {
    this.disposeCharts()
  },

  onUnload() {
    this.disposeCharts()
  },

  async loadData() {
    try {
      const baby = await api.getBabyById(this.data.babyId)
      if (!baby) {
        wx.showToast({
          title: '未找到宝宝信息',
          icon: 'none'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
        return
      }

      // 获取家庭信息，添加家庭名称到宝宝对象
      if (baby.familyId) {
        try {
          const families = await api.getFamilies()
          const family = families.find(f => f._id === baby.familyId)
          if (family) {
            baby.familyName = family.name
          }
        } catch (familyError) {
          console.error('获取家庭信息失败', familyError)
        }
      }

      const ageObj = util.calculateAge(baby.birthDate)
      baby.ageStr = util.formatAgeString(ageObj)

      const rawRecords = await api.getRecordsByBabyId(this.data.babyId)
      const records = rawRecords.map(function(r) {
        const rAgeObj = util.calculateAge(baby.birthDate, r.recordDate)
        return Object.assign({}, r, {
          formattedDate: util.formatTime(new Date(r.recordDate)),
          ageStr: util.formatAgeString(rAgeObj)
        })
      })

      this.setData({
        baby,
        records
      }, () => {
        const t = this.data.currentTab
        if (t === 'height') {
          setTimeout(() => this.initHeightChart(), 50)
        } else if (t === 'weight') {
          setTimeout(() => this.initWeightChart(), 50)
        }
      })
    } catch (error) {
      console.error('加载宝宝信息失败', error)
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      })
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (this.data.currentTab === tab) return
    const prev = this.data.currentTab
    if (prev === 'height' && tab !== 'height') {
      if (this.heightChart) {
        this.heightChart.dispose()
        this.heightChart = null
      }
      this._heightChartSig = null
    } else if (prev === 'weight' && tab !== 'weight') {
      if (this.weightChart) {
        this.weightChart.dispose()
        this.weightChart = null
      }
      this._weightChartSig = null
    }
    this.setData({
      currentTab: tab
    }, () => {
      if (tab === 'height') {
        setTimeout(() => this.initHeightChart(), 100)
      } else if (tab === 'weight') {
        setTimeout(() => this.initWeightChart(), 100)
      }
    })
  },

  disposeCharts() {
    if (this.heightChart) {
      this.heightChart.dispose()
      this.heightChart = null
    }
    if (this.weightChart) {
      this.weightChart.dispose()
      this.weightChart = null
    }
    this._heightChartSig = null
    this._weightChartSig = null
  },

  heightChartSignature() {
    const baby = this.data.baby
    if (!baby) return ''
    const rows = this.data.records || []
    return (
      rows.map((r) => `${r._id}:${r.height}:${r.recordDate}`).join('|') +
      '|gx:' +
      (baby.gender || '') +
      '|bd:' +
      (baby.birthDate || '')
    )
  },

  weightChartSignature() {
    const baby = this.data.baby
    if (!baby) return ''
    const rows = this.data.records || []
    return (
      rows.map((r) => `${r._id}:${r.weight}:${r.recordDate}`).join('|') +
      '|gx:' +
      (baby.gender || '') +
      '|bd:' +
      (baby.birthDate || '')
    )
  },

  buildHeightChartOption() {
    const baby = this.data.baby
    if (!baby) return null
    const records = (this.data.records || []).slice().sort((a, b) => new Date(a.recordDate) - new Date(b.recordDate))
    const xAxisData =
      records.length > 0
        ? records.map((r) => {
            const age = util.calculateAge(baby.birthDate, r.recordDate)
            return age.years * 12 + age.months
          })
        : [0, 1, 2, 3, 4, 5]
    const actualData = records.length > 0 ? records.map((r) => r.height) : []

    const isBoy = baby.gender === 'male'
    const standard = isBoy
      ? {
          months: WS423_STANDARD_MONTHS,
          p3: WS423_BOY_HEIGHT_P3,
          p50: WS423_BOY_HEIGHT_P50,
          p97: WS423_BOY_HEIGHT_P97
        }
      : {
          months: WS423_STANDARD_MONTHS,
          p3: WS423_GIRL_HEIGHT_P3,
          p50: WS423_GIRL_HEIGHT_P50,
          p97: WS423_GIRL_HEIGHT_P97
        }

    const yAxisMaxCap = getStandardP97Max(standard)
    const option = getChartOptions(
      '身高曲线',
      xAxisData,
      standard,
      actualData,
      '身高 (cm)',
      10,
      yAxisMaxCap
    )

    const z = option.dataZoom[0]
    const lastTableMonth = WS423_STANDARD_MONTHS[WS423_STANDARD_MONTHS.length - 1]
    if (actualData.length > 0) {
      if (xAxisData.length >= 3) {
        const startValue = xAxisData[xAxisData.length - 3]
        const endValue = xAxisData[xAxisData.length - 1]
        const range = endValue - startValue
        z.startValue = Math.max(0, startValue - range * 0.2)
        z.endValue = Math.min(GROWTH_CHART_X_MAX_MONTH, endValue + range * 0.2)
      } else {
        z.startValue = 0
        z.endValue = Math.min(12, lastTableMonth)
      }
    } else {
      z.startValue = 0
      z.endValue = lastTableMonth
    }

    return option
  },

  buildWeightChartOption() {
    const baby = this.data.baby
    if (!baby) return null
    const records = (this.data.records || []).slice().sort((a, b) => new Date(a.recordDate) - new Date(b.recordDate))
    const xAxisData =
      records.length > 0
        ? records.map((r) => {
            const age = util.calculateAge(baby.birthDate, r.recordDate)
            return age.years * 12 + age.months
          })
        : [0, 1, 2, 3, 4, 5]
    const actualData = records.length > 0 ? records.map((r) => r.weight) : []

    const isBoy = baby.gender === 'male'
    const standard = isBoy
      ? {
          months: WS423_STANDARD_MONTHS,
          p3: WS423_BOY_WEIGHT_P3,
          p50: WS423_BOY_WEIGHT_P50,
          p97: WS423_BOY_WEIGHT_P97
        }
      : {
          months: WS423_STANDARD_MONTHS,
          p3: WS423_GIRL_WEIGHT_P3,
          p50: WS423_GIRL_WEIGHT_P50,
          p97: WS423_GIRL_WEIGHT_P97
        }

    const yAxisMaxCap = getStandardP97Max(standard)
    const option = getChartOptions(
      '体重曲线',
      xAxisData,
      standard,
      actualData,
      '体重 (kg)',
      5,
      yAxisMaxCap
    )

    const z = option.dataZoom[0]
    const lastTableMonth = WS423_STANDARD_MONTHS[WS423_STANDARD_MONTHS.length - 1]
    if (actualData.length > 0) {
      if (xAxisData.length >= 3) {
        const startValue = xAxisData[xAxisData.length - 3]
        const endValue = xAxisData[xAxisData.length - 1]
        const range = endValue - startValue
        z.startValue = Math.max(0, startValue - range * 0.2)
        z.endValue = Math.min(GROWTH_CHART_X_MAX_MONTH, endValue + range * 0.2)
      } else {
        z.startValue = 0
        z.endValue = Math.min(12, lastTableMonth)
      }
    } else {
      z.startValue = 0
      z.endValue = lastTableMonth
    }

    return option
  },

  initHeightChart() {
    if (!this.data.baby) return
    const sig = this.heightChartSignature()
    if (this.heightChart && this._heightChartSig === sig) return

    if (this.heightChart) {
      const option = this.buildHeightChartOption()
      if (option) {
        this.heightChart.setOption(option, true)
        this._heightChartSig = sig
      }
      return
    }

    this.heightComponent = this.selectComponent('#height-dom-line')
    if (!this.heightComponent) {
      safeLog.error('baby-detail: 未找到身高图 #height-dom-line')
      return
    }

    this.heightComponent.init((canvas, width, height, dpr) => {
      const chart = echarts.init(canvas, null, {
        width: width,
        height: height,
        devicePixelRatio: dpr
      })
      canvas.setChart(chart)
      const option = this.buildHeightChartOption()
      if (option) {
        chart.setOption(option, true)
        this._heightChartSig = sig
      }
      chart.getZr().on('mousewheel', function (e) {
        e.event.preventDefault()
      })
      this.heightChart = chart
      return chart
    })
  },

  initWeightChart() {
    if (!this.data.baby) return
    const sig = this.weightChartSignature()
    if (this.weightChart && this._weightChartSig === sig) return

    if (this.weightChart) {
      const option = this.buildWeightChartOption()
      if (option) {
        this.weightChart.setOption(option, true)
        this._weightChartSig = sig
      }
      return
    }

    this.weightComponent = this.selectComponent('#weight-dom-line')
    if (!this.weightComponent) {
      safeLog.error('baby-detail: 未找到体重图 #weight-dom-line')
      return
    }

    this.weightComponent.init((canvas, width, height, dpr) => {
      const chart = echarts.init(canvas, null, {
        width: width,
        height: height,
        devicePixelRatio: dpr
      })
      canvas.setChart(chart)
      const option = this.buildWeightChartOption()
      if (option) {
        chart.setOption(option, true)
        this._weightChartSig = sig
      }
      chart.getZr().on('mousewheel', function (e) {
        e.event.preventDefault()
      })
      this.weightChart = chart
      return chart
    })
  },

  // 点击宝宝姓名进行修改
  async onBabyNameTap() {
    try {
      const hasPermission = await api.checkPermission(this.data.babyId, 'guardian')
      if (!hasPermission) {
        wx.showToast({
          title: '只有一级助教才可以修改宝宝姓名',
          icon: 'none'
        })
        return
      }
      
      this.setData({
        showEditNameModal: true,
        editBabyName: this.data.baby.name
      })
    } catch (error) {
      console.error('检查权限失败', error)
      wx.showToast({
        title: '检查权限失败',
        icon: 'none'
      })
    }
  },

  onEditBabyNameInput(e) {
    this.setData({
      editBabyName: e.detail.value
    })
  },

  closeEditNameModal() {
    this.setData({
      showEditNameModal: false
    })
  },

  noop() {},

  async submitEditNameForm() {
    const newName = this.data.editBabyName.trim()
    if (newName.length === 0) {
      wx.showToast({
        title: '姓名不能为空',
        icon: 'none'
      })
      return
    }
    if (newName.length > 7) {
      wx.showToast({
        title: '姓名最多7个字符',
        icon: 'none'
      })
      return
    }
    
    try {
      await api.updateBabyName(this.data.babyId, newName)
      this.setData({
        'baby.name': newName,
        showEditNameModal: false
      })
      wx.showToast({
        title: '修改成功',
        icon: 'success'
      })
    } catch (error) {
      console.error('修改宝宝姓名失败', error)
      wx.showToast({
        title: error.message || '修改失败',
        icon: 'none'
      })
    }
  },

  async chooseAvatar() {
    try {
      const hasPermission = await api.checkPermission(this.data.babyId, 'guardian')
      if (!hasPermission) {
        wx.showToast({
          title: '只有一级助教才可以更新头像',
          icon: 'none'
        })
        return
      }
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: async (res) => {
          const tempFilePath = res.tempFiles[0].tempFilePath;

          wx.showLoading({ title: '上传中...' })

          try {
            // 上传图片到云存储的avatars文件夹
            const cloudPath = 'avatars/' + Date.now() + '_' + Math.floor(Math.random() * 10000) + '.jpg'
            const uploadResult = await wx.cloud.uploadFile({
              cloudPath: cloudPath,
              filePath: tempFilePath
            })

            const fileID = uploadResult.fileID

            // 更新宝宝头像
            await api.updateBabyAvatar(this.data.babyId, fileID);
            this.setData({
              'baby.avatarUrl': fileID
            });
            wx.hideLoading()
            wx.showToast({
              title: '头像已更新',
              icon: 'success'
            });
          } catch (error) {
            wx.hideLoading()
            console.error('更新头像失败', error);
            wx.showToast({
              title: '更新头像失败，请重试',
              icon: 'none'
            });
          }
        }
      });
    } catch (error) {
      console.error('检查权限失败', error)
      wx.showToast({
        title: '检查权限失败',
        icon: 'none'
      })
    }
  },

  async goToAddRecord() {
    try {
      const hasPermission = await api.checkPermission(this.data.babyId, 'caretaker')
      if (!hasPermission) {
        wx.showToast({
          title: '只有一级助教和二级助教可以添加记录',
          icon: 'none'
        })
        return
      }
      wx.navigateTo({
        url: `/pages/record-add/record-add?babyId=${this.data.babyId}`
      })
    } catch (error) {
      console.error('检查权限失败', error)
      wx.showToast({
        title: '检查权限失败',
        icon: 'none'
      })
    }
  },

  async deleteRecord(e) {
    const id = e.currentTarget.dataset.id
    try {
      // 首先检查是否是一级助教
      const isGuardian = await api.checkPermission(this.data.babyId, 'guardian')
      if (isGuardian) {
        // 一级助教可以删除任何记录
        this.confirmDeleteRecord(id)
        return
      }
      
      // 检查是否是二级助教
      const isCaretaker = await api.checkPermission(this.data.babyId, 'caretaker')
      if (isCaretaker) {
        // 二级助教只能删除自己录入的记录
        try {
          // 获取记录信息
          const record = await api.getRecordById(id)
          if (record && record.openid === getApp().globalData.userInfo.openid) {
            // 是自己录入的记录，可以删除
            this.confirmDeleteRecord(id)
          } else {
            wx.showToast({
              title: '只能删除自己录入的记录',
              icon: 'none'
            })
          }
        } catch (recordError) {
          console.error('获取记录信息失败', recordError)
          wx.showToast({
            title: '获取记录信息失败',
            icon: 'none'
          })
        }
        return
      }
      
      // 既不是监护人也不是照看者，没有删除权限
      wx.showToast({
        title: '没有删除权限',
        icon: 'none'
      })
    } catch (error) {
      console.error('检查权限失败', error)
      wx.showToast({
        title: '检查权限失败',
        icon: 'none'
      })
    }
  },

  // 确认删除记录
  async confirmDeleteRecord(id) {
    wx.showModal({
      title: '确认删除',
      content: '删除后记录不可恢复',
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.deleteRecord(id)
            await this.loadData()
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })
          } catch (error) {
            console.error('删除记录失败', error)
            wx.showToast({
              title: '删除失败，请重试',
              icon: 'none'
            })
          }
        }
      }
    })
  }
})
