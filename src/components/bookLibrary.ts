export interface BookPassage { chapter: string; text: string; source: string }
export interface LibraryBook {
  id: string; title: string; author: string; theme: string
  binding: 'thread' | 'wrapped' | 'accordion' | 'scroll' | 'folio'
  cover: string; edge: string; paper: string; accent: string
  passages: readonly BookPassage[]
}
const ws = (page: string) => `https://zh.wikisource.org/wiki/${page}`
// Public-domain original text only. Punctuation follows the linked electronic text;
// explanatory notes and modern translations are deliberately not copied.
export const BOOK_LIBRARY: readonly LibraryBook[] = [
  { id: 'book-1', title: '东京梦华录', author: '孟元老 撰', theme: '汴京风物', binding: 'thread', cover: '#637b87', edge: '#3f535e', paper: '#eee1c2', accent: '#a64f3c', passages: [
    { chapter: '卷二 · 御街', text: '杈子裏有磚石甃砌御溝水兩道，宣和間盡植蓮荷，近岸植桃李梨杏，雜花相間，春夏之間，望之如繡。', source: ws('東京夢華錄/卷二#御街') },
    { chapter: '卷二 · 東角樓街巷', text: '瓦中多有貨藥、賣卦、喝故衣、探搏、飲食、剃剪、紙畫、令曲之類。終日居此，不覺抵暮。', source: ws('東京夢華錄/卷二#東角樓街巷') },
    { chapter: '卷二 · 酒樓', text: '五樓相向，各有飛橋欄檻，明暗相通，珠簾繡額，燈燭晃耀。', source: ws('東京夢華錄/卷二#酒樓') },
  ] },
  { id: 'book-2', title: '梦粱录', author: '吴自牧 撰', theme: '临安岁时', binding: 'wrapped', cover: '#b08b61', edge: '#73593e', paper: '#e3cf9e', accent: '#7a5446', passages: [
    { chapter: '卷一 · 正月', text: '正月朔日，謂之元旦，俗呼為新年。一歲節序，此為之首。', source: ws('夢粱錄/卷01#正月') },
    { chapter: '卷一 · 立春', text: '街市以花裝欄，坐乘小春牛，及春幡春勝，各相獻遺與貴家宅舍，示豐稔之兆。', source: ws('夢粱錄/卷01#立春') },
    { chapter: '卷一 · 元宵', text: '又有深坊小巷，繡額珠簾，巧制新裝，競誇華麗。', source: ws('夢粱錄/卷01#元宵') },
  ] },
  { id: 'book-3', title: '武林旧事', author: '周密 撰', theme: '湖山旧游', binding: 'folio', cover: '#8d9a80', edge: '#55644e', paper: '#f0e7cf', accent: '#b27b50', passages: [
    { chapter: '卷三 · 西湖游幸', text: '時承平日久，樂與民同，凡遊觀買賣，皆無所禁。畫楫輕舫，旁舞如織。', source: ws('武林舊事/卷三#西湖游幸（都人游賞）') },
    { chapter: '卷三 · 祭掃', text: '清明前三日為寒食節，都城人家，皆插柳滿簷，雖小坊幽曲，亦青青可愛。', source: ws('武林舊事/卷三#祭掃') },
    { chapter: '卷三 · 觀潮', text: '浙江之潮，天下之偉觀也，自既望以至十八日為最盛。方其遠出海門，僅如銀線，既而漸近，則玉城雪嶺，際天而來。', source: ws('武林舊事/卷三#觀潮') },
  ] },
  { id: 'book-4', title: '礼记', author: '古代礼学文献汇编', theme: '礼与日常', binding: 'thread', cover: '#775d59', edge: '#4f3d3a', paper: '#e7d6b4', accent: '#c2a579', passages: [
    { chapter: '曲禮上', text: '曲禮曰：毋不敬，儼若思，安定辭。安民哉！', source: ws('禮記/曲禮上') },
    { chapter: '曲禮上', text: '禮尚往來。往而不來，非禮也；來而不往，亦非禮也。', source: ws('禮記/曲禮上') },
    { chapter: '曲禮上', text: '凡爲人子之禮，冬温而夏凊，昏定而晨省，在醜夷不争。', source: ws('禮記/曲禮上') },
  ] },
  { id: 'book-5', title: '诗经', author: '先秦诗歌总集', theme: '衣衿与歌', binding: 'accordion', cover: '#a28c9a', edge: '#695568', paper: '#f0e4d1', accent: '#91614f', passages: [
    { chapter: '國風 · 鄭風 · 子衿（一）', text: '青青子衿，悠悠我心。縱我不往，子寧不嗣音。', source: ws('詩經/子衿') },
    { chapter: '國風 · 鄭風 · 子衿（二）', text: '青青子佩，悠悠我思。縱我不往，子寧不來。', source: ws('詩經/子衿') },
    { chapter: '國風 · 鄭風 · 子衿（三）', text: '挑兮達兮，在城闕兮。一日不見，如三月兮。', source: ws('詩經/子衿') },
  ] },
  { id: 'book-6', title: '论语', author: '孔子弟子及后学 编', theme: '读书与相处', binding: 'thread', cover: '#475e64', edge: '#2d4148', paper: '#e4d6b5', accent: '#bd985a', passages: [
    { chapter: '學而第一 · 一', text: '子曰：「學而時習之，不亦說乎？有朋自遠方來，不亦樂乎？人不知而不慍，不亦君子乎？」', source: ws('論語/學而第一') },
    { chapter: '學而第一 · 四', text: '曾子曰：「吾日三省吾身：為人謀而不忠乎？與朋友交而不信乎？傳不習乎？」', source: ws('論語/學而第一') },
    { chapter: '學而第一 · 六', text: '子曰：「弟子入則孝，出則弟，謹而信，汎愛眾，而親仁。行有餘力，則以學文。」', source: ws('論語/學而第一') },
  ] },
  { id: 'book-7', title: '荀子', author: '荀况等 著', theme: '青出于蓝', binding: 'wrapped', cover: '#a5986d', edge: '#716441', paper: '#e5d4ad', accent: '#574d39', passages: [
    { chapter: '勸學', text: '青、取之於藍，而青於藍；冰、水為之，而寒於水。', source: 'https://ctext.org/xunzi/quan-xue/zh' },
    { chapter: '勸學', text: '積土成山，風雨興焉；積水成淵，蛟龍生焉；積善成德，而神明自得，聖心備焉。', source: 'https://ctext.org/xunzi/quan-xue/zh' },
    { chapter: '勸學', text: '故不積蹞步，無以致千里；不積小流，無以成江海。', source: 'https://ctext.org/xunzi/quan-xue/zh' },
  ] },
  { id: 'book-8', title: '楚辞', author: '屈原等 作 · 刘向 辑', theme: '香草与华衣', binding: 'scroll', cover: '#8f634e', edge: '#583e30', paper: '#ebdab5', accent: '#9f4536', passages: [
    { chapter: '九歌 · 雲中君', text: '浴蘭湯兮沐芳，華采衣兮若英。\n靈連蜷兮既留，爛昭昭兮未央。', source: ws('雲中君') },
    { chapter: '九歌 · 雲中君', text: '蹇將憺兮壽宮，與日月兮齊光。\n龍駕兮帝服，聊翱遊兮周章。', source: ws('雲中君') },
    { chapter: '九歌 · 雲中君', text: '靈皇皇兮既降，猋遠舉兮雲中。\n覽冀州兮有餘，橫四海兮焉窮。', source: ws('雲中君') },
  ] },
  { id: 'book-9', title: '山海经', author: '古代地理神话文献汇编', theme: '山川异想', binding: 'accordion', cover: '#7a8561', edge: '#4c5439', paper: '#d9d0a6', accent: '#b36c47', passages: [
    { chapter: '南山經 · 招搖之山', text: '有木焉，其狀如榖而黑理，其華四照，其名曰迷穀，佩之不迷。', source: ws('山海經/南山經#南山經之首') },
    { chapter: '南山經 · 堂庭之山', text: '又東三百里，曰堂庭之山，多棪木，多白猿，多水玉，多黃金。', source: ws('山海經/南山經#南山經之首') },
    { chapter: '南山經 · 青丘之山', text: '有獸焉，其狀如狐而九尾，其音如嬰兒，能食人；食者不蠱。', source: ws('山海經/南山經#南山經之首') },
  ] },
  { id: 'book-10', title: '庄子', author: '庄周及后学 著', theme: '逍遥一页', binding: 'scroll', cover: '#b5a37d', edge: '#756344', paper: '#eee0bd', accent: '#6e8076', passages: [
    { chapter: '內篇 · 逍遙遊', text: '北冥有魚，其名為鯤。鯤之大，不知其幾千里也。化而為鳥，其名為鵬。', source: 'https://ctext.org/zhuangzi/enjoyment-in-untroubled-ease' },
    { chapter: '內篇 · 逍遙遊', text: '且夫水之積也不厚，則負大舟也無力。', source: 'https://ctext.org/zhuangzi/enjoyment-in-untroubled-ease' },
    { chapter: '內篇 · 逍遙遊', text: '且舉世而譽之而不加勸，舉世而非之而不加沮，定乎內外之分，辯乎榮辱之竟，斯已矣。', source: 'https://ctext.org/zhuangzi/enjoyment-in-untroubled-ease' },
  ] },
]
export const libraryBook = (id: string) => BOOK_LIBRARY.find(book => book.id === id)
