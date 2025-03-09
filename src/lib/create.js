const inquirer = require("inquirer").default;
const axios = require("axios");
const ora = require("ora");
const fse = require("fs-extra");
const path = require("path");
const { downloadGithubRepoDir } = require("../utils/github");
const { base64Decode } = require("../utils/string");
const mustache = require("mustache");
const { getTempPath } = require("../utils/path");
const { rimraf } = require("rimraf");
const { execCmdAsync } = require("../utils/cmd");

const githubUsername = "cumt-robin";
const githubRepo = "templates";
const branch = "main";

const replaceProjectFiles = async (projectConfig, templateTempPath) => {
    const runtimeVars = {
        currentYear: new Date().getFullYear(),
    };

    const { globalVars, templateFiles } = projectConfig;

    const presetVars = [...globalVars];

    templateFiles.forEach((file) => {
        const { vars = [] } = file;
        vars.forEach((varItem) => {
            const exists = presetVars.find((item) => item.name === varItem.name);
            if (!exists) {
                presetVars.push(varItem);
            }
        });
    });

    const tplVars = await inquirer.prompt(
        presetVars.map((varItem) => {
            return {
                type: "input",
                name: varItem.name,
                message: varItem.description,
                default: varItem.default,
            };
        }),
    );

    const allVars = { ...tplVars, ...runtimeVars };

    await Promise.all(
        templateFiles.map((file) => {
            return new Promise((resolve, reject) => {
                const { path: filePath } = file;
                const fileFullPath = path.join(templateTempPath, filePath);
                fse.readFile(fileFullPath, "utf-8")
                    .then((fileContent) => {
                        const renderedContent = mustache.render(fileContent, allVars);
                        return fse.writeFile(fileFullPath, renderedContent);
                    })
                    .then(resolve)
                    .catch(reject);
            });
        }),
    );

    return allVars;
};

const create = async () => {
    const spinner = ora("获取模板列表...").start();
    // 从 github 模板仓库的 main 分支 manifest 文件获取模板列表
    const manifestUrl = `https://api.github.com/repos/${githubUsername}/${githubRepo}/contents/manifest.json`;

    const manifestResponse = await axios.get(manifestUrl);

    const { content } = manifestResponse.data;
    const manifestJson = base64Decode(content);
    const manifest = JSON.parse(manifestJson);

    spinner.succeed("获取模板列表成功");

    // 选择模板
    const { template } = await inquirer.prompt([
        {
            type: "list",
            name: "template",
            message: "请选择模板",
            choices: manifest.list.map((item) => ({
                name: item.title,
                value: item.name,
            })),
        },
    ]);
    spinner.succeed(`您选择了模板: ${template}`);

    spinner.start("开始下载模板...");
    // 根据选择的模板进行下载
    const templateTempPath = getTempPath();
    await downloadGithubRepoDir({
        userName: githubUsername,
        repoName: githubRepo,
        branch,
        dir: `packages/${template}`,
        outputPath: templateTempPath,
    });
    spinner.succeed("模板下载成功");
    // 模板变量替换
    // 从 manifest.json 中找到对应项目的所有变量
    const projectConfig = manifest.list.find((item) => item.name === template);
    const { name } = await replaceProjectFiles(projectConfig, templateTempPath);
    // 复制到项目名称对应的目录
    const projectOutputPath = path.join(process.cwd(), name);
    await fse.copy(templateTempPath, projectOutputPath);
    await rimraf(templateTempPath);
    spinner.succeed("项目创建成功");
    // 执行 pnpm install
    spinner.start("进入项目目录并安装依赖...");
    await execCmdAsync(`cd ${projectOutputPath} && pnpm install`);
    spinner.succeed("依赖安装成功");
};

module.exports = {
    create,
};
