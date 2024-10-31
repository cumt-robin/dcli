const inquirer = require("inquirer").default;
const fse = require("fs-extra");
const chalk = require("chalk");
const ora = require("ora");
const dotenv = require("dotenv");
const path = require("node:path");
const { isGitRepository, getGitRemoteUrl, getRemoteBranches, checkCurrentBranchIsClean } = require("../utils/git");
const { execCmdAsync } = require("../utils/cmd");

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
        if (!fse.existsSync(".gitlab_local_env")) {
            console.warn(chalk.yellow("项目根目录下 .gitlab_local_env 文件不存在，请先配置！该文件需要包含 repo 等字段"));
            return;
        }
        const envFileContent = await fse.readFile(".gitlab_local_env", { encoding: "utf-8" });
        const { sourceRepo, repo } = dotenv.parse(envFileContent);
        if (!sourceRepo) {
            console.warn(
                chalk.yellow(
                    "sourceRepo 配置项不存在，请检查！sourceRepo 是源码仓库的 clone 地址，用于二次校验，防止 dcli 运行在错误的项目下。示例值： https://gitlab.com/xxx/yyy.git",
                ),
            );
            return;
        }
        if (!repo) {
            console.warn(
                chalk.yellow(
                    "repo 配置项不存在，请检查！repo 是部署仓库的 clone 地址，示例 https://oauth2:{pat}@gitlab.com/xxx/yyy.git，其中 {pat} 部分需要替换为你的 access token ",
                ),
            );
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
                message: "请输入源代码远程仓库源名称，默认是 origin，回车代表选择默认",
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
            if (remoteUrl !== sourceRepo) {
                console.warn(chalk.yellow("当前项目仓库源地址和配置文件中的 sourceRepo 不一致，请检查！"));
                return;
            }
            const isClean = checkCurrentBranchIsClean();
            if (isClean === null) {
                console.warn(chalk.yellow("当前分支状态检查失败"));
                return;
            }
            if (isClean === false) {
                console.warn(
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
            try {
                await execCmdAsync(
                    `git fetch ${remoteName} ${targetBranch} && git checkout -b ${tempBranchName} ${remoteName}/${targetBranch}`,
                );
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
                await execCmdAsync(installScript);
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
                await execCmdAsync(buildScript);
                // 执行部署
                console.log(chalk.green("deploy stage..."));
                // 创建临时目录
                const spinner = ora(chalk.blue("creating temp dir...")).start();
                const tempDir = path.join(process.cwd(), ".dcli/cicd/temp");
                if (fse.existsSync(tempDir)) {
                    // 清理旧文件
                    await fse.rm(tempDir, {
                        recursive: true,
                    });
                }
                await fse.ensureDir(tempDir);
                spinner.succeed(chalk.green("temp dir created!"));
                spinner.text = chalk.blue("clone repo...");
                spinner.start();
                await execCmdAsync(`git clone ${repo} ${tempDir}`);
                spinner.succeed(chalk.green("repo cloned!"));
                // 切换分支
                spinner.text = chalk.blue("switching branch...");
                spinner.start();
                await execCmdAsync(`cd ${tempDir} && git checkout ${targetBranch}`);
                spinner.succeed(chalk.green("branch switched!"));
                // dist 目录下的文件移动到临时目录下
                spinner.text = chalk.blue("copying dist to temp dir...");
                spinner.start();
                const repoDistDir = path.join(tempDir, "dist");
                const distDir = path.join(process.cwd(), "dist");
                await fse.copy(distDir, repoDistDir, {
                    overwrite: true,
                });
                spinner.succeed(chalk.green("dist copied!"));
                // 提交 commit
                spinner.text = chalk.blue("generate commit and submit...");
                spinner.start();
                await execCmdAsync(`cd ${repoDistDir} && git add . && git commit -m "committed by dcli cicd" && git push`);
                spinner.succeed(chalk.green("commit finished!"));
                console.log(chalk.green("deploy successfully, you can check it in gitlab repo."));
            } finally {
                // 操作完毕后，切换分支，删除临时分支和目录
                const dcliPath = path.join(process.cwd(), ".dcli");
                const tasks = [execCmdAsync(`git checkout ${targetBranch} && git branch -D ${tempBranchName}`)];
                if (fse.existsSync(dcliPath)) {
                    tasks.push(
                        fse.rm(dcliPath, {
                            recursive: true,
                        }),
                    );
                }
                await Promise.all(tasks);
            }
        }
    } else {
        console.log(chalk.yellow("you have cancelled the workflow!"));
    }
};

module.exports = {
    init,
};
