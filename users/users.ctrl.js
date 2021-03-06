'use strict';

var uuid = require('node-uuid');
var _ = require('lodash');
var tv4 = require('tv4');

var models = require('../models');
var roles = require('../roles');
var errors = require('../app/app.errors');
var util = require('../app/app.util');
var SuccessMessage = require('../app/app.successes').SuccessMessage;
var Users = require('../users/users.db');
var mail = require('../mail/mail.ctrl');

for (var i = 0; i < models.refs.length; i++) {
    tv4.addSchema(models.refs[i]);
}

/**
 * Passport uses this to validate provided credentials.
 *
 * @param {string} email - Email address to look for.
 * @param {string} password - Password to verify against.
 * @param {function} cb - Callback for the check
 */
function loginStrategy(email, password, cb) {

    Users.createIndex({
        'index': {
            'fields': ['email']
        }
    }).then(function() {
        return Users.find({
            selector: {email: email},
            limit: 1
        });

    }).then(function(users) {

        if (!users.docs.length) {
            throw new errors.LoginError();
        }

        var user = users.docs[0];
        var passwordMatch = util.checkPassword(password, user.salt, user.hash);

        if (!passwordMatch) {
            throw new errors.LoginError();
        }

        return user;

    }).then(function(user) {

        return cb(null, user);

    }).catch(function(err) {

        return cb(err);

    });

}

/**
 * Called when a user makes an OPTIONS request to /user/.
 * Returns the json-schema used to validate/update users.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Callback for the response.
 */
function usersOptions(req, res, next) {
    if (req.accepts('json')) {
        res.json(models.io.user);
    } else {
        next();
    }
}

/**
 * Called when a user makes an GET request to /user/.
 * Returns the currently logged in user.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
function usersGet(req, res) {

    var filtered = util.dbFilter(
        req.user.permission, 'user', req.user, false, true);

    res.json(new SuccessMessage(
        'Your credentials are valid.', filtered, [{
            rel: 'self',
            href: util.getUrl(req)
        }]));
}

/**
 * Called to create a new user.
 *
 * @param {object} userData - Options for new users.
 * @param {Request} req - Express response object.
 * @param {Response} res - Express response object.
 * @param {function} next - Callback for the response.
 */
function createUser(userData, req, res, next) {

    var validation = tv4.validateMultiple(userData, models.io.user);

    if (!validation.valid) {
        next(new errors.JsonSchemaValidationError(
            validation.errors, validation.missing));
        return false;
    }

    util.processPassword(userData);

    Users.createIndex({
        'index': {
            'fields': ['email']
        }
    }).then(function() {
        return Users.find({
            selector: {email: userData.email},
            limit: 1
        }).then(function(result) {
            if (result.docs.length) {
                throw new errors.EmailInUseError(
                    'This email address is already in use ' +
                    'by another account.',
                    userData.email
                );
            }
        });

    }).then(function() {

        //TODO: This is very verbose, should be done using ioFilter eventually
        userData.secret = uuid.v4();
        userData.id = uuid.v4();
        userData._id = 'user/' + userData.id;
        userData.created = new Date().toISOString();
        userData.updated = new Date().toISOString();
        userData.permission = roles.unverified;

        return Users.put(userData);

    }).then(function() {

        var config = require('../config.json');
        var verifyUrl = config.hostname + '/verify/' + userData.secret;
        var message = util.tokenEmail(config.from, userData.email, verifyUrl);

        return mail.send(message);

    }).then(function() {

        res.json(new SuccessMessage(
            'Please check your email to ' +
            'verify your account.', {
                id   : userData.id,
                email: userData.email
            }, [{
                rel: 'self',
                href: util.getUrl(req)
            }, {
                rel: 'created',
                href: util.getUrl(req, userData._id)
            }]));

    }).catch(function(err) {
        next(err);
    });

}

/**
 * Called when a user makes an POST request to /user/.
 * Creates a new user or updates the currently logged in user.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Callback for the response.
 */
function usersPost(req, res, next) {

    var userData = util.ioFilter(
        req.user.permission, 'user', req.body, true, true);

    if (req.user.anonymous) {
        createUser(userData, req, res, next);
    } else {
        updateUser(req.user.id, userData, req, res, next);
    }

}

/**
 * Called when a user makes a GET request to /user/list/.
 * List of all users. Admin only.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
function usersList(req, res) {

    Users.allDocs({
        startkey    : 'user/',
        endkey      : 'user/\uffff',
        include_docs: true
    }).then(function(results) {
        for (var i = 0; i < results.rows.length; i++) {
            var row = results.rows[i];
            results.rows[i].doc = util.ioFilter(
                req.user.permission, 'user', row.doc);
        }
        return results;

    }).then(function(results) {
        res.json(results);

    });
}

/**
 * Called when a user makes a GET request to /user/{some-uuid}/.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Callback for the response.
 */
function userGet(req, res, next) {

    var userId = req.params.userId;
    Users.get('user/' + userId)
        .then(function(result) {
            var filtered = util.dbFilter(
                req.user.permission, 'user', result, false, false);
            res.json(new SuccessMessage(
                'User found.', filtered, [{
                    rel: 'self',
                    href: util.getUrl(req)
                }]));
        }).catch(function() {
            next(new errors.UserNotFoundError());
        });
}

/**
 * Update the specified user by their unique ID.
 *
 * @param {string} userId - The user to update.
 * @param {object} userData - The new user data.
 * @param {Request} req - The user making changes.
 * @param {Response} res - The response call.
 * @param {function} next - The error callback.
 */
function updateUser(userId, userData, req, res, next) {

    var newUserData;

    if (userData.password) {
        util.processPassword(userData);
    }

    Users.createIndex({
        'index': {
            'fields': ['email']
        }
    }).then(function() {
        if (userData.email) {
            userData.secret = uuid.v4();
            userData.permission = 30;

            return Users.find({
                selector: {email: userData.email},
                limit: 1
            }).then(function(result) {
                if (result.docs.length && result.docs[0].id !== userId) {
                    throw new errors.EmailInUseError(
                        'This email address is already ' +
                        'in use by another account.',
                        userData.email
                    );
                }
            });
        }

    }).then(function() {
        return Users.get('user/' + userId);

    }).then(function(result) {
        newUserData = _.extend({}, result, userData);
        newUserData.updated = new Date().toISOString();

        var validate = tv4.validateMultiple(newUserData, models.db.user);

        if (validate.valid) {
            return Users.put(newUserData);
        } else {
            throw new errors.JsonSchemaValidationError(
                validate.errors, validate.missing
            );
        }

    }).then(function() {
        if (userData.email) {

            var config = require('../config.json');
            var verifyUrl = config.hostname + '/verify/' + userData.secret;
            var message = util.tokenEmail(
                config.from, userData.email, verifyUrl);

            return mail.send(message);

        } else {
            return true;
        }

    })
    .then(function() {
        var userInfo = util.ioFilter(
            req.user.permission, 'user',
            newUserData, false, req.user.id === newUserData.id);

        var message = 'User has been successfully updated.';

        if (userData.email) {
            message = 'User has been updated, and an ' +
                'email has been sent to the new address.';
        }

        res.json(new SuccessMessage(message, userInfo, [{
            rel: 'self',
            href: util.getUrl(req)
        }]));

    })
    .catch(function(err) {
        next(err);
    });
}

/**
 * Called when a user makes a POST request to /user/{some-uuid}/.
 *
 * @param {object} req - Express request object.
 * @param {Response} res - Express response object.
 * @param {function} next - Callback for the response.
 */
function userPost(req, res, next) {

    var userId = req.params.userId;
    var userData = util.ioFilter(
        req.user.permission, 'user', req.body, true, false);

    if (userData.password) {
        util.processPassword(userData);
    }

    if (userData.email) {
        userData.secret = uuid.v4();
        userData.permission = 30;
    }

    updateUser(userId, userData, req, res, next);

}

/**
 * Called when a user makes a DELETE request to /user/{some-uuid}/.
 * Deletes a specific user.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Callback for the response.
 */
function userDelete(req, res, next) {
    var userId = req.params.userId;

    Users.get('user/' + userId).then(function(doc) {
        return Users.remove(doc);

    }).then(function() {
        res.json(new SuccessMessage(
            'User has been deleted.', undefined, [{
                rel: 'self',
                href: util.getUrl(req)
            }]));

    }).catch(function(err) {
        next({
            status: 'DATABASE_ERROR',
            message: err.message
        });

    });
}

/**
 * Called when a user makes a GET request to /verify/{token}/.
 * This is used to verify their email address with their account.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Callback for the response.
 */
function userVerify(req, res, next) {

    Users.createIndex({
        'index': {
            'fields': ['secret']
        }
    }).then(function() {
        return Users.find({
            selector: {secret: req.params.token},
            limit: 1
        });

    }).then(function(results) {
        if (!results.docs.length) {
            throw new errors.EmailTokenNotFoundError(
                'This token was not found.',
                req.params.token
            );
        } else {
            return results.docs[0];
        }

    }).then(function(user) {
        user.permission = Math.min(20, user.permission);
        user.updated = new Date().toISOString();

        var validate = tv4.validateMultiple(user, models.db.user);

        if (validate.valid) {
            return Users.put(user);
        } else {
            throw new errors.JsonSchemaValidationError(
                validate.errors, validate.missing
            );
        }

    }).then(function(user) {
        res.json(new SuccessMessage('Your email has been verified.', undefined, [{
            rel: 'self',
            href: util.getUrl(req)
        }, {
            rel: 'verified',
            href: util.getUrl(req, user.id)
        }]));

    }).catch(function(err) {
        next(err);

    });
}

module.exports = {
    strategy: loginStrategy,
    users   : {
        options: usersOptions,
        get    : usersGet,
        post   : usersPost,
        list   : usersList
    },
    user    : {
        get   : userGet,
        post  : userPost,
        delete: userDelete,
        verify: userVerify
    }
};
