-- 移除旧"共享便笺 / 无限画布"产品的全部残留表 (代码已无引用)
-- 注意: 该迁移不可逆, 生产库中旧产品数据将被永久删除
DROP TABLE IF EXISTS blocks;
DROP TABLE IF EXISTS board_members;
DROP TABLE IF EXISTS invitations;
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS boards;
