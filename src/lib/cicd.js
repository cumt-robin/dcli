const inquirer = require("inquirer").default;
const chalk = require("chalk");
const ora = require("ora");
const { isGitRepository, getGitRemoteUrl, getRemoteBranches, checkCurrentBranchIsClean } = require("../utils/git");
const { execCmdSync } = require("../utils/cmd");

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
        // 检查是否有 git 仓库
        const spinner = ora(chalk.blue("check git repository...")).start();

        const isGit = isGitRepository();

        spinner.stopAndPersist({
            text: chalk[isGit ? "cyan" : "yellow"](isGit ? "git repository found" : "no git repository found"),
        });

        const { remoteName } = await inquirer.prompt([
            {
                type: "input",
                name: "remoteName",
                message: "请输入远程仓库源名称，默认是 origin，可回车跳过",
                default: "origin",
            },
        ]);

        if (isGit) {
            const remoteUrl = getGitRemoteUrl(remoteName);
            if (!remoteUrl) {
                console.log(chalk.yellow("仓库源名称不存在，请检查！"));
                return;
            }
            console.log(chalk.green(`仓库源地址为：${remoteUrl}`));
            const isClean = checkCurrentBranchIsClean();
            if (isClean === null) {
                console.log(chalk.yellow("当前分支状态检查失败"));
                return;
            }
            if (isClean === false) {
                console.log(
                    chalk.yellow(
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
            execCmdSync(`git fetch ${remoteName} ${targetBranch} && git checkout -b ${tempBranchName} ${remoteName}/${targetBranch}`, {
                stdio: "inherit",
            });
            // 安装依赖，保证依赖是最新的
            console.log(chalk.green("install dependencies stage..."));
            const { installScript } = await inquirer.prompt([
                {
                    type: "input",
                    name: "installScript",
                    message: "请输入安装依赖的脚本，默认是 yarn，可回车跳过",
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
                    message: `请输入构建脚本，${targetBranch} 分支下默认是 ${defaultBuildScript}，可回车跳过`,
                    default: defaultBuildScript,
                },
            ]);
            console.log(chalk.green(`exec build script: ${buildScript}...`));
            execCmdSync(buildScript, {
                stdio: "inherit",
            });
            // 执行部署
            console.log(chalk.green("deploy stage..."));
            // 操作完毕后，切换分支，删除临时分支
            execCmdSync(`git checkout ${targetBranch} && git branch -D ${tempBranchName}`, {
                stdio: "inherit",
            });
        }
    } else {
        console.log(chalk.yellow("you have cancelled the workflow!"));
    }
};

module.exports = {
    init,
};
