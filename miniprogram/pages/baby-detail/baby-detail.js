// pages/baby-detail/baby-detail.js
const api = require('../../utils/api.js')
const util = require('../../utils/util.js')
import * as echarts from '../../components/ec-canvas/echarts'

function getChartOptions(title, xAxisData, standardDataP3, standardDataP50, standardDataP97, actualData, yAxisName, yAxisInterval) {
  // Build complete timeline for standard data from 0 to max month
  const maxXAxis = Math.max.apply(null, xAxisData.map(function(x) { return Math.ceil(x) }))
  const maxMonth = Math.max(36, maxXAxis)
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
    }
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
    // If starting on a chart tab, initialize it
    if (this.data.currentTab === 'height') {
      setTimeout(() => this.initHeightChart(), 100);
    } else if (this.data.currentTab === 'weight') {
      setTimeout(() => this.initWeightChart(), 100);
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
      // Lazy load chart if switching to chart tab
      if (tab === 'height') {
        setTimeout(() => this.initHeightChart(), 100);
      } else if (tab === 'weight') {
        setTimeout(() => this.initWeightChart(), 100);
      }
    });
  },

  // 男孩身高标准数据（国家卫健委标准）
  getBoyHeightStandard() {
    // 0-36个月男孩身高标准（单位：cm）
    const boyHeight = {
      p3: [48.7, 52.7, 56.1, 58.9, 61.2, 63.1, 64.7, 66.2, 67.5, 68.8, 70.0, 71.2, 72.3, 73.5, 74.6, 75.6, 76.7, 77.6, 78.7, 79.6, 80.6, 81.4, 82.3, 83.2, 84.1, 84.9, 85.8, 86.7, 87.5, 88.4, 89.3, 90.1, 91.0, 91.8, 92.7, 93.6, 94.4],
      p50: [50.4, 54.7, 58.4, 61.4, 63.9, 65.9, 67.6, 69.2, 70.6, 72.0, 73.3, 74.5, 75.7, 76.9, 78.0, 79.1, 80.2, 81.2, 82.3, 83.2, 84.2, 85.1, 86.0, 86.9, 87.8, 88.7, 89.6, 90.5, 91.4, 92.3, 93.2, 94.1, 95.0, 95.9, 96.8, 97.7, 98.6],
      p97: [52.1, 56.7, 60.7, 63.9, 66.6, 68.9, 70.7, 72.3, 73.8, 75.3, 76.7, 78.0, 79.3, 80.6, 81.8, 83.0, 84.2, 85.3, 86.5, 87.5, 88.6, 89.6, 90.6, 91.6, 92.6, 93.6, 94.6, 95.5, 96.5, 97.5, 98.4, 99.4, 100.3, 101.3, 102.2, 103.2, 104.1]
    };
    return (m, percentile) => {
      const idx = Math.floor(Math.min(Math.max(m, 0), 36));
      const data = boyHeight[percentile] || boyHeight.p50;
      return data[idx] || (data[36] + (m - 36) * 0.8); // 粗略外推
    };
  },

  // 女孩身高标准数据（国家卫健委标准）
  getGirlHeightStandard() {
    // 0-36个月女孩身高标准（单位：cm）
    const girlHeight = {
      p3: [47.9, 51.9, 55.2, 57.9, 60.2, 62.1, 63.7, 65.2, 66.4, 67.7, 68.9, 70.1, 71.2, 72.3, 73.4, 74.4, 75.5, 76.4, 77.5, 78.4, 79.4, 80.2, 81.1, 82.0, 82.9, 83.7, 84.6, 85.5, 86.3, 87.2, 88.1, 88.9, 89.8, 90.6, 91.5, 92.4, 93.2],
      p50: [49.7, 53.8, 57.4, 60.4, 62.8, 64.8, 66.4, 68.0, 69.4, 70.8, 72.1, 73.3, 74.5, 75.7, 76.8, 77.9, 79.0, 80.0, 81.1, 82.0, 83.0, 83.9, 84.8, 85.7, 86.6, 87.5, 88.4, 89.3, 90.2, 91.1, 92.0, 92.9, 93.8, 94.7, 95.6, 96.5, 97.3],
      p97: [51.4, 55.5, 59.3, 62.5, 65.1, 67.3, 69.1, 70.7, 72.2, 73.6, 75.0, 76.3, 77.6, 78.9, 80.1, 81.3, 82.5, 83.6, 84.8, 85.8, 86.9, 87.9, 88.9, 89.9, 90.9, 91.9, 92.9, 93.8, 94.8, 95.7, 96.7, 97.6, 98.5, 99.5, 100.4, 101.3, 102.2]
    };
    return (m, percentile) => {
      const idx = Math.floor(Math.min(Math.max(m, 0), 36));
      const data = girlHeight[percentile] || girlHeight.p50;
      return data[idx] || (data[36] + (m - 36) * 0.7); // 粗略外推
    };
  },

  // 男孩体重标准数据（国家卫健委标准）
  getBoyWeightStandard() {
    // 0-36个月男孩体重标准（单位：kg）
    const boyWeight = {
      p3: [2.9, 3.9, 4.8, 5.5, 6.0, 6.4, 6.8, 7.1, 7.4, 7.7, 7.9, 8.1, 8.3, 8.5, 8.7, 8.9, 9.0, 9.2, 9.4, 9.5, 9.7, 9.8, 10.0, 10.2, 10.3, 10.5, 10.6, 10.8, 10.9, 11.1, 11.2, 11.4, 11.5, 11.7, 11.8, 12.0, 12.1],
      p50: [3.3, 4.5, 5.6, 6.4, 7.0, 7.5, 7.9, 8.3, 8.6, 8.9, 9.2, 9.4, 9.6, 9.9, 10.1, 10.3, 10.5, 10.7, 10.9, 11.1, 11.3, 11.5, 11.8, 12.0, 12.2, 12.4, 12.6, 12.8, 13.0, 13.2, 13.4, 13.6, 13.8, 14.0, 14.2, 14.4, 14.6],
      p97: [3.7, 5.1, 6.4, 7.3, 8.0, 8.6, 9.1, 9.6, 10.0, 10.4, 10.8, 11.1, 11.4, 11.8, 12.1, 12.4, 12.7, 13.0, 13.3, 13.6, 13.9, 14.2, 14.6, 14.9, 15.2, 15.5, 15.8, 16.1, 16.4, 16.7, 17.0, 17.3, 17.6, 17.9, 18.2, 18.5, 18.8]
    };
    return (m, percentile) => {
      const idx = Math.floor(Math.min(Math.max(m, 0), 36));
      const data = boyWeight[percentile] || boyWeight.p50;
      return data[idx] || (data[36] + (m - 36) * 0.2); // 粗略外推
    };
  },

  // 女孩体重标准数据（国家卫健委标准）
  getGirlWeightStandard() {
    // 0-36个月女孩体重标准（单位：kg）
    const girlWeight = {
      p3: [2.8, 3.7, 4.5, 5.1, 5.6, 6.0, 6.3, 6.6, 6.9, 7.1, 7.3, 7.5, 7.7, 7.8, 8.0, 8.2, 8.3, 8.4, 8.6, 8.7, 8.9, 9.0, 9.1, 9.3, 9.4, 9.5, 9.7, 9.8, 9.9, 10.1, 10.2, 10.3, 10.5, 10.6, 10.7, 10.8, 11.0],
      p50: [3.2, 4.2, 5.2, 5.9, 6.5, 6.9, 7.3, 7.6, 7.9, 8.2, 8.4, 8.6, 8.8, 9.0, 9.2, 9.4, 9.6, 9.8, 10.0, 10.1, 10.3, 10.5, 10.7, 10.9, 11.1, 11.2, 11.4, 11.6, 11.8, 11.9, 12.1, 12.3, 12.4, 12.6, 12.7, 12.9, 13.0],
      p97: [3.6, 4.8, 6.0, 6.8, 7.4, 8.0, 8.4, 8.8, 9.2, 9.5, 9.8, 10.1, 10.4, 10.7, 11.0, 11.2, 11.5, 11.7, 12.0, 12.2, 12.5, 12.7, 13.0, 13.3, 13.5, 13.8, 14.0, 14.3, 14.5, 14.8, 15.0, 15.3, 15.5, 15.8, 16.0, 16.3, 16.5]
    };
    return (m, percentile) => {
      const idx = Math.floor(Math.min(Math.max(m, 0), 36));
      const data = girlWeight[percentile] || girlWeight.p50;
      return data[idx] || (data[36] + (m - 36) * 0.15); // 粗略外推
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
