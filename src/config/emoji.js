export const emoji   ={

  "check": "<:yuki_check:1404750323817517126>",
  "info": "<:yuki_info:1404750536401616988>",
  "cross": "<:yuki_cross:1404750742249541762>",
  "add": "<:yuki_add:1405044085076791336>",
  "reset": "<:yuki_reset:1405115815241453681>",
  "folder": "<:yuki_folder:1405120584232337470>",
  "openfolder": "<:yuki_openfolder:1405120588908855371>",

  get(name, fallback   ='') {
    return this[name] || fallback;
  },
};

export default emoji;
