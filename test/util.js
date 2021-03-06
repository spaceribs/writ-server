'use strict';

/**
 * Supertest doesn't work great with jasmine, so we need to construct
 * a handler that passes in the callback.
 *
 * @param {Function} done - Function to complete test.
 * @returns {Function} Handled supertest error.
 */
function handleSupertest(done) {
    return function(err) {
        if (err) {
            done.fail(err);
        } else {
            done();
        }
    };
}

module.exports = {
    handleSupertest: handleSupertest
};
