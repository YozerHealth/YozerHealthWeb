/* 跨产品导航 / 入口页（index / mentalbook / yozerhealth）专属中英字典补丁。
 * 通过 Object.assign 合并进 window.YH_DICT，主字典保持不变。 */
window.YH_DICT = window.YH_DICT || {};
Object.assign(window.YH_DICT, {
  "悦泽量表": "YozerPsychoMetric",
  "悦泽心情急救": "YozerMentalAID",
  "Yozer 全家应用": "Yozer family",
  "我们围绕家庭健康与儿童心理，打造了一系列端侧优先、隐私优先的产品：用心理学故事陪孩子认识情绪的悦泽心理绘本、守护全家健康档案的悦泽健康、覆盖全年龄心理量表的悦泽量表，以及青少年情绪急救工具悦泽心情急救。": "Around family health and child psychology, we build a series of on-device, privacy-first products: YozerMentalBook, which uses psychological stories to help kids understand emotions; YozerHealth, which guards the whole family's health records; YozerPsychoMetric, covering all-age psychological scales; and YozerMentalAID, a teen emotional first-aid tool.",
  "覆盖婴幼儿到老年的全年龄心理量表测评工具，30 个量表、443 题，本地加密、无需联网、一键导出 PDF 报告。": "An all-age psychological scale assessment tool from infants to elderly: 30 scales, 443 items, locally encrypted, no network, one-tap PDF report.",
  "无需注册、不联网、不留记录的青少年情绪急救工具，打开即用的呼吸锚，10 秒内开始生效。": "A teen emotional first-aid tool with no registration, no network and no records; a breathing anchor ready on open, working within 10 seconds."
});
