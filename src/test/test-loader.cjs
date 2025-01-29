const Mocha = require('mocha');
const path = require('path');

async function run() {
    // Create the mocha test
    const mocha = new Mocha({
        ui: 'bdd',
        color: true,
        timeout: 60000
    });

    const testsRoot = path.resolve(__dirname, '../../out/test');

    // Add files to the test suite
    mocha.addFile(path.resolve(testsRoot, 'extension.test.js'));

    try {
        // Run the mocha test
        return new Promise((resolve, reject) => {
            // Run the tests
            mocha.run(failures => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        });
    } catch (err) {
        console.error('Failed to run tests:', err);
        throw err;
    }
}

module.exports = { run };
