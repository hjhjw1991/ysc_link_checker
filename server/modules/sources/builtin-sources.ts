/**
 * 内置候选配置源清单。
 *
 * `special` 标记的两条不是配置本身，而是「源的源」：
 *   - github-readme：抓 README，正则提取其中全部链接
 *   - github-tree：调 GitHub API 递归枚举仓库内的配置文件
 */
export interface BuiltinSource {
  name: string;
  url: string;
  special?: 'github-readme' | 'github-tree';
}

export const BUILTIN_SOURCES: BuiltinSource[] = [
  { name: '无邪多仓', url: 'https://raw.githubusercontent.com/wxrjck/-YSC-/refs/heads/main/wx.json' },
  { name: '无邪优选仓', url: 'https://raw.githubusercontent.com/wxrjck/-YSC-/refs/heads/main/yx.txt' },
  { name: '无邪聚合仓', url: 'https://raw.githubusercontent.com/wxrjck/-YSC-/refs/heads/main/jh.txt' },
  { name: '月光宝盒多仓', url: 'https://jihulab.com/ygbh1/box/raw/main/dcang/dc.json' },
  { name: '自用多仓', url: 'https://raw.liucn.cc/box/dm.txt' },
  { name: '影视仓YSC配置', url: 'https://jihulab.com/mengzhu2/ysc/raw/main/YSC.json' },
  { name: 'HG影视配置', url: 'https://api.hgyx.vip/hgyx.json' },
  { name: '聚玩盒子4K', url: 'http://xhztv.top/4k.json' },
  { name: '动漫专线', url: 'https://www.yingm.cc/dm/dm.json' },
  { name: '游魂直播源', url: 'https://www.iyouhun.com/tv/zb' },
  { name: 'IPTV直播源', url: 'https://live.zbds.top/tv/iptv4.txt' },
  { name: '饭太硬线路', url: 'http://www.饭太硬.net/tv' },
  { name: '饭太硬备用', url: 'http://fty.888484.xyz/tv' },
  { name: '王二小线路', url: 'http://tvbox.王二小放牛娃.top' },
  { name: '王二小备用', url: 'https://9280.kstore.vip/newwex.json' },
  { name: '短剧专线', url: 'http://box.ufuzi.com/tv/qq/短剧频道/api.json' },
  { name: '儿童专线', url: 'https://jihulab.com/ymz1231/xymz/raw/main/ymshaoer' },
  { name: 'GitHub接口大全', url: 'https://raw.githubusercontent.com/wuxierj/TVBox/main/README.md', special: 'github-readme' },
  { name: 'GitHub配置库', url: 'https://api.github.com/repos/qist/tvbox/git/trees/master?recursive=1', special: 'github-tree' },
];
