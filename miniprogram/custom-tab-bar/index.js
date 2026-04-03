Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: "/pages/index/index",
        text: "宝宝",
        iconPath: "/images/Baby.png",
        selectedIconPath: "/images/Baby.png"
      },
      {
        pagePath: "/pages/mood/mood",
        text: "心情",
        iconPath: "/images/Mood.png",
        selectedIconPath: "/images/Mood.png"
      },
      {
        pagePath: "/pages/family/family",
        text: "家庭",
        iconPath: "/images/Family.png",
        selectedIconPath: "/images/Family.png"
      }
    ]
  },
  methods: {
    switchTab(e) {
      const { index, path } = e.currentTarget.dataset
      const currentPath = this.data.list[this.data.selected].pagePath
      
      // 如果点击的是当前页面，不处理
      if (index === this.data.selected) {
        return
      }
      
      // 更新选中状态
      this.setData({
        selected: index
      })
      
      // 切换页面
      wx.switchTab({
        url: path
      })
    }
  }
})
