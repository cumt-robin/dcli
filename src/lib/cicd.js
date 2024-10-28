const inquirer = require("inquirer").default;
const fs = require("node:fs");
const fse = require("fs-extra");
const chalk = require("chalk");
const ora = require("ora");
const dotenv = require("dotenv");
const { default: axios } = require("axios");
const path = require("node:path");
const { isGitRepository, getGitRemoteUrl, getRemoteBranches, checkCurrentBranchIsClean } = require("../utils/git");
const { execCmdSync } = require("../utils/cmd");

const getRemoteDistFileList = async ({ privateGitlab, projectId, accessToken }) => {
    const allFiles = [];
    let page = 1;
    let hasMore = true;
    const perPage = 100; // 每页返回的文件数量
    while (hasMore) {
        const res = await axios.get(
            `${privateGitlab}/api/v4/projects/${projectId}/repository/tree?path=dist&recursive=true&per_page=${perPage}&page=${page}`,
            {
                headers: {
                    "PRIVATE-TOKEN": accessToken,
                },
            },
        );

        if (res.data.length === 0) {
            hasMore = false;
        } else {
            allFiles.push(...res.data);
            page++; // 增加页码以请求下一页
        }
    }
    return allFiles;
};

function getAllFiles(dirPath) {
    let results = [];

    const list = fs.readdirSync(dirPath);

    list.forEach((item) => {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
            results = results.concat(getAllFiles(itemPath));
        } else {
            results.push(itemPath);
        }
    });

    return results;
}

function compareResources(remoteList, localList) {
    const added = localList.filter((item) => !remoteList.includes(item));
    const removed = remoteList.filter((item) => !localList.includes(item));
    const modified = localList.filter((item) => remoteList.includes(item));
    return {
        added,
        removed,
        modified,
    };
}

async function readLocalFileContent(filePath) {
    const content = await fse.readFile(filePath, { encoding: "utf-8" });
    return content;
}

const init = async () => {
    // 用户确认
    const { confirm } = await inquirer.prompt([
        {
            type: "confirm",
            name: "confirm",
            message: "execute cicd workflow?",
            default: true,
        },
    ]);
    if (confirm) {
        // 进入流程
        console.log(chalk.green("start to execute cicd workflow!"));
        // 先检查配置文件
        if (!fs.existsSync(".gitlab_local_env")) {
            console.warn(
                chalk.yellow("项目根目录下 .gitlab_local_env 文件不存在，请先配置！该文件需要包含 privateGitlab, pat, projectId 等字段"),
            );
            return;
        }
        const envFileContent = fs.readFileSync(".gitlab_local_env", { encoding: "utf-8" });
        const { privateGitlab, pat, projectId } = dotenv.parse(envFileContent);
        if (!privateGitlab) {
            console.warn(chalk.yellow("privateGitlab 配置项不存在，请检查！privateGitlab 是私有 gitlab 的访问地址"));
            return;
        }
        if (!pat) {
            console.warn(chalk.yellow("pat 配置项不存在，请检查！pat 是 gitlab 项目的 access token"));
            return;
        }
        if (!projectId) {
            console.warn(chalk.yellow("projectId 配置项不存在，请检查！projectId 是部署仓库的项目 ID"));
            return;
        }
        // 检查是否有 git 仓库
        console.log(chalk.blue("check git repository..."));

        const isGit = isGitRepository();

        console.log(chalk[isGit ? "cyan" : "yellow"](isGit ? "git repository found" : "no git repository found"));

        const { remoteName } = await inquirer.prompt([
            {
                type: "input",
                name: "remoteName",
                message: "请输入远程仓库源名称，默认是 origin，回车代表选择默认",
                default: "origin",
            },
        ]);

        if (isGit) {
            const remoteUrl = getGitRemoteUrl(remoteName);
            if (!remoteUrl) {
                console.error(chalk.yellow("仓库源名称不存在，请检查！"));
                return;
            }
            console.log(chalk.green(`仓库源地址为：${remoteUrl}`));
            const isClean = checkCurrentBranchIsClean();
            if (isClean === null) {
                console.warn(chalk.yellow("当前分支状态检查失败"));
                return;
            }
            if (isClean === false) {
                console.log(
                    chalk.warn(
                        "当前分支存在未提交的代码，请先手动处理后再操作！cicd命令执行前必须保持代码仓库是干净的，你可以单独 clone 项目到一个其他目录作为部署使用，避免和写代码专用的目录冲突！",
                    ),
                );
                return;
            }
            // 决定可以选哪些分支
            const { chooseRange } = await inquirer.prompt([
                {
                    type: "list",
                    name: "chooseRange",
                    message: "确定候选分支，默认只能选择 release 或者 master 开头的分支",
                    choices: [
                        {
                            name: "release 或 master 开头的分支",
                            value: "limited",
                        },
                        {
                            name: "所有分支",
                            value: "all",
                        },
                    ],
                    default: "limited",
                },
            ]);
            // 获取远程分支列表
            const branches = getRemoteBranches({ filter: true, remoteName });
            const branchesWithoutOriginName = branches.map((item) => item.replace(`${remoteName}/`, ""));
            const candidateBranches =
                chooseRange === "limited"
                    ? branchesWithoutOriginName.filter((item) => ["release", "master"].some((name) => item.startsWith(name)))
                    : branchesWithoutOriginName;
            const { targetBranch } = await inquirer.prompt([
                {
                    type: "list",
                    name: "targetBranch",
                    message: "请选择构建部署的目标分支",
                    choices: candidateBranches,
                },
            ]);
            console.log(chalk.green(`你选择了目标分支：${targetBranch}`));
            // 执行临时分支创建操作
            const tempBranchName = `temp-${targetBranch}-${Date.now()}`;
            try {
                execCmdSync(`git fetch ${remoteName} ${targetBranch} && git checkout -b ${tempBranchName} ${remoteName}/${targetBranch}`, {
                    stdio: "inherit",
                });
                // 安装依赖，保证依赖是最新的
                console.log(chalk.green("install dependencies stage..."));
                const { installScript } = await inquirer.prompt([
                    {
                        type: "input",
                        name: "installScript",
                        message: "请输入安装依赖的脚本，默认是 yarn，回车代表选择默认",
                        default: "yarn",
                    },
                ]);
                console.log(chalk.green(`install dependencies: ${installScript}...`));
                execCmdSync(installScript, {
                    stdio: "inherit",
                });
                // 执行构建
                console.log(chalk.green("build stage..."));
                const defaultBuildScript = targetBranch === "release" ? "yarn build:staging" : "yarn build";
                const { buildScript } = await inquirer.prompt([
                    {
                        type: "input",
                        name: "buildScript",
                        message: `请输入构建脚本，${targetBranch} 分支下默认是 ${defaultBuildScript}，回车代表选择默认`,
                        default: defaultBuildScript,
                    },
                ]);
                console.log(chalk.green(`exec build script: ${buildScript}...`));
                execCmdSync(buildScript, {
                    stdio: "inherit",
                });
                // 执行部署
                console.log(chalk.green("deploy stage..."));

                // 查询 remote dist 目录情况
                const spinner = ora(chalk.blue("compare file changes...")).start();
                const remoteDistResources = await getRemoteDistFileList({ privateGitlab, accessToken: pat, projectId });
                const remotePathList = remoteDistResources.filter((item) => item.type === "blob").map((item) => item.path);
                const distPath = path.join(process.cwd(), "dist");
                const localPathList = getAllFiles(distPath);
                const localRelativePathList = localPathList.map((item) => path.relative(process.cwd(), item).replace(/\\/g, "/"));
                // 进行对比
                const results = compareResources(remotePathList, localRelativePathList);
                // 生成 actions 和 commit
                const actions = [];
                if (results.removed.length) {
                    actions.push(
                        ...results.removed.map((item) => ({
                            action: "delete",
                            file_path: item,
                        })),
                    );
                }
                const getFileContentTasks = [];
                const fileContentMap = {};
                if (results.added.length) {
                    getFileContentTasks.push(
                        ...results.added.map((filePath) =>
                            readLocalFileContent(path.join(process.cwd(), filePath)).then((content) => {
                                fileContentMap[filePath] = content;
                                return content;
                            }),
                        ),
                    );
                }
                if (results.modified.length) {
                    getFileContentTasks.push(
                        ...results.modified.map((filePath) =>
                            readLocalFileContent(path.join(process.cwd(), filePath)).then((content) => {
                                fileContentMap[filePath] = content;
                                return content;
                            }),
                        ),
                    );
                }
                await Promise.all(getFileContentTasks);
                if (results.added.length) {
                    actions.push(
                        ...results.added.map((item) => ({
                            action: "create",
                            file_path: item,
                            content: fileContentMap[item],
                        })),
                    );
                }
                if (results.modified.length) {
                    actions.push(
                        ...results.modified.map((item) => ({
                            action: "update",
                            file_path: item,
                            content: fileContentMap[item],
                        })),
                    );
                }
                spinner.succeed(chalk.green("compare file changes finished!"));

                await fse.writeFile(path.join(process.cwd(), ".test"), JSON.stringify(actions, null, 4), { encoding: "utf-8" });

                // // 提交 commit
                spinner.text = "generate commit and submit...";
                spinner.start();
                try {
                    await axios.post(
                        `${privateGitlab}/api/v4/projects/${projectId}/repository/commits`,
                        {
                            branch: targetBranch,
                            commit_message: `${targetBranch} cli 自动提交`,
                            actions,
                        },
                        {
                            transformRequest: (data) => JSON.stringify(data),
                            headers: {
                                "PRIVATE-TOKEN": pat,
                                "content-type": "application/json",
                            },
                        },
                    );
                    spinner.succeed(chalk.green("commit and submit finished!"));
                    console.log(chalk.green("deploy successfully, you can check it in pipelines"));
                } catch (error) {
                    if (error.response) {
                        console.error("Error Response:", error.response); // 错误信息
                    }
                    throw new Error("commit error");
                }
            } finally {
                // 操作完毕后，切换分支，删除临时分支
                execCmdSync(`git checkout ${targetBranch} && git branch -D ${tempBranchName}`, {
                    stdio: "inherit",
                });
            }
        }
    }
    console.log(chalk.yellow("you have cancelled the workflow!"));
};

module.exports = {
    init,
};
