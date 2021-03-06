'use strict';

var jsf = require('json-schema-faker');
var models = require('../models');
var mocks = require('../app/app.mock');
var uuid = require('node-uuid');
var util = require('../app/app.util');
var errors = require('../app/app.errors');
var SuccessMessage = require('../app/app.successes').SuccessMessage;

var Users = require('../users/users.db.mock');

describe('Users', function() {

    var newUser;

    var users;
    var ctrl;
    var mail;

    var req;
    var res;
    var callback;

    var anonymousUser = {
        name: 'Anonymous User',
        permission: 100,
        anonymous: true
    };

    beforeAll(mocks.enable);
    afterAll(mocks.disable);

    beforeAll(function() {
        mail = require('../mail/mail.ctrl');
        ctrl = require('./users.ctrl');
    });

    beforeEach(
        /**
         * Initialize request, response and callbacks for the Express
         * controllers we'll be testing.
         */
        function expressSetup() {

            req = {
                user: anonymousUser,
                accepts: jasmine.createSpy('accepts'),
                get: function() {
                    return 'localhost:1234';
                }
            };

            res = {
                json: jasmine.createSpy('json')
            };

            callback = jasmine.createSpy('callback');

            /*eslint-disable */
            /* istanbul ignore next */
            res.json.and.callFake(function(response) {
                console.error('UNEXPECTED RESPONSE: \n', response);
            });

            /* istanbul ignore next */
            callback.and.callFake(function(err) {
                console.error('UNEXPECTED ERROR: \n', err);
            });
            /*eslint-enable */

        }
    );

    beforeEach(
        /**
         * For each test, create a new set of all users that
         * could be used in these tests. Also create a fake brand new user.
         *
         * @param {function} done - Called when all users have been set up.
         */
        function userSetup(done) {

            newUser = jsf(models.io.user, models.refs);

            Users.mockUsers().then(function(mockUsers) {
                users = mockUsers;
            }).then(done);

        }
    );

    afterEach(function(done) {
        Users.erase().then(done);
    });

    describe('Controller', function() {

        afterEach(function() {
            mail.testError = false;
        });

        describe('usersOptions()', function() {

            it('returns a json-schema when requesting options.', function(done) {
                req.accepts.and.returnValue(true);

                res.json.and.callFake(function(response) {
                    expect(req.accepts).toHaveBeenCalled();
                    expect(req.accepts).toHaveBeenCalledWith('json');
                    expect(response)
                        .toEqual(models.io.user);
                    done();
                });

                ctrl.users.options(req, res, callback);
            });

            it('passes through if json isn\'t accepted.', function(done) {
                req.accepts.and.returnValue(false);

                callback.and.callFake(function(response) {
                    expect(req.accepts).toHaveBeenCalled();
                    expect(res.json).not.toHaveBeenCalled();
                    expect(response).toBeUndefined();
                    done();
                });

                ctrl.users.options(req, res, callback);
            });

        });

        describe('usersGet()', function() {

            it('returns the decorated profile of the current user.',
            function(done) {
                req.user = users.verifiedUser;

                res.json.and.callFake(function(response) {
                    expect(callback).not.toHaveBeenCalled();
                    expect(response)
                        .toEqual(new SuccessMessage('Your credentials are valid.', {
                            id: users.verifiedUser.id,
                            email: users.verifiedUser.email,
                            name: users.verifiedUser.name,
                            permission: users.verifiedUser.permission
                        }, [{
                            rel: 'self',
                            href: util.getUrl(req)
                        }]));
                    done();
                });

                ctrl.users.get(req, res);
            });

        });

        describe('usersPost()', function() {

            beforeEach(function() {
                req.body = newUser;
            });

            it('creates a new user with the post body.', function(done) {
                res.json.and.callFake(function() {
                    expect(res.json).toHaveBeenCalled();
                    expect(res.json.calls.mostRecent().args[0])
                        .toEqual(new SuccessMessage(
                            'Please check your email to ' +
                            'verify your account.', {
                                id   : jasmine.any(String),
                                email: newUser.email
                            }, [{
                                rel: 'self',
                                href: util.getUrl(req)
                            }, {
                                rel: 'created',
                                href: jasmine.any(String)
                            }]));
                    done();
                });

                ctrl.users.post(req, res, callback);
            });

            it('updates an existing user with a new name.', function(done) {
                res.json.and.callFake(function() {
                    expect(res.json).toHaveBeenCalled();
                    expect(res.json.calls.mostRecent().args[0])
                        .toEqual(new SuccessMessage(
                            'User has been successfully updated.', {
                                email: users.verifiedUser.email,
                                name: newUser.name,
                                permission: 20
                            }, [{
                                rel: 'self',
                                href: util.getUrl(req)
                            }]));
                    done();
                });

                req.user = users.verifiedUser;
                req.body = {name: newUser.name};
                ctrl.users.post(req, res, callback);
            });

            it('updates an existing user with a new email.', function(done) {
                res.json.and.callFake(function() {
                    expect(res.json).toHaveBeenCalled();
                    expect(res.json.calls.mostRecent().args[0])
                        .toEqual(new SuccessMessage(
                            'User has been updated, and an email ' +
                            'has been sent to the new address.', {
                                email: newUser.email,
                                name: users.verifiedUser.name,
                                permission: 30
                            }, [{
                                rel: 'self',
                                href: util.getUrl(req)
                            }]));
                    done();
                });

                req.user = users.verifiedUser;
                req.body = {email: newUser.email};
                ctrl.users.post(req, res, callback);
            });

            it('updates an existing user with a new password.', function(done) {
                res.json.and.callFake(function(response) {
                    expect(res.json).toHaveBeenCalled();
                    expect(response)
                        .toEqual(new SuccessMessage(
                            'User has been successfully updated.', {
                                email: users.verifiedUser.email,
                                name: users.verifiedUser.name,
                                permission: 20
                            }, [{
                                rel: 'self',
                                href: util.getUrl(req)
                            }]));
                    done();
                });

                req.user = users.verifiedUser;
                req.body = {password: newUser.password};

                ctrl.users.post(req, res, callback);
            });

            it('throws an error if sending an email failed.', function(done) {
                callback.and.callFake(function(err) {
                    expect(err).toEqual(jasmine.any(Error));
                    done();
                });

                mail.testError = true;
                ctrl.users.post(req, res, callback);
            });

            it('checks if the email already exists before creating a new user.',
            function(done) {

                callback.and.callFake(function(err) {
                    expect(err).toEqual(jasmine.any(errors.EmailInUseError));
                    done();
                });

                res.json.and.callFake(function() {
                    ctrl.users.post(req, res, callback);
                });

                ctrl.users.post(req, res, callback);
            });

            it('checks if the user schema is valid.',
            function(done) {

                callback.and.callFake(function(err) {
                    expect(err).toEqual(
                            jasmine.any(errors.JsonSchemaValidationError));
                    expect(err.errors[0].message)
                            .toBe('Invalid type: number (expected string)');
                    done();
                });

                req.body.name = 12;
                ctrl.users.post(req, res, callback);

            });

            it('checks if the user is valid before updating.',
            function(done) {

                callback.and.callFake(function(err) {
                    expect(err).toEqual(
                        jasmine.any(errors.JsonSchemaValidationError));
                    expect(err.errors[0].message)
                        .toBe('Additional properties not allowed');
                    done();
                });

                req.user = users.invalidUser;
                req.body = {name: newUser.name};
                ctrl.users.post(req, res, callback);

            });

        });

        describe('usersList()', function() {

            it('returns an array of users.', function(done) {

                res.json.and.callFake(function(options) {
                    expect(options).toEqual({
                        total_rows: jasmine.any(Number),
                        offset    : jasmine.any(Number),
                        rows      : jasmine.any(Array)
                    });
                    done();
                });

                ctrl.users.list(req, res, callback);

            });

        });

        describe('userGet()', function() {

            beforeEach(function() {
                req.params = {
                    userId: users.verifiedUser.id
                };
            });

            it('gets a user by their id.', function(done) {

                res.json.and.callFake(function(response) {
                    expect(response).toEqual(jasmine.any(SuccessMessage));
                    done();
                });

                ctrl.user.get(req, res, callback);
            });

            it('returns a 404 error if no user exists.', function(done) {

                callback.and.callFake(function() {
                    expect(callback).toHaveBeenCalled();
                    expect(callback.calls.mostRecent().args[0])
                        .toEqual(jasmine.any(errors.UserNotFoundError));
                    done();
                });

                req.params.userId = uuid.v4();
                ctrl.user.get(req, res, callback);
            });

            it('returns more information if you are an admin.', function(done) {

                res.json.and.callFake(function(response) {
                    expect(response)
                        .toEqual(jasmine.any(SuccessMessage));
                    expect(response.data.email)
                        .toEqual(users.verifiedUser.email);
                    done();
                });

                req.user = users.adminUser;
                ctrl.user.get(req, res, callback);

            });

        });

        describe('userPost()', function() {

            beforeEach(function initRequest() {
                req.user = users.adminUser;
                req.params = {
                    userId: users.verifiedUser.id
                };
                req.body = {};
            });

            it('returns a 404 error if no user exists.', function(done) {

                callback.and.callFake(function() {
                    expect(callback).toHaveBeenCalled();
                    expect(callback.calls.mostRecent().args[0])
                        .toEqual(jasmine.any(errors.UserNotFoundError));
                    done();
                });

                req.params.userId = uuid.v4();
                ctrl.user.get(req, res, callback);
            });

            it('updates basic user information.', function(done) {

                res.json.and.callFake(function(response) {
                    expect(response).toEqual(new SuccessMessage(
                        'User has been successfully updated.', {
                            email: users.verifiedUser.email,
                            name: newUser.name,
                            permission: 20
                        }, [{
                            rel: 'self',
                            href: util.getUrl(req)
                        }]));
                    done();

                });

                req.body.name = newUser.name;
                ctrl.user.post(req, res, callback);

            });

            it('doesn\'t update a user if their email is already ' +
            'associated with another account.', function(done) {

                callback.and.callFake(function() {
                    expect(callback).toHaveBeenCalled();
                    expect(callback.calls.mostRecent().args[0])
                        .toEqual(jasmine.any(errors.EmailInUseError));
                    done();
                });

                req.body.email = users.unverifiedUser.email;
                ctrl.user.post(req, res, callback);

            });

            it('updates a users email.', function(done) {

                res.json.and.callFake(function(response) {
                    expect(response).toEqual(new SuccessMessage(
                        'User has been updated, and an ' +
                        'email has been sent to the new address.', {
                            email: newUser.email,
                            name: users.verifiedUser.name,
                            permission: 30
                        }, [{
                            rel: 'self',
                            href: util.getUrl(req)
                        }]));
                    done();
                });

                req.body.email = newUser.email;
                ctrl.user.post(req, res, callback);

            });

            it('updates a users password.', function(done) {

                res.json.and.callFake(function(response) {
                    expect(response).toEqual(new SuccessMessage(
                        'User has been successfully updated.', {
                            email: users.verifiedUser.email,
                            name: users.verifiedUser.name,
                            permission: 20
                        }, [{
                            rel: 'self',
                            href: util.getUrl(req)
                        }]));
                    done();

                });

                req.body.password = newUser.password;
                ctrl.user.post(req, res, callback);

            });

        });

        describe('userDelete()', function() {

            beforeEach(function() {
                req.user = users.adminUser;
                req.params = {};
            });

            it('returns an error if the user doesn\'t exist.', function(done) {
                callback.and.callFake(function(response) {
                    expect(response).toEqual({
                        status: 'DATABASE_ERROR',
                        message: 'missing'
                    });
                    done();
                });

                ctrl.user.delete(req, res, callback);
            });

            it('deletes a user.', function(done) {
                res.json.and.callFake(function(response) {
                    expect(response).toEqual(new SuccessMessage(
                        'User has been deleted.', undefined, [{
                            rel: 'self',
                            href: util.getUrl(req)
                        }]));
                    done();
                });

                req.params.userId = users.verifiedUser.id;
                ctrl.user.delete(req, res, callback);
            });

        });

        describe('userVerify()', function() {

            beforeEach(function() {
                req = {
                    params: {
                        token: uuid.v4()
                    },
                    get: function() {
                        return 'localhost:1234'
                    }
                };
            });

            it('returns an error if no user matches the token',
                function(done) {
                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.EmailTokenNotFoundError));
                        done();
                    });

                    ctrl.user.verify(req, res, callback);

                });

            it('verifies a user via an email.', function(done) {
                res.json.and.callFake(function(response) {
                    expect(response).toEqual(new SuccessMessage(
                        'Your email has been verified.', undefined, [{
                            rel: 'self',
                            href: util.getUrl(req)
                        }, {
                            rel: 'verified',
                            href: jasmine.any(String)
                        }]));
                    done();
                });

                req.params.token = users.unverifiedUser.secret;
                ctrl.user.verify(req, res, callback);
            });

            it('checks if the user is valid before verifying.', function(done) {

                callback.and.callFake(function(err) {
                    expect(err).toEqual(
                        jasmine.any(errors.JsonSchemaValidationError));
                    expect(err.errors[0].message)
                        .toBe('Additional properties not allowed');
                    done();
                });

                req.params.token = users.invalidUser.secret;
                ctrl.user.verify(req, res, callback);

            });

        });

        describe('loginStrategy()', function() {

            beforeEach(function() {
                req = {
                    params: {token: uuid.v4()},
                    user: anonymousUser
                };
            });

            it('doesn\'t log in a non existent user.', function(done) {
                ctrl.strategy(newUser.email, newUser.password,
                    function(err) {
                        expect(err).toEqual(jasmine.any(errors.LoginError));
                        done();
                    });
            });

            it('doesn\'t log in a user with a bad password.', function(done) {

                ctrl.strategy(users.verifiedUser.email, 'BAD PASSWORD!',
                    function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.LoginError));
                        done();
                    });
            });

            it('logs in a valid user.', function(done) {

                ctrl.strategy(
                    users.verifiedUser.email,
                    users.verifiedUser.password,
                    function(err, user) {
                        expect(err).toBeNull();
                        expect(user.id).toEqual(users.verifiedUser.id);
                        done();
                    });

            });
        });

    });

});
