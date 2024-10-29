const { execSync } = require("child_process");
const fs = require("fs");

function isGitRepository() {
    // 检查当前目录是否存在 .git 文件夹
    if (fs.existsSync(".git")) {
        return true;
    }

    // 尝试执行 git 命令以确认
    try {
        execSync("git status", { stdio: "ignore" });
        return true; // 如果没有抛出错误，则是 Git 仓库
    } catch (error) {
        return false; // 如果抛出错误，则不是 Git 仓库
    }
}

function getGitRemoteUrl(remoteName = "origin") {
    try {
        // 执行 git remote -v 命令并获取输出
        const output = execSync(`git config --get remote.${remoteName}.url`, { encoding: "utf8" });
        return output.trim(); // 去掉多余的空白字符
    } catch (error) {
        return null; // 返回 null 表示未能获取信息
    }
}

function getRemoteBranches({ filter = true, remoteName = "origin" } = {}) {
    try {
        // 执行命令以获取远程分支
        const output = execSync("git branch -r", { encoding: "utf8" });
        const lines = output
            .trim()
            .split("\n")
            .map((item) => item.trim());
        if (filter === true) {
            return lines.filter((line) => line.startsWith(`${remoteName}/`));
        }
        return lines;
    } catch (error) {
        return null; // 返回 null 表示未能获取信息
    }
}

function checkCurrentBranchIsClean() {
    try {
        const output = execSync("git status --porcelain", { encoding: "utf8" });
        return !output;
    } catch (error) {
        return null;
    }
}

module.exports = {
    isGitRepository,
    getGitRemoteUrl,
    getRemoteBranches,
    checkCurrentBranchIsClean,
};
