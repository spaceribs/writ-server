'use strict';

var successes = require('./app.successes');
var util = require('./app.util');

/**
 * Called when a user makes a GET request to "/".
 * Returns the lobby ID and the collections available.
 *
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 */
function appsGet(req, res) {
    res.json(
        new successes.SuccessMessage('Welcome to Writ.', null, [
            {
                rel: 'self',
                href: util.getUrl(req)
            },
            {
                rel: 'users',
                href: util.getUrl(req, 'user/')
            },
            {
                rel: 'places',
                href: util.getUrl(req, 'place/')
            },
            {
                rel: 'passages',
                href: util.getUrl(req, 'passage/')
            }
        ])
    );
}

module.exports = {
    get: appsGet
};
