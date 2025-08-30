export const emoji = {
  "check": "<:yuki_check:1410575553194491914>",
  "info": "<:yuki_info:1410575557833392271>",
  "cross": "<:yuki_cross:1410575545858527284>",
  "add": "<:yuki_add:1410575682618134579>",
  "reset": "<:yuki_reset:1410575689500987494>",
  "folder": "<:yuki_folder:1410575694815166526>",
  "openfolder": "<:yuki_openfolder:1410576118418903040>",
  "music": "<a:music:1409479087864549499>",
  "right": "<:arrow:1410575540733087836>",
  "left": "<:arrow_red_left:1410575535930605599>",
  "loading": "<a:loading:1409479745875345428>",
  get(name, fallback = '') {
    return this[name] || fallback;
  },
};

export default emoji;
