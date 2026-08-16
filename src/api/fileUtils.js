const fs = require('fs').promises;

async function readFileContent(filePath, encoding = 'utf8') {
    try {
        const data = await fs.readFile(filePath, { encoding });
        return data;
    } catch (err) {
        throw err;
    }
}

module.exports = { readFileContent };
