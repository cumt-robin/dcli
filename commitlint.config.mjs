export default {
    extends: ["@commitlint/config-conventional"],
    /*
     * Any rules defined here will override rules from @commitlint/config-conventional
     */
    rules: {
        "type-enum": [2, "always", ["build", "chore", "ci", "docs", "feat", "fix", "perf", "refactor", "revert", "style", "test"]],
        "subject-case": [0],
    },
    /*
     * Functions that return true if commitlint should ignore the given message.
     */
    ignores: [(commit) => commit === ""],
    /*
     * Whether commitlint uses the default ignore rules.
     */
    defaultIgnores: true,
    /*
     * Custom URL to show upon failure
     */
    helpUrl: "https://github.com/conventional-changelog/commitlint/#what-is-commitlint",
    /*
     * Custom prompt configs
     */
    prompt: {
        messages: {},
        questions: {
            type: {
                description: "please input type:",
            },
        },
    },
};
