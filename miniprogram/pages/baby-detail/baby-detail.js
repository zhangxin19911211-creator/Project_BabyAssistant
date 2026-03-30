// pages/baby-detail/baby-detail.js
const api = require('../../utils/api.js')
const util = require('../../utils/util.js')
import * as echarts from '../../components/ec-canvas/echarts'

function getChartOptions(title, xAxisData, standardDataP3, standardDataP50, standardDataP97, actualData, yAxisName, yAxisInterval) {
  // Build complete timeline for standard data from 0 to max month
  const maxXAxis = Math.max.apply(null, xAxisData.map(function(x) { return Math.ceil(x) }))
  const maxMonth = Math.max(84, maxXAxis)
  const fullXAxisData = []
  for (let i = 0; i <= maxMonth; i++) {
    fullXAxisData.push(i)
  }
  const stdSeriesDataP3 = fullXAxisData.map(function(month) { return [month, standardDataP3(month)] })
  const stdSeriesDataP50 = fullXAxisData.map(function(month) { return [month, standardDataP50(month)] })
  const stdSeriesDataP97 = fullXAxisData.map(function(month) { return [month, standardDataP97(month)] })
  
  // Ensure actual data points have integer x values
  const actSeriesData = actualData.map((y, i) => [Math.round(xAxisData[i]), y]);

  return {
    tooltip: {
      trigger: 'axis',
      formatter: function (params) {
        let result = Math.round(params[0].axisValue) + ' 个月\n';
        params.forEach(item => {
          result += item.marker + item.seriesName + ': ' + item.data[1] + '\n';
        });
        return result;
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
      bottom: '25%',
      top: '10%',
      containLabel: true
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'none',
        zoomOnMouseWheel: true,
        moveOnMouseMove: true
      },
      {
        type: 'inside',
        yAxisIndex: 0,
        filterMode: 'none'
      }
    ],
    xAxis: {
      type: 'value',
      name: '月龄',
      min: function(value) { return Math.floor(value.min); },
      max: function(value) { return Math.ceil(value.max); },
      axisLabel: {
        formatter: function(value) {
          return Math.round(value);
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
      min: function(value) { return Math.floor(value.min / yAxisInterval) * yAxisInterval; },
      max: function(value) { return Math.ceil(value.max / yAxisInterval) * yAxisInterval; },
      axisLabel: { formatter: '{value}' },
      splitLine: { show: true, lineStyle: { type: 'dashed', color: '#eee' } }
    },
    series: [
      {
        name: '标准曲线(P3)',
        type: 'line',
        smooth: true,
        itemStyle: { color: 'rgba(135, 206, 235, 0.6)' },
        lineStyle: { width: 1.5, type: 'dashed' },
        data: stdSeriesDataP3
      },
      {
        name: '标准曲线(P50)',
        type: 'line',
        smooth: true,
        itemStyle: { color: '#87CEEB' },
        lineStyle: { width: 2 },
        data: stdSeriesDataP50
      },
      {
        name: '标准曲线(P97)',
        type: 'line',
        smooth: true,
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
    // 添加标准数据缓存
    cachedStandardData: {}
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
      setTimeout(() => {
        const initFn = util.debounce(() => this.initHeightChart(), 300)
        initFn()
      }, 100)
    } else if (this.data.currentTab === 'weight') {
      setTimeout(() => {
        const initFn = util.debounce(() => this.initWeightChart(), 300)
        initFn()
      }, 100)
    }
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
      })

      // If tabs are chart tabs, we would re-render charts here
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
    if (this.data.currentTab === tab) return;

    this.setData({
      currentTab: tab
    }, () => {
      // Lazy load chart if switching to chart tab with debounce
      if (tab === 'height') {
        setTimeout(() => {
          const initFn = util.debounce(() => this.initHeightChart(), 300)
          initFn()
        }, 100)
      } else if (tab === 'weight') {
        setTimeout(() => {
          const initFn = util.debounce(() => this.initWeightChart(), 300)
          initFn()
        }, 100)
      }
    });
  },

  // 男孩身高标准数据（国家卫健委WS/T 423-2022标准，0-84月）
  getBoyHeightStandard() {
    // 0-84个月男孩身高标准（单位：cm）
    const boyHeight = {
      p3: [46.3, 50.3, 53.7, 56.5, 58.9, 60.8, 62.5, 64.0, 65.4, 66.7, 67.9, 69.1, 70.2, 71.2, 72.3, 73.3, 74.2, 75.2, 76.1, 77.0, 77.8, 78.6, 79.4, 80.1, 80.9, 81.6, 82.3, 83.0, 83.7, 84.3, 85.0, 85.6, 86.2, 86.8, 87.4, 88.0, 88.6, 89.2, 89.8, 90.4, 91.0, 91.5, 92.1, 92.6, 93.2, 93.7, 94.2, 94.7, 95.2, 95.7, 96.2, 96.7, 97.2, 97.7, 98.2, 98.6, 99.1, 99.5, 100.0, 100.4, 100.9, 101.3, 101.7, 102.2, 102.6, 103.0, 103.5, 103.9, 104.3, 104.8, 105.2, 105.6, 106.0, 106.5, 106.9, 107.3, 107.7, 108.2, 108.6, 109.0, 109.4, 109.9, 110.3, 110.7, 111.1, 111.6, 112.0, 112.4, 112.8, 113.3, 113.7, 114.1, 114.3],
      p50: [50.4, 54.7, 58.1, 60.9, 63.3, 65.3, 67.0, 68.5, 69.9, 71.2, 72.4, 73.6, 74.7, 75.7, 76.8, 77.8, 78.8, 79.7, 80.6, 81.5, 82.4, 83.2, 84.1, 84.9, 85.7, 86.5, 87.3, 88.1, 88.9, 89.6, 90.4, 91.1, 91.9, 92.6, 93.3, 94.0, 94.7, 95.4, 96.1, 96.8, 97.5, 98.2, 98.9, 99.5, 100.2, 100.9, 101.5, 102.2, 102.8, 103.4, 104.1, 104.7, 105.3, 105.9, 106.5, 107.1, 107.7, 108.3, 108.9, 109.5, 110.1, 110.6, 111.2, 111.8, 112.3, 112.9, 113.4, 114.0, 114.5, 115.0, 115.6, 116.1, 116.6, 117.1, 117.6, 118.1, 118.6, 119.1, 119.6, 120.1, 120.6, 121.0, 121.5, 122.0, 122.5],
      p97: [54.5, 59.1, 62.6, 65.5, 68.0, 70.1, 71.9, 73.6, 75.1, 76.5, 77.9, 79.2, 80.4, 81.6, 82.7, 83.8, 84.9, 86.0, 87.0, 88.0, 89.0, 89.9, 90.8, 91.7, 92.6, 93.5, 94.4, 95.2, 96.0, 96.9, 97.7, 98.5, 99.3, 100.0, 100.8, 101.5, 102.3, 103.0, 103.7, 104.5, 105.2, 105.9, 106.6, 107.3, 108.0, 108.7, 109.4, 110.1, 110.8, 111.4, 112.1, 112.7, 113.4, 114.0, 114.7, 115.3, 116.0, 116.6, 117.2, 117.9, 118.5, 119.1, 119.7, 120.3, 121.0, 121.6, 122.2, 122.8, 123.4, 124.0, 124.6, 125.2, 125.8, 126.4, 127.0, 127.6, 128.2, 128.8, 129.3, 129.9, 130.4, 130.7]
    };
    return (m, percentile) => {
      const idx = Math.floor(Math.min(Math.max(m, 0), 84));
      const data = boyHeight[percentile] || boyHeight.p50;
      return data[idx];
    };
  },

  // 女孩身高标准数据（国家卫健委WS/T 423-2022标准，0-84月）
  getGirlHeightStandard() {
    // 0-84个月女孩身高标准（单位：cm）
    const girlHeight = {
      p3: [45.5, 49.4, 52.7, 55.4, 57.7, 59.7, 61.4, 62.9, 64.3, 65.6, 66.8, 67.9, 69.0, 70.1, 71.1, 72.1, 73.0, 73.9, 74.8, 75.7, 76.5, 77.3, 78.1, 78.9, 79.6, 80.4, 81.1, 81.8, 82.5, 83.2, 83.9, 84.6, 85.3, 86.0, 86.6, 87.3, 87.9, 88.6, 89.2, 89.8, 90.4, 91.0, 91.6, 92.2, 92.8, 93.4, 94.0, 94.5, 95.1, 95.6, 96.2, 96.7, 97.3, 97.8, 98.3, 98.9, 99.4, 99.9, 100.4, 100.9, 101.4, 101.9, 102.4, 102.9, 103.4, 103.9, 104.4, 104.9, 105.4, 105.9, 106.3, 106.8, 107.3, 107.8, 108.2, 108.7, 109.2, 109.6, 110.1, 110.5, 111.0, 111.4, 111.9, 112.3, 112.8, 113.2, 113.7],
      p50: [49.7, 53.9, 57.2, 60.0, 62.4, 64.4, 66.2, 67.8, 69.3, 70.6, 71.9, 73.1, 74.3, 75.4, 76.5, 77.6, 78.6, 79.6, 80.6, 81.5, 82.4, 83.3, 84.2, 85.1, 86.0, 86.8, 87.6, 88.4, 89.2, 90.0, 90.8, 91.6, 92.4, 93.1, 93.9, 94.6, 95.4, 96.1, 96.8, 97.5, 98.2, 98.9, 99.6, 100.3, 101.0, 101.7, 102.4, 103.1, 103.7, 104.4, 105.0, 105.7, 106.3, 107.0, 107.6, 108.2, 108.9, 109.5, 110.1, 110.8, 111.4, 112.0, 112.6, 113.2, 113.8, 114.4, 115.0, 115.6, 116.2, 116.8, 117.4, 118.0, 118.6, 119.2, 119.7, 120.3, 120.9, 121.4, 122.0, 122.5],
      p97: [54.0, 58.4, 61.8, 64.7, 67.2, 69.3, 71.2, 72.9, 74.5, 76.0, 77.4, 78.7, 80.0, 81.3, 82.5, 83.7, 84.8, 85.9, 87.0, 88.1, 89.1, 90.1, 91.1, 92.1, 93.0, 93.9, 94.8, 95.7, 96.6, 97.5, 98.3, 99.2, 100.0, 100.9, 101.7, 102.5, 103.3, 104.1, 104.9, 105.6, 106.4, 107.1, 107.9, 108.6, 109.4, 110.1, 110.8, 111.5, 112.3, 113.0, 113.7, 114.4, 115.1, 115.8, 116.5, 117.2, 117.9, 118.6, 119.3, 120.0, 120.7, 121.4, 122.1, 122.7, 123.4, 124.1, 124.7, 125.4, 126.0, 126.7, 127.3, 128.0, 128.6, 129.2, 129.9, 130.5, 131.1, 131.8, 132.4, 133.0, 133.6, 134.2]
    };
    return (m, percentile) => {
      const idx = Math.floor(Math.min(Math.max(m, 0), 84));
      const data = girlHeight[percentile] || girlHeight.p50;
      return data[idx];
    };
  },

  // 男孩体重标准数据（国家卫健委WS/T 423-2022标准，0-84月）
  getBoyWeightStandard() {
    // 0-84个月男孩体重标准（单位：kg）
    const boyWeight = {
      p3: [2.9, 3.9, 4.8, 5.5, 6.1, 6.6, 7.0, 7.4, 7.7, 8.0, 8.3, 8.5, 8.7, 8.9, 9.1, 9.3, 9.5, 9.7, 9.9, 10.1, 10.2, 10.4, 10.6, 10.8, 11.0, 11.1, 11.3, 11.5, 11.7, 11.9, 12.1, 12.3, 12.5, 12.7, 12.9, 13.1, 13.3, 13.5, 13.7, 14.0, 14.2, 14.4, 14.6, 14.9, 15.1, 15.3, 15.6, 15.8, 16.1, 16.3, 16.6, 16.8, 17.1, 17.4, 17.6, 17.9, 18.2, 18.5, 18.7, 19.0, 19.3, 19.6, 19.9, 20.2, 20.5, 20.8, 21.1, 21.4, 21.7, 22.0, 22.3, 22.6, 22.9, 23.2, 23.5, 23.8, 24.1, 24.4, 24.7, 25.0, 25.3, 25.6, 25.9, 26.2, 26.5, 26.8, 27.1],
      p50: [3.3, 4.5, 5.6, 6.4, 7.1, 7.6, 8.1, 8.5, 8.9, 9.2, 9.5, 9.8, 10.1, 10.4, 10.6, 10.9, 11.1, 11.4, 11.6, 11.9, 12.1, 12.4, 12.6, 12.9, 13.1, 13.4, 13.6, 13.9, 14.1, 14.4, 14.6, 14.9, 15.2, 15.4, 15.7, 16.0, 16.2, 16.5, 16.8, 17.1, 17.4, 17.7, 18.0, 18.3, 18.6, 18.9, 19.2, 19.5, 19.8, 20.1, 20.4, 20.7, 21.0, 21.4, 21.7, 22.0, 22.3, 22.7, 23.0, 23.3, 23.7, 24.0, 24.3, 24.7, 25.0, 25.3, 25.7, 26.0, 26.3, 26.7, 27.0, 27.3, 27.7, 28.0, 28.3, 28.7, 29.0, 29.3, 29.6, 30.0, 30.3, 30.6, 30.9, 31.2, 31.5, 31.8],
      p97: [3.9, 5.2, 6.5, 7.5, 8.3, 9.0, 9.6, 10.1, 10.6, 11.1, 11.5, 11.9, 12.3, 12.7, 13.1, 13.5, 13.8, 14.2, 14.6, 14.9, 15.3, 15.7, 16.0, 16.4, 16.8, 17.1, 17.5, 17.9, 18.3, 18.6, 19.0, 19.4, 19.8, 20.2, 20.6, 21.0, 21.4, 21.8, 22.2, 22.6, 23.0, 23.4, 23.8, 24.2, 24.6, 25.0, 25.5, 25.9, 26.3, 26.7, 27.2, 27.6, 28.0, 28.5, 28.9, 29.4, 29.8, 30.3, 30.7, 31.2, 31.6, 32.1, 32.5, 33.0, 33.4, 33.9, 34.3, 34.8, 35.2, 35.7, 36.1, 36.6, 37.0, 37.5, 37.9, 38.4, 38.8, 39.2, 39.7, 40.1, 40.5, 41.0, 41.4, 41.8, 42.2, 42.6]
    };
    return (m, percentile) => {
      const idx = Math.floor(Math.min(Math.max(m, 0), 84));
      const data = boyWeight[percentile] || boyWeight.p50;
      return data[idx];
    };
  },

  // 女孩体重标准数据（国家卫健委WS/T 423-2022标准，0-84月）
  getGirlWeightStandard() {
    // 0-84个月女孩体重标准（单位：kg）
    const girlWeight = {
      p3: [2.8, 3.7, 4.5, 5.2, 5.8, 6.2, 6.6, 7.0, 7.3, 7.6, 7.9, 8.1, 8.4, 8.6, 8.8, 9.0, 9.2, 9.4, 9.6, 9.8, 10.0, 10.2, 10.4, 10.6, 10.8, 11.0, 11.2, 11.4, 11.6, 11.8, 12.0, 12.2, 12.4, 12.6, 12.8, 13.0, 13.2, 13.4, 13.6, 13.8, 14.0, 14.2, 14.5, 14.7, 14.9, 15.1, 15.4, 15.6, 15.8, 16.1, 16.3, 16.5, 16.8, 17.0, 17.3, 17.5, 17.8, 18.0, 18.3, 18.5, 18.8, 19.0, 19.3, 19.5, 19.8, 20.1, 20.3, 20.6, 20.9, 21.1, 21.4, 21.7, 21.9, 22.2, 22.5, 22.7, 23.0, 23.3, 23.5, 23.8, 24.1, 24.3, 24.6, 24.8, 25.1, 25.3],
      p50: [3.2, 4.2, 5.1, 5.8, 6.5, 7.0, 7.5, 7.9, 8.3, 8.6, 8.9, 9.2, 9.5, 9.8, 10.1, 10.4, 10.7, 11.0, 11.3, 11.5, 11.8, 12.1, 12.4, 12.6, 12.9, 13.2, 13.5, 13.7, 14.0, 14.3, 14.6, 14.8, 15.1, 15.4, 15.7, 16.0, 16.2, 16.5, 16.8, 17.1, 17.4, 17.7, 18.0, 18.3, 18.6, 18.9, 19.2, 19.5, 19.8, 20.1, 20.4, 20.7, 21.0, 21.3, 21.6, 21.9, 22.2, 22.5, 22.8, 23.1, 23.4, 23.7, 24.0, 24.3, 24.6, 24.9, 25.2, 25.5, 25.8, 26.1, 26.4, 26.7, 27.0, 27.3, 27.6, 27.9, 28.2, 28.5, 28.8, 29.1, 29.4, 29.7, 30.0, 30.3, 30.6],
      p97: [3.6, 4.8, 5.9, 6.8, 7.6, 8.3, 8.9, 9.4, 9.9, 10.4, 10.8, 11.2, 11.6, 12.0, 12.4, 12.8, 13.2, 13.6, 14.0, 14.3, 14.7, 15.1, 15.5, 15.9, 16.3, 16.7, 17.1, 17.5, 17.9, 18.3, 18.7, 19.1, 19.5, 19.9, 20.3, 20.7, 21.1, 21.5, 21.9, 22.3, 22.7, 23.1, 23.5, 23.9, 24.3, 24.7, 25.1, 25.5, 26.0, 26.4, 26.8, 27.2, 27.6, 28.0, 28.5, 28.9, 29.3, 29.7, 30.1, 30.6, 31.0, 31.4, 31.8, 32.2, 32.7, 33.1, 33.5, 33.9, 34.3, 34.8, 35.2, 35.6, 36.0, 36.4, 36.9, 37.3, 37.7, 38.1, 38.5, 38.9, 39.3, 39.7, 40.1, 40.5, 40.9, 41.3]
    };
    return (m, percentile) => {
      const idx = Math.floor(Math.min(Math.max(m, 0), 84));
      const data = girlWeight[percentile] || girlWeight.p50;
      return data[idx];
    };
  },

  initHeightChart() {
    this.heightComponent = this.selectComponent('#height-dom-line');
    if (!this.heightComponent) {
      console.error('Cannot find #height-dom-line');
      return;
    }

    this.heightComponent.init((canvas, width, height, dpr) => {
      const chart = echarts.init(canvas, null, {
        width: width,
        height: height,
        devicePixelRatio: dpr
      });
      canvas.setChart(chart);

      // Prepare data
      const records = this.data.records.slice().sort((a, b) => new Date(a.recordDate) - new Date(b.recordDate)); // Sort by date ascending
      const xAxisData = records.length > 0 ? records.map(r => {
        const age = util.calculateAge(this.data.baby.birthDate, r.recordDate);
        return age.years * 12 + age.months;
      }) : [0, 1, 2, 3, 4, 5];
      const actualData = records.length > 0 ? records.map(r => r.height) : [];
      
      // 根据宝宝性别选择相应的标准数据
      const isBoy = this.data.baby.gender === 'male';
      const getStandardDataP3 = isBoy ? this.getBoyHeightStandard() : this.getGirlHeightStandard();
      const getStandardDataP50 = isBoy ? this.getBoyHeightStandard() : this.getGirlHeightStandard();
      const getStandardDataP97 = isBoy ? this.getBoyHeightStandard() : this.getGirlHeightStandard();
      
      // 包装函数，传递百分位参数
      const standardDataP3 = (m) => getStandardDataP3(m, 'p3');
      const standardDataP50 = (m) => getStandardDataP50(m, 'p50');
      const standardDataP97 = (m) => getStandardDataP97(m, 'p97');

      const option = getChartOptions('身高曲线', xAxisData, standardDataP3, standardDataP50, standardDataP97, actualData, '身高 (cm)', 10);
      
      // Add external dataZoom for better control
      option.dataZoom.push({
        type: 'slider',
        show: true,
        xAxisIndex: 0,
        start: 0,
        end: 100,
        bottom: 120,
        height: 20
      });
      
      // Zoom logic - show only recent 3 data points
      if (actualData.length > 0) {
        // Show recent 3 data points
        if (xAxisData.length >= 3) {
          const startValue = xAxisData[xAxisData.length - 3];
          const endValue = xAxisData[xAxisData.length - 1];
          const range = endValue - startValue;
          option.dataZoom[0].startValue = Math.max(0, startValue - range * 0.2);
          option.dataZoom[0].endValue = endValue + range * 0.2;
        } else {
          // Default to 6 months window
          option.dataZoom[0].startValue = 0;
          option.dataZoom[0].endValue = 6;
        }
      } else {
        option.dataZoom[0].startValue = 0;
        option.dataZoom[0].endValue = 6;
      }

      chart.setOption(option);
      this.heightChart = chart;
      
      // Enable zoom and pan
      chart.getZr().on('mousewheel', function(e) { e.event.preventDefault(); });
      
      return chart;
    });
  },

  initWeightChart() {
    this.weightComponent = this.selectComponent('#weight-dom-line');
    if (!this.weightComponent) {
      console.error('Cannot find #weight-dom-line');
      return;
    }

    this.weightComponent.init((canvas, width, height, dpr) => {
      const chart = echarts.init(canvas, null, {
        width: width,
        height: height,
        devicePixelRatio: dpr
      });
      canvas.setChart(chart);

      // Prepare data
      const records = this.data.records.slice().sort((a, b) => new Date(a.recordDate) - new Date(b.recordDate)); // Sort by date ascending
      const xAxisData = records.length > 0 ? records.map(r => {
        const age = util.calculateAge(this.data.baby.birthDate, r.recordDate);
        return age.years * 12 + age.months;
      }) : [0, 1, 2, 3, 4, 5];
      const actualData = records.length > 0 ? records.map(r => r.weight) : [];
      
      // 根据宝宝性别选择相应的标准数据
      const isBoy = this.data.baby.gender === 'male';
      const getStandardDataP3 = isBoy ? this.getBoyWeightStandard() : this.getGirlWeightStandard();
      const getStandardDataP50 = isBoy ? this.getBoyWeightStandard() : this.getGirlWeightStandard();
      const getStandardDataP97 = isBoy ? this.getBoyWeightStandard() : this.getGirlWeightStandard();
      
      // 包装函数，传递百分位参数
      const standardDataP3 = (m) => getStandardDataP3(m, 'p3');
      const standardDataP50 = (m) => getStandardDataP50(m, 'p50');
      const standardDataP97 = (m) => getStandardDataP97(m, 'p97');

      const option = getChartOptions('体重曲线', xAxisData, standardDataP3, standardDataP50, standardDataP97, actualData, '体重 (kg)', 5);
      
      // Add external dataZoom for better control
      option.dataZoom.push({
        type: 'slider',
        show: true,
        xAxisIndex: 0,
        start: 0,
        end: 100,
        bottom: 120,
        height: 20
      });
      
      // Zoom logic - show only recent 3 data points
      if (actualData.length > 0) {
        // Show recent 3 data points
        if (xAxisData.length >= 3) {
          const startValue = xAxisData[xAxisData.length - 3];
          const endValue = xAxisData[xAxisData.length - 1];
          const range = endValue - startValue;
          option.dataZoom[0].startValue = Math.max(0, startValue - range * 0.2);
          option.dataZoom[0].endValue = endValue + range * 0.2;
        } else {
          // Default to 6 months window
          option.dataZoom[0].startValue = 0;
          option.dataZoom[0].endValue = 6;
        }
      } else {
        option.dataZoom[0].startValue = 0;
        option.dataZoom[0].endValue = 6;
      }

      chart.setOption(option);
      this.weightChart = chart;
      
      // Enable zoom and pan
      chart.getZr().on('mousewheel', function(e) { e.event.preventDefault(); });
      
      return chart;
    });
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
      
      wx.showModal({
        title: '修改宝宝姓名',
        content: '请输入新的宝宝姓名（最多7个字符）',
        editable: true,
        placeholderText: this.data.baby.name,
        success: async (res) => {
          if (res.confirm && res.content) {
            const newName = res.content.trim()
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
                'baby.name': newName
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
          }
        }
      })
    } catch (error) {
      console.error('检查权限失败', error)
      wx.showToast({
        title: '检查权限失败',
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
          wx.getFileSystemManager().saveFile({
            tempFilePath: tempFilePath,
            success: async (saveRes) => {
              try {
                await api.updateBabyAvatar(this.data.babyId, saveRes.savedFilePath);
                this.setData({
                  'baby.avatarUrl': saveRes.savedFilePath
                });
                wx.showToast({
                  title: '头像已更新',
                  icon: 'success'
                });
              } catch (error) {
                console.error('更新头像失败', error);
                wx.showToast({
                  title: '更新头像失败，请重试',
                  icon: 'none'
                });
              }
            },
            fail: () => {
              wx.showToast({
                title: '保存头像失败',
                icon: 'none'
              });
            }
          });
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
