const { unzipFromStream } = require("./unzip");
const axios = require("axios");
const path = require("path");
const fse = require("fs-extra");
const { getTempPath } = require("./path");

const downloadUnzipRepo = async ({ userName, repoName, outputPath, branch = "main" }) => {
    const url = `https://github.com/${userName}/${repoName}/archive/refs/heads/${branch}.zip`;
    const response = await axios.get(url, {
        responseType: "stream",
        headers: {
            Accept: "application/zip",
            "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
    });
    await unzipFromStream({
        readStream: response.data,
        outputPath,
    });
};

const downloadGithubRepoDir = async ({ userName, repoName, outputPath, branch, dir = "" } = {}) => {
    const tempDir = getTempPath();
    await downloadUnzipRepo({ userName, repoName, outputPath: tempDir, branch });
    const dirPath = path.join(tempDir, `${repoName}-${branch}/${dir}`);
    // dirPath 输出到 outputPath
    await fse.copy(dirPath, outputPath);
    // 删除 tempDir
    await fse.remove(tempDir);
};

module.exports = {
    downloadUnzipRepo,
    downloadGithubRepoDir,
};
