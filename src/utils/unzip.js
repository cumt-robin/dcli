const decompress = require("decompress");
const fs = require("fs");
const { rimraf } = require("rimraf");
const { getTempPath } = require("./path");

const unzipFromStream = ({ readStream, outputPath = "./output" } = {}) => {
    try {
        // 创建可写流保存文件
        const zipTempPath = getTempPath();
        const outputStream = fs.createWriteStream(zipTempPath);

        // 将响应数据写入文件
        readStream.pipe(outputStream);

        return new Promise((resolve, reject) => {
            outputStream.on("finish", async () => {
                // 解压 zip 文件
                try {
                    await decompress(zipTempPath, outputPath);
                    await rimraf(zipTempPath);
                    resolve();
                } catch (error) {
                    console.error("解压失败:", error);
                    reject(error);
                }
            });

            outputStream.on("error", (error) => {
                reject(error);
            });
        });
    } catch (error) {
        console.error("解压失败:", error);
    }
};

module.exports = {
    unzipFromStream,
};
