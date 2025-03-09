const base64Encode = (str) => {
    return Buffer.from(str).toString("base64");
};

const base64Decode = (str) => {
    return Buffer.from(str, "base64").toString("utf-8");
};

module.exports = {
    base64Encode,
    base64Decode,
};
