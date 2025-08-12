export const emoji   ={
  "check": "<:yuki_check:1404750323817517126>",
  "info":"<:yuki_info:1404750536401616988>",
  "cross":"<:yuki_cross:1404750742249541762>",
  
  get(name, fallback   ='') {
    return this[name] || fallback;
  },
};

export default emoji;
