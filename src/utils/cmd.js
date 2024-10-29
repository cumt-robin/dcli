const { execSync, exec } = require("child_process");

function execCmdSync(command, options = { stdio: "ignore" }) {
    execSync(command, options);
}

function execCmdAsync(command) {
    return new Promise((resolve, reject) => {
        const child = exec(command, (error, stdout, stderr) => {
            if (error) {
                reject({ error, stdout, stderr });
                return;
            }
            resolve({ stdout, stderr });
        });

        child.stdout.on("data", (data) => {
            process.stdout.write(data);
        });

        child.stderr.on("data", (data) => {
            process.stderr.write(data);
        });

        child.on("close", (code) => {
            if (code !== 0) {
                console.error(`子进程退出码：${code}`);
            }
        });
    });
}

module.exports = {
    execCmdSync,
    execCmdAsync,
};
