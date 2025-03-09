const os = require("os");
const path = require("path");

const getTempPath = () => {
    // 时间戳加随机数
    return path.join(os.tmpdir(), `temp-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`);
};

module.exports = {
    getTempPath,
};
