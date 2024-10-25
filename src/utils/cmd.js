const { execSync } = require("child_process");

function execCmdSync(command, options = { stdio: "ignore" }) {
    execSync(command, options);
}

module.exports = {
    execCmdSync,
};
