/** 客户端/服务端共享常量 (避免频道名与事件名跨端重复定义) */

/** Pusher presence 频道前缀 (频道名 = 前缀 + boardId) */
export const BOARD_CHANNEL_PREFIX = "presence-board-";

/** 背景板补丁实时事件名 */
export const PATCH_EVENT = "board:patch";
