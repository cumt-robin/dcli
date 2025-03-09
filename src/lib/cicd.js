const inquirer = require("inquirer").default;
const fse = require("fs-extra");
const chalk = require("chalk");
const ora = require("ora");
const dotenv = require("dotenv");
const path = require("node:path");
const { rimraf } = require("rimraf");
const { isGitRepository, getGitRemoteUrl, getRemoteBranches, checkCurrentBranchIsClean } = require("../utils/git");
const { execCmdAsync } = require("../utils/cmd");

const safeClean = (dir) =>
    rimraf(dir, {
        maxRetries: 5,
        retryDelay: 150,
        preserveRoot: true,
    });

const checkEnvConfig = async (ciMode = false) => {
    console.log(
        chalk.blue(
            "check env config from environment variables and .gitlab_local_env file, the .gitlab_local_env file takes precedence...",
        ),
    );
    const warnInfo = {
        sourceRepo:
            "sourceRepo 配置项不存在，请检查！sourceRepo 是源码仓库的 clone 地址，用于二次校验，防止 dcli 运行在错误的项目下。示例值：https://gitlab.com/xxx/yyy.git",
        repo: "repo 配置项不存在，请检查！repo 是部署仓库的 clone 地址，示例 https://oauth2:{pat}@gitlab.com/xxx/yyy.git，其中 {pat} 部分需要替换为你的 access token ",
        targetBranch: "targetBranch 配置项不存在，请检查！targetBranch 是构建部署的目标分支，示例值：release",
    };
    const requiredKeys = ciMode ? ["sourceRepo", "repo", "targetBranch"] : ["sourceRepo", "repo"];
    const optionalKeys = ciMode
        ? [
              "sourceRepoRemoteName",
              "installScript",
              "buildScript",
              "sourceRepoDistDir",
              "ignoreSourceRepoCheck",
              "ignoreCleanAfterFinished",
              "gitUserEmail",
              "gitUserName",
              "beforeBuildScript",
              "afterBuildScript",
          ]
        : ["gitUserEmail", "gitUserName", "beforeBuildScript", "afterBuildScript"];
    const tip = ciMode
        ? `配置必须包含 ${requiredKeys.join(", ")} 等，可选填 ${optionalKeys.join(", ")}`
        : `配置需要包含 ${requiredKeys.join(", ")}`;
    console.log(chalk.blue(tip));

    const allKeys = [...requiredKeys, ...optionalKeys];
    const config = {};
    allKeys.forEach((key) => {
        config[key] = process.env[key];
    });

    if (fse.existsSync(".gitlab_local_env")) {
        const envFileContent = await fse.readFile(".gitlab_local_env", { encoding: "utf-8" });
        const env = dotenv.parse(envFileContent);
        Object.assign(config, env);
    }

    if (ciMode) {
        if (!config.targetBranch) {
            console.warn(chalk.yellow(warnInfo.targetBranch));
            return Promise.reject(new Error(warnInfo.targetBranch));
        }
    }

    if (!config.sourceRepo && config.ignoreSourceRepoCheck !== "1") {
        console.warn(chalk.yellow(warnInfo.sourceRepo));
        return Promise.reject(new Error(warnInfo.sourceRepo));
    }
    if (!config.repo) {
        console.warn(chalk.yellow(warnInfo.repo));
        return Promise.reject(new Error(warnInfo.sourceRepo));
    }
    return config;
};

const checkIsGitRepo = async () => {
    console.log(chalk.blue("check git repository..."));
    const isGit = isGitRepository();
    if (!isGit) {
        console.warn(chalk.yellow("当前项目不是 git 仓库，请先初始化 git 仓库！"));
        return Promise.reject(new Error("git repository not found"));
    }
    console.log(chalk.green("git repository found"));
    return true;
};

const checkGitRemoteUrl = async (remoteName) => {
    const remoteUrl = getGitRemoteUrl(remoteName);
    if (!remoteUrl) {
        console.warn(chalk.yellow("仓库源名称不存在，请检查！"));
        return Promise.reject(new Error("remote url not found"));
    }
    console.log(chalk.green(`仓库源地址为：${remoteUrl}`));
    return remoteUrl;
};

const checkIsSameSourceRepo = async (remoteUrl, sourceRepo) => {
    if (remoteUrl !== sourceRepo) {
        console.warn(chalk.yellow("当前项目仓库源地址和配置文件中的 sourceRepo 不一致，请检查！"));
        return Promise.reject(new Error("source repo not match"));
    }
};

const checkBranchIsClean = async () => {
    const isClean = checkCurrentBranchIsClean();
    if (isClean === null) {
        console.warn(chalk.yellow("当前分支状态检查失败"));
        return Promise.reject(new Error("branch status check failed"));
    }
    if (isClean === false) {
        console.warn(
            chalk.yellow(
                "当前分支存在未提交的代码，请先手动处理后再操作！cicd命令执行前必须保持代码仓库是干净的，你可以单独 clone 项目到一个其他目录作为部署使用，避免和写代码专用的目录冲突！",
            ),
        );
        return Promise.reject(new Error("branch is not clean"));
    }
};

const getTempBranchName = (targetBranch) => `temp-${targetBranch}-${Date.now()}`;

const execDeploy = async ({ targetBranch, repo, sourceRepoDistDir, gitUserEmail, gitUserName }) => {
    console.log(chalk.green("deploy stage..."));
    // 创建临时目录
    const spinner = ora(chalk.blue("creating temp dir...")).start();
    const tempDir = path.join(process.cwd(), ".dcli/cicd/temp");
    if (fse.existsSync(tempDir)) {
        // 清理旧文件
        await safeClean(tempDir);
    }
    await fse.ensureDir(tempDir);
    spinner.succeed(chalk.green("temp dir created!"));
    spinner.text = chalk.blue("clone repo...");
    spinner.start();
    await execCmdAsync(`git clone --depth=1 --branch ${targetBranch} ${repo} ${tempDir}`);
    spinner.succeed(chalk.green("repo cloned!"));
    const repoDistDir = path.join(tempDir, "dist");
    // 清空部署仓库的 dist 目录，防止越来越多 hash 文件
    await safeClean(repoDistDir);
    // 复制 dist 目录到部署仓库
    const distDir = path.join(process.cwd(), sourceRepoDistDir);
    // dist 目录下的文件移动到临时目录下
    spinner.text = chalk.blue("copying dist to temp dir...");
    spinner.start();
    await fse.copy(distDir, repoDistDir, {
        overwrite: true,
    });
    spinner.succeed(chalk.green("dist copied!"));
    // 提交 commit
    spinner.text = chalk.blue("generate commit and submit...");
    spinner.start();
    await execCmdAsync(
        `cd ${tempDir} && git config user.email "${gitUserEmail || "cicdbot@dcli.bindev"}" && git config user.name "${gitUserName || "cicdbot"}" && git add dist && git commit -m "committed by dcli cicd" && git push`,
    );
    spinner.succeed(chalk.green("commit finished!"));
    console.log(chalk.green("deploy successfully, you can check it in gitlab repo."));
};

const execCleanWork = async (targetBranch, tempBranchName) => {
    // 操作完毕后，切换分支，删除临时分支和目录
    const dcliPath = path.join(process.cwd(), ".dcli");
    const tasks = [execCmdAsync(`git checkout ${targetBranch} && git branch -D ${tempBranchName}`)];
    if (fse.existsSync(dcliPath)) {
        tasks.push(safeClean(dcliPath));
    }
    await Promise.all(tasks);
    // 拉取当前分支最新代码，不等待
    execCmdAsync("git pull");
};

const execCiMode = async () => {
    // 进入 ci 模式
    console.log(chalk.green("start to execute cicd workflow in ci mode!"));
    // 检查环境变量文件
    const {
        sourceRepo,
        repo,
        targetBranch,
        sourceRepoRemoteName = "origin",
        installScript = "yarn",
        buildScript,
        sourceRepoDistDir = "dist",
        ignoreSourceRepoCheck = "0",
        ignoreCleanAfterFinished = "0",
        gitUserEmail,
        gitUserName,
        beforeBuildScript,
        afterBuildScript,
    } = await checkEnvConfig(true);

    const remoteUrl = await checkGitRemoteUrl(sourceRepoRemoteName);

    if (ignoreSourceRepoCheck !== "1") {
        // 在 ci 模式下，可以忽略 sourceRepo 的校验
        await checkIsSameSourceRepo(remoteUrl, sourceRepo);
    }

    await checkBranchIsClean();

    console.log(chalk.green(`即将在目标分支 ${targetBranch} 下执行 cicd workflow!`));

    const tempBranchName = getTempBranchName(targetBranch);

    try {
        await execCmdAsync(
            `git fetch ${sourceRepoRemoteName} ${targetBranch} && git checkout -b ${tempBranchName} ${sourceRepoRemoteName}/${targetBranch}`,
        );
        console.log(chalk.green("install dependencies stage..."));
        console.log(chalk.green(`install script: ${installScript}...`));
        await execCmdAsync(installScript);
        console.log(chalk.green("build stage..."));
        // beforeBuild
        if (beforeBuildScript) {
            console.log(chalk.green(`exec before build script: ${beforeBuildScript}...`));
            await execCmdAsync(beforeBuildScript);
        }
        const execBuildScript = buildScript || (targetBranch === "release" ? "yarn build:staging" : "yarn build");
        console.log(chalk.green(`exec build script: ${execBuildScript}...`));
        await execCmdAsync(execBuildScript);
        // afterBuild
        if (afterBuildScript) {
            console.log(chalk.green(`exec after build script: ${afterBuildScript}...`));
            await execCmdAsync(afterBuildScript);
        }
        // 执行部署
        await execDeploy({ targetBranch, repo, sourceRepoDistDir, gitUserEmail, gitUserName });
    } finally {
        if (ignoreCleanAfterFinished !== "1") {
            execCleanWork(targetBranch, tempBranchName);
        }
    }
};

const execInteractiveMode = async () => {
    // 进入交互模式
    console.log(chalk.green("start to execute cicd workflow in interactive mode!"));
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
        await checkIsGitRepo();

        // 检查配置文件
        const { sourceRepo, repo, gitUserEmail, gitUserName } = await checkEnvConfig();

        const { remoteName } = await inquirer.prompt([
            {
                type: "input",
                name: "remoteName",
                message: "请输入源代码远程仓库源名称，默认是 origin，回车代表选择默认",
                default: "origin",
            },
        ]);

        const remoteUrl = await checkGitRemoteUrl(remoteName);

        await checkIsSameSourceRepo(remoteUrl, sourceRepo);

        await checkBranchIsClean();

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
        const tempBranchName = getTempBranchName(targetBranch);
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
            // beforeBuild
            const { beforeBuildScript } = await inquirer.prompt([
                {
                    type: "input",
                    name: "beforeBuildScript",
                    message: "请输入构建前需要执行的脚本，回车代表不执行",
                },
            ]);
            if (beforeBuildScript) {
                console.log(chalk.green(`exec before build script: ${beforeBuildScript}...`));
                await execCmdAsync(beforeBuildScript);
            }
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
            // afterBuild
            const { afterBuildScript } = await inquirer.prompt([
                {
                    type: "input",
                    name: "afterBuildScript",
                    message: "请输入构建后需要执行的脚本，回车代表不执行",
                },
            ]);
            if (afterBuildScript) {
                console.log(chalk.green(`exec after build script: ${afterBuildScript}...`));
                await execCmdAsync(afterBuildScript);
            }
            // 执行部署
            const { sourceRepoDistDir } = await inquirer.prompt([
                {
                    type: "input",
                    name: "sourceRepoDistDir",
                    message: `请输入构建产物目录，默认是 dist，回车代表选择默认。选择后会执行部署操作！`,
                    default: "dist",
                },
            ]);
            await execDeploy({ targetBranch, repo, sourceRepoDistDir, gitUserEmail, gitUserName });
        } finally {
            execCleanWork(targetBranch, tempBranchName);
        }
    } else {
        console.log(chalk.yellow("you have cancelled the workflow!"));
    }
};

const init = async (options = {}) => {
    const { ciMode } = options;

    if (ciMode) {
        await execCiMode();
        return;
    }

    await execInteractiveMode();
};

module.exports = {
    init,
};
